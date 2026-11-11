/**
 * What the two pointer chips under the HUD show: the next beacon, and the
 * nearest live thermal worth flying to. Pure, so the HUD only formats it.
 */
import type { Sim } from "./flight";
import { thermalsNear } from "./thermals";

/** A thermal this built-up (0…1) is worth pointing at; a younger or dying one is not. */
export const LIFT_WORTH = 0.3;
/** Within this share of a thermal's radius the glider is in its lift: the lift chip hides. */
export const IN_LIFT_SHARE = 0.6;

/** Bearing of (x, z) from the glider relative to its heading, in radians: 0 dead ahead, positive to the right. */
export function relativeBearing(sim: Sim, x: number, z: number): number {
	const p = sim.plane;
	let a = Math.atan2(x - p.x, z - p.z) - p.yaw;
	a = ((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
	return a;
}

export interface Pointer {
	/** Relative bearing, radians (see relativeBearing). */
	rel: number;
	/** Horizontal distance, metres. */
	dist: number;
}

/** The next beacon, or null once the task is done. */
export function beaconPointer(sim: Sim): Pointer | null {
	const tp = sim.turnpoints[sim.next];
	if (!tp) return null;
	const p = sim.plane;
	return { rel: relativeBearing(sim, tp.x, tp.z), dist: Math.hypot(tp.x - p.x, tp.z - p.z) };
}

/**
 * The live thermal to point at: the nearest one, favouring those ahead (one
 * straight behind counts as half again as far). Null once the glider is in a
 * thermal's lift and `climbing` (so the chip goes as the climb meter turns
 * green, never before), or when none is near.
 */
export function liftPointer(sim: Sim, climbing: boolean): Pointer | null {
	const p = sim.plane;
	let best: Pointer | null = null;
	let bestScore = Number.POSITIVE_INFINITY;
	for (const th of thermalsNear(sim.seed, p.x, p.z, sim.elapsed, 2)) {
		const dist = Math.hypot(th.x - p.x, th.z - p.z);
		if (climbing && dist < th.radius * IN_LIFT_SHARE && th.strength > 1) return null;
		if (th.life < LIFT_WORTH) continue;
		const rel = relativeBearing(sim, th.x, th.z);
		const score = dist * (1.25 - 0.25 * Math.cos(rel));
		if (score < bestScore) {
			bestScore = score;
			best = { rel, dist };
		}
	}
	return best;
}
