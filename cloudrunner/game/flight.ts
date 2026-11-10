import {
	BEST_GLIDE_SPEED,
	BURST_PARTICLES,
	CEILING,
	CRASH_CLEARANCE,
	CRASH_DURATION,
	DRAG_INDUCED,
	DRAG_PARASITE,
	GRAVITY,
	MAX_BANK,
	MAX_PITCH,
	MAX_SPEED,
	MAX_YAW_RATE,
	MIN_SPEED,
	PITCH_RATE,
	STALL_SPEED,
	TRIM_RATE,
	TURN_REF_SPEED,
	TURN_SINK,
	VARIO_LAG,
	TURNPOINT_FX_DURATION,
	TURNPOINTS_AHEAD,
} from "./constants";
import { FREE, type TaskSpec } from "./modes";
import { mulberry32, type Rand } from "./rng";
import { nextTurnpoint, startAltitude, type Turnpoint } from "./task";
import { surfaceHeight, type Terrain, type TerrainPhases, valleyTerrain } from "./terrain";
import { type Air, airAt } from "./air";
import { windOf } from "./thermals";

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
}

export type Phase = "flying" | "crashing" | "ended";
export type EndReason = "ground" | "time" | "complete";

export interface Particle { a: number; s: number; c: number }
export interface TurnpointFx { tp: Turnpoint; t: number }

export interface Sim {
	seed: number;
	spec: TaskSpec;
	terr: TerrainPhases;
	terrain: Terrain;
	rand: Rand;
	plane: Plane;
	camRoll: number;
	turnpoints: Turnpoint[];
	/** Index of the turnpoint being flown to, which is also how many have been reached. */
	next: number;
	/** Seconds flown, and when the last turnpoint was reached (the daily tie-break). */
	elapsed: number;
	lastTurnpointAt: number;
	/** Vertical speed of the glider (m/s, up) and of the air around it, from the last step. */
	climb: number;
	lift: number;
	/** The variometer: the climb rate as the instrument shows it, smoothed over about VARIO_LAG seconds. */
	vario: number;
	phase: Phase;
	endReason: EndReason | null;
	crashT: number;
	burst: Particle[];
	fx: TurnpointFx[];
	/** last stick input, for the control-surface animation */
	stick: { roll: number; pitch: number };
}

export type SimEvent =
	| { kind: "turnpoint"; index: number }
	| { kind: "crash" }
	| { kind: "timeout" }
	| { kind: "complete" }
	| { kind: "ended" };

export const NO_CONTROLS: Controls = { roll: 0, pitch: 0 };

/** Deceleration from drag at speed v (m/s²). */
export function dragAt(v: number): number {
	return DRAG_PARASITE * v * v + DRAG_INDUCED / (v * v);
}
/** Nose-down pitch (rad, negative) at which gravity balances drag, so speed v holds. */
export function trimPitch(v: number): number {
	return -Math.asin(Math.min(0.95, dragAt(v) / GRAVITY));
}
/** Metres flown per metre of height lost in a steady glide at speed v, in still air. */
export function glideRatio(v: number): number {
	return 1 / Math.tan(-trimPitch(v));
}
/** Height lost per second in a steady glide at speed v (m/s, positive). */
export function sinkRate(v: number): number {
	return v * Math.sin(-trimPitch(v));
}

export function createSim(seed: number, spec: TaskSpec = FREE): Sim {
	const rand = mulberry32(seed);
	const terr: TerrainPhases = [rand() * 6.28, rand() * 6.28, rand() * 6.28, rand() * 6.28];
	const turnpoints: Turnpoint[] = [];
	const ahead = spec.count ?? TURNPOINTS_AHEAD;
	for (let i = 0; i < ahead; i++) turnpoints.push(nextTurnpoint(turnpoints[i - 1] ?? null, rand));
	return {
		seed,
		spec,
		terr,
		terrain: valleyTerrain(terr),
		rand,
		plane: { x: 0, y: startAltitude(terr), z: 0, yaw: crabYaw(seed, 0, BEST_GLIDE_SPEED), pitch: trimPitch(BEST_GLIDE_SPEED), roll: 0, v: BEST_GLIDE_SPEED },
		camRoll: 0,
		turnpoints,
		next: 0,
		elapsed: 0,
		lastTurnpointAt: 0,
		climb: 0,
		lift: 0,
		vario: -sinkRate(BEST_GLIDE_SPEED),
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

/** Share of the glider's bank the chase camera leans with: low, so the horizon stays nearly level through a long circle. */
export const CAMERA_BANK = 0.16;

/** Heading (rad) whose ground track runs along `track` once the wind's drift is added, at airspeed v. */
export function crabYaw(seed: number, track: number, v: number): number {
	const w = windOf(seed);
	const cross = w.x * Math.cos(track) - w.z * Math.sin(track);
	return track - Math.asin(Math.max(-0.9, Math.min(0.9, cross / v)));
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function stepFx(sim: Sim, dt: number): void {
	for (const f of sim.fx) f.t += dt;
	if (sim.fx.length && (sim.fx[0]?.t ?? 0) > TURNPOINT_FX_DURATION) sim.fx = sim.fx.filter((f) => f.t <= TURNPOINT_FX_DURATION);
}

function crash(sim: Sim, events: SimEvent[]): void {
	sim.phase = "crashing";
	sim.endReason = "ground";
	sim.crashT = 0;
	const r = mulberry32(sim.seed + sim.next * 7919);
	sim.burst = [];
	for (let i = 0; i < BURST_PARTICLES; i++) sim.burst.push({ a: r() * 6.28, s: 0.4 + r(), c: i % 3 });
	events.push({ kind: "crash" });
}

const airScratch: Air = { up: 0, vx: 0, vz: 0 };

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

	// Attitude: the stick banks and pitches. Released, the nose settles onto
	// the glide that holds the current speed, so hands off is a steady glide.
	p.roll += (ctl.roll * MAX_BANK - p.roll) * Math.min(1, 3 * dt);
	p.pitch += ctl.pitch * PITCH_RATE * dt;
	if (Math.abs(ctl.pitch) < 0.05) p.pitch += (trimPitch(p.v) - p.pitch) * Math.min(1, TRIM_RATE * dt);
	if (p.v < STALL_SPEED) p.pitch -= (STALL_SPEED - p.v) * 0.04 * dt;
	p.pitch = clamp(p.pitch, -MAX_PITCH, MAX_PITCH);
	// Bank turns the glider: a little quicker when slow, a little slower when fast.
	const bank = p.roll / MAX_BANK;
	p.yaw += bank * MAX_YAW_RATE * clamp(TURN_REF_SPEED / p.v, 0.6, 1.25) * dt;
	// No engine: speed changes only from drag and from gravity along the flight path.
	const acc = -dragAt(p.v) - GRAVITY * Math.sin(p.pitch);
	p.v = clamp(p.v + acc * dt, MIN_SPEED, MAX_SPEED);

	// Move through the air, drift with the wind, and let the air carry the glider up or down.
	const f = forward(p);
	const air = airAt(sim.seed, sim.terr, p.x, p.y, p.z, sim.elapsed, airScratch);
	sim.lift = air.up;
	sim.climb = f[1] * p.v + sim.lift - TURN_SINK * bank * bank;
	p.x += (f[0] * p.v + air.vx) * dt;
	p.y += sim.climb * dt;
	p.z += (f[2] * p.v + air.vz) * dt;
	sim.vario += (sim.climb - sim.vario) * Math.min(1, dt / VARIO_LAG);
	if (p.y > CEILING) {
		p.y = CEILING;
		p.pitch = Math.min(p.pitch, 0);
	}
	sim.elapsed += dt;
	sim.camRoll += (p.roll * CAMERA_BANK - sim.camRoll) * Math.min(1, 2.5 * dt);

	const tp = sim.turnpoints[sim.next];
	if (tp && Math.hypot(p.x - tp.x, p.z - tp.z) < tp.r) {
		sim.fx.push({ tp, t: 0 });
		events.push({ kind: "turnpoint", index: sim.next });
		sim.next++;
		sim.lastTurnpointAt = sim.elapsed;
		if (sim.spec.count === null) sim.turnpoints.push(nextTurnpoint(sim.turnpoints[sim.turnpoints.length - 1] ?? null, sim.rand));
		else if (sim.next >= sim.spec.count) {
			sim.phase = "ended";
			sim.endReason = "complete";
			events.push({ kind: "complete" });
			return;
		}
	}
	if (p.y <= groundBelow(sim) + CRASH_CLEARANCE) crash(sim, events);
	else if (sim.spec.timeLimit !== null && sim.elapsed >= sim.spec.timeLimit) {
		sim.phase = "ended";
		sim.endReason = "time";
		events.push({ kind: "timeout" });
	}
}
