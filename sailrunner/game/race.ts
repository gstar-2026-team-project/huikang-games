import {
	FINISH_RADIUS,
	MARK_RADIUS,
	MAX_RUN_MS,
	MAX_TRACE_SAMPLES,
	SIM_DT,
	TRACE_INTERVAL_MS,
} from "./constants";
import { type Course, distance } from "./course";
import { type Boat, type Steer, stepBoat, windAt } from "./physics";

export interface RaceState {
	/** Race clock in milliseconds since the start gun. */
	elapsedMs: number;
	boat: Boat;
	/** Index of the next mark to round; equals marks.length once finished. */
	markIndex: number;
	/** Race clock at each rounded mark. */
	splits: number[];
	/** Flat [x, y, heading*100] integer triples sampled every TRACE_INTERVAL_MS. */
	trace: number[];
	nextSampleMs: number;
}

export type RaceEvent =
	| { type: "mark"; index: number; elapsedMs: number }
	| { type: "finish"; elapsedMs: number }
	| { type: "timeout" };

export function startHeading(course: Course): number {
	// Begin on a close reach toward the first mark's side, never in irons.
	return course.baseWind + Math.PI / 2;
}

export function createRace(course: Course): RaceState {
	const race: RaceState = {
		elapsedMs: 0,
		boat: { ...course.start, heading: startHeading(course), speed: 0 },
		markIndex: 0,
		splits: [],
		trace: [],
		nextSampleMs: 0,
	};
	sample(race);
	return race;
}

/** Restore a race from a persisted checkpoint at the given race-clock time. */
export function resumeRace(
	checkpoint: Pick<RaceState, "boat" | "markIndex" | "splits" | "trace">,
	elapsedMs: number,
): RaceState {
	const race: RaceState = {
		elapsedMs,
		boat: { ...checkpoint.boat },
		markIndex: checkpoint.markIndex,
		splits: [...checkpoint.splits],
		trace: [...checkpoint.trace],
		nextSampleMs: (checkpoint.trace.length / 3) * TRACE_INTERVAL_MS,
	};
	// Time spent away still counts; the replay shows the boat waiting there.
	while (race.nextSampleMs <= elapsedMs) sample(race);
	return race;
}

function sample(race: RaceState): void {
	race.nextSampleMs += TRACE_INTERVAL_MS;
	// Leave room for the closing finish sample.
	if (race.trace.length >= (MAX_TRACE_SAMPLES - 1) * 3) return;
	race.trace.push(
		Math.round(race.boat.x),
		Math.round(race.boat.y),
		Math.round(race.boat.heading * 100),
	);
}

export function markRadius(course: Course, index: number): number {
	return index === course.marks.length - 1 ? FINISH_RADIUS : MARK_RADIUS;
}

/** Advance one fixed SIM_DT step. Mutates `race`; returns what happened, if anything. */
export function stepRace(
	course: Course,
	race: RaceState,
	steer: Steer,
): RaceEvent | null {
	if (race.markIndex >= course.marks.length) return null;
	race.boat = stepBoat(race.boat, steer, windAt(course, race.elapsedMs / 1000), SIM_DT);
	race.elapsedMs += SIM_DT * 1000;
	while (race.elapsedMs >= race.nextSampleMs) sample(race);
	if (race.elapsedMs > MAX_RUN_MS) return { type: "timeout" };

	const mark = course.marks[race.markIndex];
	if (!mark || distance(race.boat, mark) > markRadius(course, race.markIndex)) {
		return null;
	}
	const elapsedMs = Math.round(race.elapsedMs);
	race.splits.push(elapsedMs);
	race.markIndex += 1;
	if (race.markIndex === course.marks.length) {
		// Close the trace on the finish position so the replay ends on the line.
		race.trace.push(
			Math.round(race.boat.x),
			Math.round(race.boat.y),
			Math.round(race.boat.heading * 100),
		);
		return { type: "finish", elapsedMs };
	}
	return { type: "mark", index: race.markIndex - 1, elapsedMs };
}
