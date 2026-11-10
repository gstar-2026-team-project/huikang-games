import {
	FIRST_TURNPOINT_DISTANCE,
	MIN_START_ALTITUDE,
	START_CLEARANCE,
	TURNPOINT_DISTANCE_MIN,
	TURNPOINT_DISTANCE_SPREAD,
	TURNPOINT_RADIUS,
	TURNPOINT_TURN_MAX,
	TURNPOINT_TURN_MIN,
} from "./constants";
import type { Rand } from "./rng";
import { highestGround, type TerrainPhases } from "./terrain";

/** A vertical beacon: reached when the glider is within `r` metres of it on the map, at any height. */
export interface Turnpoint {
	x: number;
	z: number;
	r: number;
	/** Heading of the leg that arrives here (rad). */
	yaw: number;
}

/** Launch height: well clear of every hill between the launch point and the first beacon. */
export function startAltitude(t: TerrainPhases): number {
	const ground = highestGround(t, 0, 0, 0, FIRST_TURNPOINT_DISTANCE + 100, 10);
	return Math.max(MIN_START_ALTITUDE, ground + START_CLEARANCE);
}

/**
 * Next turnpoint of the task. The first is dead ahead of the launch point, so a
 * hands-off glide reaches it; every later leg turns by a modest angle, so
 * nobody finishes without steering.
 */
export function nextTurnpoint(prev: Turnpoint | null, rand: Rand): Turnpoint {
	if (!prev) return { x: 0, z: FIRST_TURNPOINT_DISTANCE, r: TURNPOINT_RADIUS, yaw: 0 };
	const dist = TURNPOINT_DISTANCE_MIN + rand() * TURNPOINT_DISTANCE_SPREAD;
	const side = rand() < 0.5 ? -1 : 1;
	const yaw = prev.yaw + side * (TURNPOINT_TURN_MIN + rand() * (TURNPOINT_TURN_MAX - TURNPOINT_TURN_MIN));
	return { x: prev.x + Math.sin(yaw) * dist, z: prev.z + Math.cos(yaw) * dist, r: TURNPOINT_RADIUS, yaw };
}
