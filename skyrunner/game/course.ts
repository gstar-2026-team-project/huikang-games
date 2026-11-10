import {
	CRUISE_SPEED,
	SLOW_GATE,
	FIRST_RING_DISTANCE,
	MAX_PITCH,
	MAX_YAW_RATE,
	MIN_START_ALTITUDE,
	RING_DISTANCE_MIN,
	RING_DISTANCE_SPREAD,
	RING_MAX_ALTITUDE,
	START_CLEARANCE,
} from "./constants";
import { type CourseSpec, ENDLESS, type Gate } from "./modes";
import type { Rand } from "./rng";
import { highestGround, type TerrainPhases, terrainHeight } from "./terrain";

export interface Ring {
	x: number;
	y: number;
	z: number;
	yaw: number;
	r: number;
	/** null until the plane reaches it; then whether it flew through. */
	hit: boolean | null;
	/** The strike mission's target ring. */
	target?: boolean;
	/** Speed gate: pass below SLOW_GATE or above FAST_GATE. */
	gate?: Gate;
}

/** Endless-course ring size: starts wide and shrinks to a floor. */
export const ringRadius = (index: number): number => ENDLESS.radius(index);
/** Endless-course time bonus: generous early, with a floor that still pays. */
export const ringBonus = (index: number): number => ENDLESS.bonus(index);

/**
 * Fairness bounds from the flight model: the plane has `dist / CRUISE_SPEED`
 * seconds to line up, and the course asks for at most a third of the heading
 * change and two fifths of the climb it could manage in that time.
 */
export function maxTurnFor(dist: number): number {
	return MAX_YAW_RATE * (dist / CRUISE_SPEED) * 0.3;
}
export function maxClimbFor(dist: number): number {
	return dist * Math.sin(MAX_PITCH) * 0.4;
}

/** The plane's take-off altitude: level with the first ring, clear of the hills. */
export function startAltitude(t: TerrainPhases): number {
	const ground = highestGround(t, 0, 0, 0, FIRST_RING_DISTANCE + 60);
	return Math.max(MIN_START_ALTITUDE, ground + START_CLEARANCE);
}

/** Next ring of the course. The first is straight ahead, level with the plane. */
export function nextRing(
	prev: Ring | null,
	index: number,
	rand: Rand,
	t: TerrainPhases,
	spec: CourseSpec = ENDLESS,
): Ring {
	if (spec.canyon) return canyonRing(prev, index, rand, spec);
	if (!prev) {
		return { x: 0, y: startAltitude(t), z: FIRST_RING_DISTANCE, yaw: 0, r: spec.radius(0), hit: null };
	}
	const dist = RING_DISTANCE_MIN + rand() * RING_DISTANCE_SPREAD;
	const wanted = spec.turn(index);
	const turn = Math.min(wanted, maxTurnFor(dist));
	const yaw = prev.yaw + (rand() * 2 - 1) * turn;
	const x = prev.x + Math.sin(yaw) * dist;
	const z = prev.z + Math.cos(yaw) * dist;
	const climb = maxClimbFor(dist);
	const ground = highestGround(t, prev.x, prev.z, x, z);
	const here = terrainHeight(t, x, z);
	let y = here + 90 + rand() * 200;
	y = Math.min(y, prev.y + climb);
	y = Math.max(y, prev.y - climb);
	y = Math.max(y, ground + 70, here + 60);
	y = Math.min(y, RING_MAX_ALTITUDE);
	return { x, y, z, yaw, r: spec.radius(index), hit: null };
}

/** Canyon rings fly low over the river; the canyon is carved along them afterwards. */
function canyonRing(prev: Ring | null, index: number, rand: Rand, spec: CourseSpec): Ring {
	const r = spec.radius(index);
	const floor = r + 18; // ring bottom at least 18 m above the water
	const span = Math.min(70, (spec.canyon?.rim ?? 140) * 0.35);
	if (!prev) return { x: 0, y: floor + span * 0.4, z: FIRST_RING_DISTANCE, yaw: 0, r, hit: null };
	const dist = RING_DISTANCE_MIN + rand() * RING_DISTANCE_SPREAD;
	const gate = spec.gate?.(index);
	const side = rand() * 2 - 1;
	// Slow gates end a hairpin only a slow plane can make; fast gates sit on straights.
	const yaw =
		gate === "slow"
			? prev.yaw + Math.sign(side || 1) * Math.min(HAIRPIN, maxTurnAt(dist, SLOW_GATE))
			: gate === "fast"
				? prev.yaw + side * 0.08
				: prev.yaw + side * Math.min(spec.turn(index), maxTurnFor(dist));
	const climb = maxClimbFor(dist);
	let y = floor + rand() * span;
	if (gate) y = Math.min(y, prev.y + climb * 0.3); // no big climb into a gate: speed is the test
	y = Math.max(prev.y - climb, Math.min(prev.y + climb, y));
	return {
		x: prev.x + Math.sin(yaw) * dist, y: Math.max(floor, y), z: prev.z + Math.cos(yaw) * dist, yaw, r, hit: null,
		...(gate ? { gate } : {}),
	};
}

/** Heading change of a slow-gate hairpin (rad). */
const HAIRPIN = 0.9;
/** Turn rate at full bank for a given speed (rad/s), from the coordinated-turn model. */
export function yawRateAt(v: number): number {
	return Math.min(MAX_YAW_RATE, (9.81 * Math.tan(1.1)) / Math.max(v, 25));
}
/** Largest turn asked over `dist` at speed `v`: under half of what full bank could do. */
export function maxTurnAt(dist: number, v: number): number {
	return yawRateAt(v) * (dist / v) * 0.45;
}
