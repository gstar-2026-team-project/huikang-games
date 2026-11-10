import {
	BURST_PARTICLES,
	CEILING,
	CRASH_CLEARANCE,
	CRASH_DURATION,
	CRUISE_SPEED,
	DRAG,
	levelSpeed,
	MAX_PITCH,
	MAX_SPEED,
	MAX_YAW_RATE,
	MIN_SPEED,
	MISS_PAST_DISTANCE,
	PITCH_RATE,
	RING_FX_DURATION,
	RINGS_AHEAD,
	STALL_SPEED,
	START_THROTTLE,
} from "./constants";
import { nextRing, type Ring, startAltitude } from "./course";
import { missionTerrain } from "./mission";
import { type CourseSpec, ENDLESS } from "./modes";
import { mulberry32, type Rand } from "./rng";
import { canyonTerrain, type PathPoint } from "./canyon";
import { surfaceHeight, type Terrain, type TerrainPhases, valleyTerrain } from "./terrain";

export interface Plane {
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
	roll: number;
	v: number;
}

export interface Controls {
	/** -1 bank left … 1 bank right */
	roll: number;
	/** -1 nose down … 1 nose up (already inverted if the pilot asked) */
	pitch: number;
	/** throttle change per second from keys; the slider sets it directly */
	throttleRate: number;
}

export type Phase = "flying" | "crashing" | "ended";
export type EndReason = "ground" | "time" | "complete";

export interface Particle { a: number; s: number; c: number }
export interface RingFx { ring: Ring; t: number }

export interface Sim {
	seed: number;
	spec: CourseSpec;
	terr: TerrainPhases;
	terrain: Terrain;
	rand: Rand;
	plane: Plane;
	camRoll: number;
	throttle: number;
	rings: Ring[];
	next: number;
	score: number;
	timeLeft: number;
	/** seconds flown, and when the last ring was hit (for the daily tie-break) */
	elapsed: number;
	lastRingAt: number;
	phase: Phase;
	endReason: EndReason | null;
	crashT: number;
	burst: Particle[];
	fx: RingFx[];
	/** last stick input, for the control-surface animation */
	stick: { roll: number; pitch: number };
}

export type SimEvent =
	| { kind: "ring"; index: number; bonus: number }
	| { kind: "miss"; index: number }
	| { kind: "crash" }
	| { kind: "timeout" }
	| { kind: "complete" }
	| { kind: "ended" };

export const NO_CONTROLS: Controls = { roll: 0, pitch: 0, throttleRate: 0 };

export function createSim(seed: number, spec: CourseSpec = ENDLESS): Sim {
	const rand = mulberry32(seed);
	const terr: TerrainPhases = [rand() * 6.28, rand() * 6.28, rand() * 6.28, rand() * 6.28];
	if (spec.authored) {
		const rings = spec.authored.rings();
		return baseSim(seed, spec, terr, missionTerrain(terr, rings, spec), rand, rings, rings[0]?.y ?? 40);
	}
	const rings: Ring[] = [];
	// A canyon is carved along the whole course, so a canyon level lays out every ring up front.
	const ahead = spec.canyon ? (spec.ringCount ?? RINGS_AHEAD) : Math.min(RINGS_AHEAD, spec.ringCount ?? RINGS_AHEAD);
	for (let i = 0; i < ahead; i++) rings.push(nextRing(rings[i - 1] ?? null, i, rand, terr, spec));
	const terrain = spec.canyon ? canyonTerrain(terr, canyonPath(rings), spec.canyon) : valleyTerrain(terr);
	return baseSim(seed, spec, terr, terrain, rand, rings, spec.canyon ? (rings[0]?.y ?? 60) : startAltitude(terr));
}

function baseSim(seed: number, spec: CourseSpec, terr: TerrainPhases, terrain: Terrain, rand: Rand, rings: Ring[], y: number): Sim {
	return {
		seed,
		spec,
		terr,
		terrain,
		rand,
		plane: { x: 0, y, z: 0, yaw: 0, pitch: 0, roll: 0, v: CRUISE_SPEED },
		camRoll: 0,
		throttle: START_THROTTLE,
		rings,
		next: 0,
		score: 0,
		timeLeft: spec.startTime,
		elapsed: 0,
		lastRingAt: 0,
		phase: "flying",
		endReason: null,
		crashT: 0,
		burst: [],
		fx: [],
		stick: { roll: 0, pitch: 0 },
	};
}

export function forward(p: Plane): [number, number, number] {
	const c = Math.cos(p.pitch);
	return [Math.sin(p.yaw) * c, Math.sin(p.pitch), Math.cos(p.yaw) * c];
}

export function groundBelow(sim: Sim): number {
	return surfaceHeight(sim.terrain, sim.plane.x, sim.plane.z);
}

const CANYON_LEAD_IN = 900; // straight canyon behind the take-off point
const CANYON_RUN_OUT = 1400; // and beyond the last ring

/** Centre line of a canyon: a straight lead-in, through every ring, then a run-out. */
function canyonPath(rings: readonly Ring[]): PathPoint[] {
	const pts: PathPoint[] = [{ x: 0, z: -CANYON_LEAD_IN }, { x: 0, z: 0 }];
	for (const r of rings) pts.push({ x: r.x, z: r.z });
	const last = rings[rings.length - 1];
	if (last) pts.push({ x: last.x + Math.sin(last.yaw) * CANYON_RUN_OUT, z: last.z + Math.cos(last.yaw) * CANYON_RUN_OUT });
	return pts;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function advanceRing(sim: Sim, hit: boolean, events: SimEvent[]): void {
	const ring = sim.rings[sim.next];
	if (!ring) return;
	ring.hit = hit;
	sim.fx.push({ ring, t: 0 });
	if (hit) {
		sim.score++;
		sim.lastRingAt = sim.elapsed;
		const bonus = sim.spec.bonus(sim.next);
		sim.timeLeft += bonus;
		events.push({ kind: "ring", index: sim.next, bonus });
	} else events.push({ kind: "miss", index: sim.next });
	sim.next++;
	const count = sim.spec.ringCount;
	if (count !== null && sim.rings.length >= count) return;
	const last = sim.rings[sim.rings.length - 1] ?? null;
	sim.rings.push(nextRing(last, sim.rings.length, sim.rand, sim.terr, sim.spec));
}

function stepFx(sim: Sim, dt: number): void {
	for (const f of sim.fx) f.t += dt;
	if (sim.fx.length && (sim.fx[0]?.t ?? 0) > RING_FX_DURATION) sim.fx = sim.fx.filter((f) => f.t <= RING_FX_DURATION);
}

function crash(sim: Sim, events: SimEvent[]): void {
	sim.phase = "crashing";
	sim.endReason = "ground";
	sim.crashT = 0;
	const r = mulberry32(sim.seed + sim.score * 7919);
	sim.burst = [];
	for (let i = 0; i < BURST_PARTICLES; i++) sim.burst.push({ a: r() * 6.28, s: 0.4 + r(), c: i % 3 });
	events.push({ kind: "crash" });
}

/** One fixed step of flight. Pushes what happened into `events`. */
export function stepSim(sim: Sim, ctl: Controls, dt: number, events: SimEvent[]): void {
	stepFx(sim, dt);
	if (sim.phase === "crashing") {
		sim.crashT += dt;
		if (sim.crashT >= CRASH_DURATION) {
			sim.phase = "ended";
			events.push({ kind: "ended" });
		}
		return;
	}
	if (sim.phase !== "flying") return;
	const p = sim.plane;
	sim.stick.roll = ctl.roll;
	sim.stick.pitch = ctl.pitch;
	sim.throttle = clamp(sim.throttle + ctl.throttleRate * dt, 0, 1);

	// Attitude: the stick banks and pitches; the nose eases level when released.
	p.roll += (ctl.roll * 1.1 - p.roll) * Math.min(1, 3 * dt);
	p.pitch += ctl.pitch * PITCH_RATE * dt;
	if (Math.abs(ctl.pitch) < 0.05) p.pitch *= 1 - 0.35 * dt;
	if (p.v < STALL_SPEED) p.pitch -= (STALL_SPEED - p.v) * 0.04 * dt;
	p.pitch = clamp(p.pitch, -MAX_PITCH, MAX_PITCH);
	// Coordinated turn from bank angle.
	const yawRate = (9.81 * Math.tan(p.roll)) / Math.max(p.v, 25);
	p.yaw += clamp(yawRate, -MAX_YAW_RATE, MAX_YAW_RATE) * dt;
	// Speed: thrust, drag, and gravity along the flight path.
	const thrust = DRAG * levelSpeed(sim.throttle) ** 2;
	const acc = thrust - DRAG * p.v * p.v - 9.81 * Math.sin(p.pitch);
	p.v = clamp(p.v + acc * dt, MIN_SPEED, MAX_SPEED);

	// Move, and score a ring only once the plane has crossed its plane.
	const ring = sim.rings[sim.next];
	const nx = ring ? Math.sin(ring.yaw) : 0;
	const nz = ring ? Math.cos(ring.yaw) : 1;
	const d0 = ring ? (p.x - ring.x) * nx + (p.z - ring.z) * nz : 0;
	const f = forward(p);
	p.x += f[0] * p.v * dt;
	p.y += f[1] * p.v * dt;
	p.z += f[2] * p.v * dt;
	if (p.y > CEILING) {
		p.y = CEILING;
		p.pitch = Math.min(p.pitch, 0);
	}
	if (ring) {
		const d1 = (p.x - ring.x) * nx + (p.z - ring.z) * nz;
		if (d0 < 0 && d1 >= 0) {
			const lx = p.x - ring.x - nx * d1;
			const lz = p.z - ring.z - nz * d1;
			advanceRing(sim, Math.hypot(lx, p.y - ring.y, lz) < ring.r, events);
		} else if (d1 > MISS_PAST_DISTANCE) advanceRing(sim, false, events);
	}

	// A finite course ends cleanly once its last ring has been reached.
	if (sim.spec.ringCount !== null && sim.next >= sim.spec.ringCount) {
		sim.phase = "ended";
		sim.endReason = "complete";
		events.push({ kind: "complete" });
		return;
	}
	sim.timeLeft -= dt;
	sim.elapsed += dt;
	sim.camRoll += (p.roll * 0.75 - sim.camRoll) * Math.min(1, 2.5 * dt);
	if (p.y <= groundBelow(sim) + CRASH_CLEARANCE) crash(sim, events);
	else if (sim.timeLeft <= 0) {
		sim.timeLeft = 0;
		sim.phase = "ended";
		sim.endReason = "time";
		events.push({ kind: "timeout" });
	}
}
