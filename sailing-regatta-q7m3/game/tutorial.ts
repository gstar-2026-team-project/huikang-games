import { MAX_SPEED, NO_GO_ANGLE, SIM_DT, TRACE_INTERVAL_MS } from "./constants";
import { type Course, distance, type Point } from "./course";
import { type Boat, sailSide, type Steer, stepBoat, trueWindAngle } from "./physics";
import { markRadius } from "./race";

export interface TutorialStep {
	title: string;
	text: string;
}

/** The lesson, in order. Every step has a buoy to sail to and a path drawn on the water. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
	{ title: "Steering", text: "Hold ▶ to turn right, then follow the path into the buoy's ring." },
	{ title: "Steering", text: "Now hold ◀ to turn left and sail to the next buoy." },
	{
		title: "Fastest angle",
		text: "This buoy is straight across the wind, your fastest direction. Sail to it and watch the speed bar go green.",
	},
	{
		title: "In irons",
		text: "This buoy is straight upwind. Try pointing right at it and watch the boat stall.",
	},
	{ title: "In irons", text: "That's called being in irons. Turn away from the wind to get moving again." },
	{
		title: "Sailing upwind",
		text: "Follow the zig-zag path about 45° off the wind. \"To buoy\" stays positive even though you're not pointing at it.",
	},
	{ title: "Tacking", text: "Tack! At the corner, turn through the wind onto the next leg of the path." },
	{
		title: "Tacking",
		text: "Keep zig-zagging up the path, tacking at each corner, and sail into the buoy's ring.",
	},
];

const DEG = Math.PI / 180;
/** Where each step's buoy goes, relative to the boat: bearing (from north, clockwise) and distance. */
const STEP_BUOYS: ReadonlyArray<{ bearing: number; distance: number }> = [
	{ bearing: 150 * DEG, distance: 75 },
	{ bearing: 65 * DEG, distance: 85 },
	{ bearing: 95 * DEG, distance: 110 },
	{ bearing: 0, distance: 60 },
];
/** Hold time for the upwind-angle step. */
const HOLD_GOAL_MS = 1500;
/** Speed that counts as "moving again" after stalling. */
const MOVING_SPEED = 6;
/** The upwind buoy is placed this far straight upwind of the boat. */
const UPWIND_BUOY_DISTANCE = 140;
/** Each zig-zag leg's angle off the wind: clear of the no-go zone and still quick. */
const GUIDE_LEG_ANGLE = 50 * DEG;
/** Target upwind rise per half-leg of the zig-zag; adjusted so legs fit the buoy exactly. */
const ZIGZAG_LEG_RISE = 30;
/** Upwind angle band the lesson accepts: just outside the no-go zone to about 65°. */
const UPWIND_MAX_ANGLE = 65 * DEG;
/** Rolling trail kept for the mini-map. */
const TRAIL_SAMPLES = 240;

export interface TutorialState {
	step: number;
	done: boolean;
	boat: Boat;
	/** Wind from the north, steady, so the lesson is about the boat. One mark: this step's buoy. */
	course: Course;
	/** The intended path to the buoy, drawn on the water. */
	guide: Point[];
	/** Bumped whenever the buoy or path changes. */
	courseVersion: number;
	elapsedMs: number;
	holdMs: number;
	tackFrom: 1 | -1;
	trace: number[];
	nextSampleMs: number;
}

function offset(from: Point, bearing: number, length: number): Point {
	return { x: from.x + Math.sin(bearing) * length, y: from.y + Math.cos(bearing) * length };
}

/**
 * Tacking path from `from` up to a buoy straight upwind of it. Every leg,
 * including the last one into the buoy, is GUIDE_LEG_ANGLE off the wind, so
 * a sailor who follows the dots never sails into the no-go zone.
 */
export function zigzagPath(from: Point, buoy: Point, firstSide: 1 | -1): Point[] {
	const dx = buoy.x - from.x;
	const dy = buoy.y - from.y;
	const length = Math.hypot(dx, dy);
	const up = { x: dx / length, y: dy / length };
	const right = { x: up.y, y: -up.x };
	// Corners sit at rises h, 3h, 5h, … alternating sides; the buoy is at 2n·h.
	const legs = Math.max(1, Math.round(length / (2 * ZIGZAG_LEG_RISE)));
	const rise = length / (2 * legs);
	const swing = rise * Math.tan(GUIDE_LEG_ANGLE);
	const points: Point[] = [from];
	let side = firstSide;
	for (let k = 0; k < legs; k++) {
		const along = rise * (2 * k + 1);
		points.push({
			x: from.x + up.x * along + right.x * swing * side,
			y: from.y + up.y * along + right.y * swing * side,
		});
		side = side === 1 ? -1 : 1;
	}
	points.push(buoy);
	return points;
}

function placeBuoy(t: TutorialState, buoy: Point, guide: Point[]): void {
	t.course = { ...t.course, start: { x: t.boat.x, y: t.boat.y }, marks: [buoy] };
	t.guide = guide;
	t.courseVersion += 1;
}

function enterStep(t: TutorialState): void {
	t.holdMs = 0;
	const placement = STEP_BUOYS[t.step];
	if (placement) {
		const buoy = offset(t.boat, placement.bearing, placement.distance);
		placeBuoy(t, buoy, [{ x: t.boat.x, y: t.boat.y }, buoy]);
	} else if (t.step === 5) {
		const wind = t.course.baseWind;
		const buoy = offset(t.boat, wind, UPWIND_BUOY_DISTANCE);
		placeBuoy(t, buoy, zigzagPath(t.boat, buoy, sailSide(t.boat.heading, wind)));
	} else if (t.step === 6) {
		t.tackFrom = sailSide(t.boat.heading, t.course.baseWind);
	}
}

export function createTutorial(): TutorialState {
	const t: TutorialState = {
		step: 0,
		done: false,
		boat: { x: 0, y: 0, heading: Math.PI / 2, speed: MAX_SPEED * 0.5 },
		course: { day: "lesson", baseWind: 0, shifts: [], start: { x: 0, y: 0 }, marks: [] },
		guide: [],
		courseVersion: 0,
		elapsedMs: 0,
		holdMs: 0,
		tackFrom: 1,
		trace: [],
		nextSampleMs: 0,
	};
	enterStep(t);
	return t;
}

function inRing(t: TutorialState): boolean {
	const buoy = t.course.marks[0];
	return buoy !== undefined && distance(t.boat, buoy) <= markRadius(t.course, 0);
}

function stepComplete(t: TutorialState): boolean {
	const wind = t.course.baseWind;
	const twa = trueWindAngle(t.boat.heading, wind);
	switch (t.step) {
		case 0:
		case 1:
		case 2:
		case 7:
			return inRing(t);
		case 3:
			return twa < NO_GO_ANGLE && t.boat.speed < 2.5;
		case 4:
			return t.boat.speed > MOVING_SPEED;
		case 5:
			return t.holdMs >= HOLD_GOAL_MS;
		case 6:
			return (
				sailSide(t.boat.heading, wind) !== t.tackFrom &&
				twa > NO_GO_ANGLE &&
				twa < UPWIND_MAX_ANGLE &&
				t.boat.speed > MOVING_SPEED * 0.7
			);
		default:
			return false;
	}
}

/** Advance one fixed step. Mutates `t`; reports when a lesson step completes. */
export function stepTutorial(t: TutorialState, steer: Steer): "advanced" | "done" | null {
	if (t.done) return null;
	const wind = t.course.baseWind;
	t.boat = stepBoat(t.boat, steer, wind, SIM_DT);
	t.elapsedMs += SIM_DT * 1000;
	const twa = trueWindAngle(t.boat.heading, wind);
	const holding = t.step === 5 && twa > NO_GO_ANGLE && twa < UPWIND_MAX_ANGLE && t.boat.speed > MOVING_SPEED;
	t.holdMs = holding ? t.holdMs + SIM_DT * 1000 : 0;

	if (t.elapsedMs >= t.nextSampleMs) {
		t.nextSampleMs += TRACE_INTERVAL_MS;
		t.trace.push(Math.round(t.boat.x), Math.round(t.boat.y), Math.round(t.boat.heading * 100));
		if (t.trace.length > TRAIL_SAMPLES * 3) t.trace.splice(0, 3);
	}

	if (!stepComplete(t)) return null;
	t.step += 1;
	if (t.step >= TUTORIAL_STEPS.length) {
		t.done = true;
		return "done";
	}
	enterStep(t);
	return "advanced";
}
