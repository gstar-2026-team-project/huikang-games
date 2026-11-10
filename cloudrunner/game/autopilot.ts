/**
 * A pure autopilot: the fairness proof for every task, and the plan the
 * "Ideal path" toggle draws. It heads for the next turnpoint when that is
 * within gliding range with a margin; otherwise it flies to the best live
 * thermal roughly on the way and circles in it until it is high enough.
 * The plan is a function of the sim alone, so it can be recomputed any time.
 */
import { BEST_GLIDE_SPEED, MAX_PITCH } from "./constants";
import { type Controls, type Sim, sinkRate, trimPitch } from "./flight";
import type { Turnpoint } from "./task";
import { terrainHeight, type TerrainPhases } from "./terrain";
import { CLOUD_BASE, cloudFade, liftProfile, THERMAL_FADE, type Thermal, thermalsNear } from "./thermals";

/** Glide the planner counts on (the real one is better: that is the margin). */
export const PLAN_GLIDE = 6.2;
/** Speeds the autopilot flies (m/s): circling, cruising between climbs, and with height to spare. */
export const CLIMB_SPEED = 27;
export const CRUISE_SPEED = BEST_GLIDE_SPEED + 8;
export const DASH_SPEED = 50;
/** Height above the ground to keep on the way (m), and to arrive with at a turnpoint or a thermal. */
const PATH_CLEARANCE = 60;
const TURNPOINT_ARRIVAL = 130;
const FINAL_ARRIVAL = 40;
const THERMAL_ARRIVAL = 90;
/** The planner stops climbing this far below the cloud base, where the lift has faded. */
const TOP_OF_CLIMB = CLOUD_BASE - 75;
/** Legs past the next turnpoint the planner wants height for (free flight never ends). */
const LEGS_AHEAD = 2;
/** A thermal is "entered" within this share of its radius, and "left" beyond the second. */
const ENTER = 0.6;
const LEAVE = 0.95;
/** Stop in lift met on the way only when at least this much height is still wanted (m). */
const WORTH_STOPPING = 60;
/** Leave a collapsing thermal this many seconds before it is gone. */
const LEAVE_BEFORE = 3;
/** A thermal is worth flying to only if it will still give this many seconds of climb on arrival. */
const MIN_CLIMB_SECONDS = 8;
/** Radius the autopilot circles at (m): inside the core of any thermal. */
const CIRCLE_RADIUS = 62;
/** Seconds lost finding the core of a thermal before the climb settles. */
const CENTERING_SECONDS = 5;
/**
 * How picky the planner is: with HEIGHT_IN_HAND metres more than the turnpoint
 * needs, a thermal must be worth GOOD_CLIMB m/s to be flown to; with none to
 * spare, any thermal will do.
 */
const GOOD_CLIMB = 2;
const HEIGHT_IN_HAND = 250;
const PATH_SAMPLES = 8;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
/** More than this far off the line (rad) and this close to the target (m), fly TURN_SPEED to turn tightly. */
const TURN_SLOWLY = 0.5;
const TURN_SLOWLY_WITHIN = 700;
const TURN_SPEED = 30;

export interface Plan {
	/** glide: straight to the turnpoint. seek: on the way to a thermal. climb: circling in one. */
	mode: "glide" | "seek" | "climb";
	thermal: Thermal | null;
	turnpoint: Turnpoint | null;
	/** Height (m) the glider needs here to reach the turnpoint with the planner's margins. */
	need: number;
	/** Height (m) worth having here: enough for the legs after the turnpoint too. */
	goal: number;
}

/**
 * Lowest height at (x0, z0) from which a glide at PLAN_GLIDE to (x1, z1) stays
 * `PATH_CLEARANCE` above every hill on the way and arrives `arrival` above the ground.
 */
export function heightToGlide(t: TerrainPhases, x0: number, z0: number, x1: number, z1: number, arrival: number): number {
	const dist = Math.hypot(x1 - x0, z1 - z0);
	let need = terrainHeight(t, x1, z1) + arrival + dist / PLAN_GLIDE;
	for (let k = 0; k < PATH_SAMPLES; k++) {
		const f = k / PATH_SAMPLES;
		const ground = terrainHeight(t, x0 + (x1 - x0) * f, z0 + (z1 - z0) * f);
		need = Math.max(need, ground + PATH_CLEARANCE + (dist * f) / PLAN_GLIDE);
	}
	return need;
}

/**
 * Height worth climbing to at (x, z): enough to round the next turnpoint and
 * fly the legs after it (all of them on a finite task), up to the top of the lift.
 */
function climbGoal(sim: Sim, x: number, z: number): number {
	let goal = 0;
	let fx = x, fz = z;
	const last = sim.spec.count === null ? sim.next + LEGS_AHEAD : sim.spec.count - 1;
	let ends = false;
	for (let i = Math.min(last, sim.turnpoints.length - 1); i >= sim.next; i--) {
		// Walk the legs backwards, so each one starts with the height the rest needs.
		const tp = sim.turnpoints[i];
		const from = i === sim.next ? { x: fx, z: fz } : sim.turnpoints[i - 1];
		if (!tp || !from) continue;
		const arrival = !ends && sim.spec.count !== null && i === sim.spec.count - 1 ? FINAL_ARRIVAL : TURNPOINT_ARRIVAL;
		ends = true;
		const leg = heightToGlide(sim.terr, from.x, from.z, tp.x, tp.z, arrival);
		goal = Math.max(leg, goal + Math.hypot(tp.x - from.x, tp.z - from.z) / PLAN_GLIDE);
	}
	return Math.min(goal, TOP_OF_CLIMB);
}

/**
 * What the autopilot would do right now. Pass the previous plan back in: a
 * climb, or a thermal being flown to, is then kept until it stops being worth it.
 */
export function planRoute(sim: Sim, prev: Plan | null = null): Plan {
	const p = sim.plane;
	const tp = sim.turnpoints[sim.next] ?? null;
	if (!tp) return { mode: "glide", thermal: null, turnpoint: null, need: 0, goal: 0 };
	const final = sim.spec.count !== null && sim.next === sim.spec.count - 1;
	const arrival = final ? FINAL_ARRIVAL : TURNPOINT_ARRIVAL;
	const need = heightToGlide(sim.terr, p.x, p.z, tp.x, tp.z, arrival);
	const goal = Math.max(need, climbGoal(sim, p.x, p.z));
	const thermals = thermalsNear(sim.seed, p.x, p.z, sim.elapsed, 2);
	const sink = sinkRate(CLIMB_SPEED);
	const fade = cloudFade(p.y);
	const plan = (mode: Plan["mode"], thermal: Thermal | null): Plan => ({ mode, thermal, turnpoint: tp, need, goal });
	const away = (th: Thermal) => Math.hypot(th.x - p.x, th.z - p.z);
	const lifts = (th: Thermal, atLeast: number) => th.strength * fade - sink >= atLeast;
	const direct = Math.hypot(tp.x - p.x, tp.z - p.z);

	/** Climb rate a thermal is worth (m/s), counting the flying it costs; 0 when it is not worth going to. */
	const worth = (th: Thermal, minClimb: number): number => {
		const d = away(th);
		const climbTime = th.remaining - d / CRUISE_SPEED - THERMAL_FADE / 2;
		const net = th.peak * 0.9 - sink;
		if (climbTime < minClimb || net < 1.5) return 0;
		if (p.y < heightToGlide(sim.terr, p.x, p.z, th.x, th.z, THERMAL_ARRIVAL)) return 0;
		const arriveAt = p.y - d / PLAN_GLIDE;
		const wanted = Math.max(climbGoal(sim, th.x, th.z), heightToGlide(sim.terr, th.x, th.z, tp.x, tp.z, arrival)) - arriveAt;
		const gain = Math.min(climbTime * net, TOP_OF_CLIMB - arriveAt, wanted);
		if (gain < WORTH_STOPPING) return 0;
		// The detour burns height as well as time: what counts is the height it leaves in hand.
		const detour = Math.max(0, d + Math.hypot(tp.x - th.x, tp.z - th.z) - direct);
		const kept = gain - detour / PLAN_GLIDE;
		if (kept <= 0) return 0;
		return kept / (gain / net + detour / CRUISE_SPEED + CENTERING_SECONDS);
	};

	// Keep climbing in the same thermal while it still lifts and there is height worth having.
	const held = prev?.thermal ? thermals.find((t) => t.id === prev.thermal?.id) : undefined;
	if (prev?.mode === "climb" && held && p.y < goal && held.remaining >= LEAVE_BEFORE && lifts(held, 1) && away(held) < held.radius * LEAVE) {
		return plan("climb", held);
	}
	if (p.y >= goal) return plan("glide", null);
	// Keep flying to the thermal already chosen, and start circling once inside it.
	if (prev?.mode === "seek" && held) {
		if (away(held) < held.radius * ENTER && lifts(held, 1) && held.remaining >= LEAVE_BEFORE) return plan("climb", held);
		if (worth(held, MIN_CLIMB_SECONDS / 2) > 0) return plan("seek", held);
	}
	// Flying through good lift with a real amount of height still to gain: stop and use it.
	for (const th of thermals) {
		if (p.y < goal - WORTH_STOPPING && away(th) < th.radius * ENTER && th.remaining >= MIN_CLIMB_SECONDS && lifts(th, 2.5)) return plan("climb", th);
	}
	// Otherwise the thermal that climbs best for the flying it costs. With the
	// turnpoint in range it has to be a good one; too low for that, any will do.
	let best: Thermal | null = null;
	let bestRate = GOOD_CLIMB * clamp((p.y - need) / HEIGHT_IN_HAND, 0, 1);
	for (const th of thermals) {
		const rate = worth(th, MIN_CLIMB_SECONDS);
		if (rate > bestRate) {
			best = th;
			bestRate = rate;
		}
	}
	// Nothing worth it in reach: press on toward the beacon and hope to fly into lift.
	return best ? plan("seek", best) : plan("glide", null);
}


/** Stick input that flies `plan` (by default, the current plan). */
export function autopilot(sim: Sim, plan: Plan = planRoute(sim)): Controls {
	const p = sim.plane;
	let heading = p.yaw;
	let bias = 0;
	let speed = CRUISE_SPEED;
	let near = Number.POSITIVE_INFINITY;
	const th = plan.thermal;
	if (th) {
		const dx = th.x - p.x, dz = th.z - p.z;
		const d = Math.hypot(dx, dz);
		const bearing = Math.atan2(dx, dz);
		if (d > CIRCLE_RADIUS * 2) heading = bearing;
		else {
			// Circle toward the side the centre is on: tangent at CIRCLE_RADIUS, turning in when wide.
			const side = wrap(bearing - p.yaw) >= 0 ? 1 : -1;
			heading = bearing - side * (Math.PI / 2) * clamp(2 - d / CIRCLE_RADIUS, 0, 1.3);
			bias = side * 0.8;
		}
		if (d < th.radius && liftProfile(d, th.radius) > 0) speed = CLIMB_SPEED;
	} else if (plan.turnpoint) {
		heading = Math.atan2(plan.turnpoint.x - p.x, plan.turnpoint.z - p.z);
		near = Math.hypot(plan.turnpoint.x - p.x, plan.turnpoint.z - p.z);
		// Short of height with no thermal worth the trip: stretch the glide and hope to fly into lift.
		if (p.y < plan.need) speed = BEST_GLIDE_SPEED;
		// Height to spare is traded for speed.
		speed += (DASH_SPEED - CRUISE_SPEED) * clamp((p.y - plan.goal - 40) / 100, 0, 1);
	}
	const off = wrap(heading - p.yaw);
	// A fast glider turns wide: slow down to turn onto the line, or it would orbit the beacon.
	if (Math.abs(off) > TURN_SLOWLY && speed > TURN_SPEED && near < TURN_SLOWLY_WITHIN) speed = TURN_SPEED;
	const roll = clamp(off * 3 + bias, -1, 1);
	// Hold the target speed with the nose: lower it when slow, raise it when fast.
	const wanted = clamp(trimPitch(speed) + (p.v - speed) * 0.035, -0.6, Math.min(0.45, MAX_PITCH));
	const pitch = clamp((wanted - p.pitch) * 5, -1, 1);
	return { roll, pitch };
}
