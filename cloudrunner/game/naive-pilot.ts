/**
 * The strategy a first-time player is told on the menu, as a controller: fly
 * to the nearest cloud; when the variometer shows a climb, hold half bank;
 * when it turns to sink, head for the next beacon; when getting low, go and
 * find another cloud. It reads only what the screen shows (the variometer,
 * the height above the ground, the clouds in sight and the beacon), so it is
 * the bar the tuning has to clear: a newcomer doing the obvious thing finishes.
 */
import type { Controls, Sim } from "./flight";
import { thermalsNear } from "./thermals";

/** Clouds farther than this (m) are too small to pick out. */
export const NAIVE_VIEW_RANGE = 2600;
/** A cloud this faint (thermal life 0…1) is not worth flying to. */
const MIN_CLOUD = 0.35;
/** Below this height above the ground (m) the pilot stops pressing on and goes looking for a cloud. */
const LOW = 220;
/** Bank held while circling: half stick. */
export const NAIVE_BANK = 0.5;

export interface NaiveState {
	mode: "seek" | "circle" | "beacon";
}

export const newNaiveState = (): NaiveState => ({ mode: "seek" });

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function steer(sim: Sim, x: number, z: number): number {
	const p = sim.plane;
	return clamp(wrap(Math.atan2(x - p.x, z - p.z) - p.yaw) * 2, -1, 1);
}

/** One step of the naive strategy. `agl` is the height above the ground the HUD shows. */
export function naivePilot(sim: Sim, state: NaiveState, agl: number): Controls {
	const p = sim.plane;
	const vario = sim.vario;
	if (vario > 0) state.mode = "circle";
	else if (state.mode === "circle") state.mode = "beacon";
	if (state.mode === "beacon" && agl < LOW) state.mode = "seek";
	if (state.mode === "circle") return { roll: NAIVE_BANK, pitch: 0 };
	const tp = sim.turnpoints[sim.next];
	if (state.mode === "seek") {
		let best = Number.POSITIVE_INFINITY, bx = 0, bz = 0;
		for (const th of thermalsNear(sim.seed, p.x, p.z, sim.elapsed, 3)) {
			const d = Math.hypot(th.x - p.x, th.z - p.z);
			if (th.life < MIN_CLOUD || d > NAIVE_VIEW_RANGE || d >= best) continue;
			best = d;
			bx = th.x;
			bz = th.z;
		}
		if (best < Number.POSITIVE_INFINITY) return { roll: steer(sim, bx, bz), pitch: 0 };
	}
	return tp ? { roll: steer(sim, tp.x, tp.z), pitch: 0 } : { roll: 0, pitch: 0 };
}
