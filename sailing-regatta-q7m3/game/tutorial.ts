import { MARK_RADIUS, MAX_SPEED, NO_GO_ANGLE, SIM_DT, TRACE_INTERVAL_MS } from "./constants";
import { type Course, distance } from "./course";
import { type Boat, normalizeAngle, polar, sailSide, type Steer, stepBoat, trueWindAngle } from "./physics";

export interface TutorialStep {
	title: string;
	text: string;
}

/** The lesson, in order. Each step completes from what the player does on the water. */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
	{ title: "Steering", text: "Hold ▶ to turn right." },
	{ title: "Steering", text: "Now hold ◀ to turn left." },
	{
		title: "Fastest angle",
		text: "Turn until the speed bar goes green, then hold that course. Sailing across the wind is fastest.",
	},
	{
		title: "In irons",
		text: "Now turn into the wind, until the wind arrow points straight down at you. Watch the boat stall.",
	},
	{ title: "In irons", text: "That's called being in irons. Turn away from the wind to get moving again." },
	{
		title: "Sailing upwind",
		text: "A buoy has appeared straight upwind. You can't point at it, so sail about 45° off the wind instead (yellow bar).",
	},
	{ title: "Tacking", text: "Tack! Turn through the wind to the other side, then settle at about 45° again." },
	{
		title: "Tacking",
		text: "Zig-zag up to the buoy, tacking when it falls behind your shoulder. Sail into the ring.",
	},
];

/** Turn needed for each steering step (radians). */
const TURN_GOAL = (50 * Math.PI) / 180;
/** How long the fast angle / upwind angle must be held. */
const HOLD_GOAL_MS = 1500;
/** Speed that counts as "moving again" after stalling. */
const MOVING_SPEED = 6;
/** The lesson buoy is placed this far straight upwind of the boat. */
const BUOY_DISTANCE = 130;
/** Upwind angle band the lesson accepts: just outside the no-go zone to about 65°. */
const UPWIND_MAX_ANGLE = (65 * Math.PI) / 180;
/** Rolling trail kept for the mini-map. */
const TRAIL_SAMPLES = 240;

export interface TutorialState {
	step: number;
	done: boolean;
	boat: Boat;
	/** Wind from the north, steady, so the lesson is about the boat. */
	course: Course;
	/** Bumped whenever the course (the lesson buoy) changes. */
	courseVersion: number;
	elapsedMs: number;
	turned: number;
	holdMs: number;
	tackFrom: 1 | -1;
	trace: number[];
	nextSampleMs: number;
}

export function createTutorial(): TutorialState {
	const course: Course = { day: "lesson", baseWind: 0, shifts: [], start: { x: 0, y: 0 }, marks: [] };
	return {
		step: 0,
		done: false,
		boat: { x: 0, y: 0, heading: Math.PI / 2, speed: MAX_SPEED * 0.5 },
		course,
		courseVersion: 0,
		elapsedMs: 0,
		turned: 0,
		holdMs: 0,
		tackFrom: 1,
		trace: [],
		nextSampleMs: 0,
	};
}

function stepComplete(t: TutorialState): boolean {
	const wind = t.course.baseWind;
	const twa = trueWindAngle(t.boat.heading, wind);
	switch (t.step) {
		case 0:
		case 1:
			return t.turned >= TURN_GOAL;
		case 2:
			return t.holdMs >= HOLD_GOAL_MS;
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
		case 7: {
			const buoy = t.course.marks[0];
			return buoy !== undefined && distance(t.boat, buoy) <= MARK_RADIUS;
		}
		default:
			return false;
	}
}

function enterStep(t: TutorialState): void {
	t.turned = 0;
	t.holdMs = 0;
	if (t.step === 5) {
		const wind = t.course.baseWind;
		const buoy = {
			x: t.boat.x + Math.sin(wind) * BUOY_DISTANCE,
			y: t.boat.y + Math.cos(wind) * BUOY_DISTANCE,
		};
		t.course = { ...t.course, marks: [buoy] };
		t.courseVersion += 1;
	}
	if (t.step === 6) t.tackFrom = sailSide(t.boat.heading, t.course.baseWind);
}

/** Advance one fixed step. Mutates `t`; reports when a lesson step completes. */
export function stepTutorial(t: TutorialState, steer: Steer): "advanced" | "done" | null {
	if (t.done) return null;
	const wind = t.course.baseWind;
	const before = t.boat.heading;
	t.boat = stepBoat(t.boat, steer, wind, SIM_DT);
	t.elapsedMs += SIM_DT * 1000;
	const delta = normalizeAngle(t.boat.heading - before);
	if (t.step === 0 && delta > 0) t.turned += delta;
	if (t.step === 1 && delta < 0) t.turned -= delta;
	const twa = trueWindAngle(t.boat.heading, wind);
	const holding =
		t.step === 2
			? polar(twa) >= 0.9 && t.boat.speed >= MAX_SPEED * 0.75
			: t.step === 5
				? twa > NO_GO_ANGLE && twa < UPWIND_MAX_ANGLE && t.boat.speed > MOVING_SPEED
				: false;
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
