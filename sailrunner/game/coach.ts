import type { Point } from "./course";
import { type Boat, normalizeAngle } from "./physics";

const DEG = Math.PI / 180;
/** Upwind legs are planned this far off the wind: clear of the no-go zone and still quick. */
export const TACK_ANGLE = 50 * DEG;
/** Within this heading error the coach says "hold this course". */
const HOLD_TOLERANCE = 8 * DEG;
/** The boat counts as on a tack once it is this far either side of the wind. */
const ON_TACK = 10 * DEG;
/** Closer to the layline than this (meters), it's time to tack. */
const TACK_NOW_DISTANCE = 3;

export type Side = 1 | -1;

export interface Plan {
	/** Polyline from the boat to the target, every leg sailable. */
	route: Point[];
	/** Heading for the first leg. */
	heading: number;
	/** Tack the plan starts on (1 = wind over the left side, heading right of the wind). */
	side: Side;
}

export type CoachAction = { kind: "hold" } | { kind: "turn"; dir: Side } | { kind: "tack"; dir: Side };

function dir(heading: number): Point {
	return { x: Math.sin(heading), y: Math.cos(heading) };
}

/** Distances along d1 then d2 that get from `from` to `to` (from + a·d1 + b·d2 = to). */
function twoLegs(from: Point, to: Point, d1: Point, d2: Point): { a: number; b: number } {
	const vx = to.x - from.x;
	const vy = to.y - from.y;
	const det = d1.x * d2.y - d2.x * d1.y;
	return { a: (vx * d2.y - d2.x * vy) / det, b: (d1.x * vy - vx * d1.y) / det };
}

/**
 * A good (not perfect) route to `target` from where the boat is now: straight
 * there when it's off the wind; otherwise along the current tack to the
 * layline, then one tack into the target. `prevSide` keeps the plan steady
 * while the boat is pointing straight into the wind.
 */
export function planRoute(boat: Boat, target: Point, wind: number, prevSide: Side): Plan {
	const bearing = Math.atan2(target.x - boat.x, target.y - boat.y);
	const off = normalizeAngle(bearing - wind);
	if (Math.abs(off) >= TACK_ANGLE) {
		return { route: [{ x: boat.x, y: boat.y }, target], heading: bearing, side: off > 0 ? 1 : -1 };
	}
	const rel = normalizeAngle(boat.heading - wind);
	let side: Side = Math.abs(rel) > ON_TACK ? (rel > 0 ? 1 : -1) : prevSide;
	let legs = twoLegs(boat, target, dir(wind + side * TACK_ANGLE), dir(wind - side * TACK_ANGLE));
	if (legs.a < TACK_NOW_DISTANCE) {
		// At or past the layline on this tack: the other tack leads to the target.
		side = side === 1 ? -1 : 1;
		legs = twoLegs(boat, target, dir(wind + side * TACK_ANGLE), dir(wind - side * TACK_ANGLE));
	}
	const heading = wind + side * TACK_ANGLE;
	const first = dir(heading);
	const corner = { x: boat.x + first.x * Math.max(0, legs.a), y: boat.y + first.y * Math.max(0, legs.a) };
	return { route: [{ x: boat.x, y: boat.y }, corner, target], heading, side };
}

/**
 * A good route from the boat through every remaining buoy, in order: the first
 * leg from where the boat is now, each later leg from the buoy before it.
 */
export function planCourse(boat: Boat, marks: readonly Point[], wind: number, prevSide: Side): { route: Point[]; side: Side } {
	const first = marks[0];
	if (!first) return { route: [], side: prevSide };
	const plan = planRoute(boat, first, wind, prevSide);
	const route = [...plan.route];
	let from = first;
	for (const mark of marks.slice(1)) {
		// Leaving a buoy, the boat is taken to be pointing at the next one.
		const heading = Math.atan2(mark.x - from.x, mark.y - from.y);
		const leg = planRoute({ x: from.x, y: from.y, heading, speed: boat.speed }, mark, wind, plan.side);
		route.push(...leg.route.slice(1));
		from = mark;
	}
	return { route, side: plan.side };
}

/** What to do with the helm to follow `heading` from the boat's current heading. */
export function coachAction(boat: Boat, heading: number, wind: number): CoachAction {
	const error = normalizeAngle(heading - boat.heading);
	if (Math.abs(error) < HOLD_TOLERANCE) return { kind: "hold" };
	const from = normalizeAngle(boat.heading - wind);
	const to = normalizeAngle(heading - wind);
	// Crossing from one side of the wind to the other while heading upwind is a tack.
	const crossesWind = Math.sign(from) !== Math.sign(to) && Math.abs(from) < Math.PI / 2 && Math.abs(to) < Math.PI / 2;
	if (crossesWind) return { kind: "tack", dir: from > 0 ? -1 : 1 };
	return { kind: "turn", dir: error > 0 ? 1 : -1 };
}

export function sameAction(a: CoachAction, b: CoachAction): boolean {
	return a.kind === b.kind && (a.kind === "hold" || (b.kind !== "hold" && a.dir === b.dir));
}
