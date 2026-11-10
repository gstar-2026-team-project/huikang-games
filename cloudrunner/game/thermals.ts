/**
 * The rising air. A deterministic, stateless field: every thermal is derived
 * by hashing (seed, grid cell, time epoch), so the sim, the renderer, the map
 * and the autopilot all ask the same pure functions and always agree.
 */

/** Grid spacing (m): each cell grows at most one thermal at a time. */
export const THERMAL_CELL = 700;
/** Each cell starts a new thermal this often (s), at its own phase. */
export const THERMAL_PERIOD = 75;
export const THERMAL_LIFE_MIN = 45;
export const THERMAL_LIFE_SPREAD = 20;
export const THERMAL_RADIUS_MIN = 140;
export const THERMAL_RADIUS_SPREAD = 70;
/** Lift at the core (m/s). */
export const THERMAL_STRENGTH_MIN = 11;
export const THERMAL_STRENGTH_SPREAD = 5;
/** A thermal builds over RAMP seconds and collapses over the last FADE seconds. */
export const THERMAL_RAMP = 6;
export const THERMAL_FADE = 9;
/** The inner part of the column lifts at full strength; outside it the lift falls to zero at the edge. */
export const THERMAL_CORE = 0.35;
/** Lift dies away over the last CLOUD_FADE metres below the cloud base. */
export const CLOUD_BASE = 1100;
export const CLOUD_FADE = 120;
/** Thermals drift downwind at this speed (m/s), in a direction fixed per seed. */
export const WIND_MIN = 1.5;
export const WIND_SPREAD = 2;

/** The opening thermal every flight gets, just ahead of the launch point. */
export const START_THERMAL = { x: 30, z: 470, radius: 190, strength: 13, life: 40 } as const;
/** No ordinary thermal is born this close to the opening one while it lives. */
const START_KEEP_OUT = 420;

export interface Thermal {
	/** Stable for the thermal's whole life. */
	id: number;
	x: number;
	z: number;
	radius: number;
	/** Core lift right now (m/s), after the build-up and collapse. */
	strength: number;
	/** Core lift once fully built (m/s). */
	peak: number;
	/** 0…1: how built-up it is right now; drives the cloud's size and opacity. */
	life: number;
	/** Seconds until it is gone. */
	remaining: number;
}

function hash(a: number, b: number, c: number, d: number): number {
	let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
	h = Math.imul((h ^ (h >>> 15)) + b, 0xc2b2ae35);
	h = Math.imul((h ^ (h >>> 13)) + c, 0x27d4eb2f);
	h = Math.imul((h ^ (h >>> 16)) + d, 0x165667b1);
	h ^= h >>> 15;
	h = Math.imul(h, 0x2c1b3c6d);
	return (h ^ (h >>> 12)) >>> 0;
}
/** Uniform in [0, 1) from four integers. */
const unit = (a: number, b: number, c: number, d: number) => hash(a, b, c, d) / 4294967296;

/** The seed's wind (m/s along x and z): thermals drift with it. */
export function windOf(seed: number): { x: number; z: number } {
	const dir = unit(seed, 11, 0, 0) * Math.PI * 2;
	const speed = WIND_MIN + unit(seed, 12, 0, 0) * WIND_SPREAD;
	return { x: Math.sin(dir) * speed, z: Math.cos(dir) * speed };
}

/** Build-up and collapse: 0 at birth, 1 while mature, 0 again at the end. */
function envelope(age: number, life: number, ramp: number): number {
	if (age < 0 || age >= life) return 0;
	const up = ramp > 0 ? Math.min(1, age / ramp) : 1;
	const down = Math.min(1, (life - age) / THERMAL_FADE);
	const e = Math.min(up, down);
	return e * e * (3 - 2 * e);
}

/** Fill `out` with the opening thermal at time t; false once it has collapsed. */
function startThermal(seed: number, t: number, out: Thermal): boolean {
	if (t < 0 || t >= START_THERMAL.life) return false;
	const wind = windOf(seed);
	const e = envelope(t, START_THERMAL.life, 0);
	out.id = -1;
	out.x = START_THERMAL.x + wind.x * t;
	out.z = START_THERMAL.z + wind.z * t;
	out.radius = START_THERMAL.radius;
	out.strength = START_THERMAL.strength * e;
	out.peak = START_THERMAL.strength;
	out.life = e;
	out.remaining = START_THERMAL.life - t;
	return true;
}

/** Fill `out` with cell (cx, cz)'s thermal at time t; false when the cell is quiet. */
function cellThermal(seed: number, cx: number, cz: number, t: number, out: Thermal): boolean {
	const shifted = t + unit(seed, cx, cz, 1) * THERMAL_PERIOD;
	const epoch = Math.floor(shifted / THERMAL_PERIOD);
	const age = shifted - epoch * THERMAL_PERIOD;
	const life = THERMAL_LIFE_MIN + unit(seed, cx, cz, epoch * 8 + 2) * THERMAL_LIFE_SPREAD;
	if (age >= life) return false;
	const bx = (cx + 0.15 + 0.7 * unit(seed, cx, cz, epoch * 8 + 3)) * THERMAL_CELL;
	const bz = (cz + 0.15 + 0.7 * unit(seed, cx, cz, epoch * 8 + 4)) * THERMAL_CELL;
	// Born inside the opening thermal's patch while that one lives: the cell skips a turn.
	const born = t - age;
	if (born < START_THERMAL.life && Math.hypot(bx - START_THERMAL.x, bz - START_THERMAL.z) < START_KEEP_OUT) return false;
	const wind = windOf(seed);
	const e = envelope(age, life, THERMAL_RAMP);
	out.id = hash(seed, cx, cz, epoch * 8 + 5);
	out.x = bx + wind.x * age;
	out.z = bz + wind.z * age;
	out.radius = THERMAL_RADIUS_MIN + unit(seed, cx, cz, epoch * 8 + 6) * THERMAL_RADIUS_SPREAD;
	out.peak = THERMAL_STRENGTH_MIN + unit(seed, cx, cz, epoch * 8 + 7) * THERMAL_STRENGTH_SPREAD;
	out.strength = out.peak * e;
	out.life = e;
	out.remaining = life - age;
	return true;
}

const blank = (): Thermal => ({ id: 0, x: 0, z: 0, radius: 1, strength: 0, peak: 0, life: 0, remaining: 0 });

/**
 * Every live thermal in the cells within `reach` cells of (x, z) at time t,
 * plus the opening thermal while it lasts. `reach` 1 covers every thermal that
 * can lift a glider at (x, z); the map and the planner look further.
 */
export function thermalsNear(seed: number, x: number, z: number, t: number, reach = 1): Thermal[] {
	const out: Thermal[] = [];
	const cx = Math.floor(x / THERMAL_CELL), cz = Math.floor(z / THERMAL_CELL);
	let th = blank();
	if (startThermal(seed, t, th)) {
		const span = (reach + 1) * THERMAL_CELL;
		if (Math.abs(th.x - x) < span && Math.abs(th.z - z) < span) {
			out.push(th);
			th = blank();
		}
	}
	for (let j = -reach; j <= reach; j++) {
		for (let i = -reach; i <= reach; i++) {
			if (cellThermal(seed, cx + i, cz + j, t, th)) {
				out.push(th);
				th = blank();
			}
		}
	}
	return out;
}

/** Share of a thermal's core lift at `dist` metres from its centre: 1 in the core, 0 at the edge. */
export function liftProfile(dist: number, radius: number): number {
	const u = dist / radius;
	if (u >= 1) return 0;
	if (u <= THERMAL_CORE) return 1;
	return 0.5 * (1 + Math.cos((Math.PI * (u - THERMAL_CORE)) / (1 - THERMAL_CORE)));
}

/** How much of the lift is left at height y: all of it low down, none at the cloud base. */
export function cloudFade(y: number): number {
	return Math.max(0, Math.min(1, (CLOUD_BASE - y) / CLOUD_FADE));
}

const scratch = blank();

/** Vertical speed of the air (m/s, up) at a point and time. Allocation-free: the sim calls it every step. */
export function liftAt(seed: number, x: number, y: number, z: number, t: number): number {
	const fade = cloudFade(y);
	if (fade <= 0) return 0;
	let best = 0;
	if (startThermal(seed, t, scratch)) {
		best = scratch.strength * liftProfile(Math.hypot(x - scratch.x, z - scratch.z), scratch.radius);
	}
	const cx = Math.floor(x / THERMAL_CELL), cz = Math.floor(z / THERMAL_CELL);
	for (let j = -1; j <= 1; j++) {
		for (let i = -1; i <= 1; i++) {
			if (!cellThermal(seed, cx + i, cz + j, t, scratch)) continue;
			const lift = scratch.strength * liftProfile(Math.hypot(x - scratch.x, z - scratch.z), scratch.radius);
			if (lift > best) best = lift;
		}
	}
	return best * fade;
}
