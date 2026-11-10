import { describe, expect, test } from "bun:test";
import { MAX_RUN_MS, MAX_SPEED, MAX_TRACE_SAMPLES, NO_GO_ANGLE } from "./constants";
import {
	courseLabel,
	courseLength,
	dayKey,
	distance,
	generateCourse,
	isDayKey,
	shiftDay,
} from "./course";
import { formatDelta, formatTime } from "./format";
import {
	normalizeAngle,
	polar,
	type Steer,
	stepBoat,
	trueWindAngle,
	windAt,
} from "./physics";
import { createRace, type RaceState, resumeRace, stepRace } from "./race";
import { poseAt } from "./replay";
import { raceStats, statsMarkdown, velocityMadeGood } from "./stats";

const TACK_ANGLE = (48 * Math.PI) / 180;

/** A modest helmsman: points at the mark, or tacks upwind when it must. */
function createAutopilot() {
	let tack: 1 | -1 = 1;
	return (race: RaceState, wind: number, target: { x: number; y: number }): Steer => {
		const bearing = Math.atan2(target.x - race.boat.x, target.y - race.boat.y);
		let desired = bearing;
		if (trueWindAngle(bearing, wind) < TACK_ANGLE) {
			const options = [wind + TACK_ANGLE, wind - TACK_ANGLE] as const;
			const current = options[tack === 1 ? 0 : 1];
			const other = options[tack === 1 ? 1 : 0];
			const off = (h: number) => Math.abs(normalizeAngle(h - bearing));
			if (off(other) + 0.35 < off(current)) tack = tack === 1 ? -1 : 1;
			desired = options[tack === 1 ? 0 : 1];
		}
		const error = normalizeAngle(desired - race.boat.heading);
		return Math.abs(error) < 0.04 ? 0 : error > 0 ? 1 : -1;
	};
}

function sail(day: string) {
	const course = generateCourse(day);
	const race = createRace(course);
	const pilot = createAutopilot();
	for (;;) {
		const mark = course.marks[race.markIndex];
		if (!mark) throw new Error("no mark");
		const steer = pilot(race, windAt(course, race.elapsedMs / 1000), mark);
		const event = stepRace(course, race, steer);
		if (event?.type === "finish") return { course, race, timeMs: event.elapsedMs };
		if (event?.type === "timeout") return { course, race, timeMs: Infinity };
	}
}

describe("course", () => {
	test("is deterministic per day and differs between days", () => {
		expect(generateCourse("2026-11-07")).toEqual(generateCourse("2026-11-07"));
		expect(generateCourse("2026-11-07").marks).not.toEqual(
			generateCourse("2026-11-08").marks,
		);
	});

	test("day keys, labels, and shifting", () => {
		expect(dayKey(Date.parse("2026-11-07T23:59:00Z"))).toBe("2026-11-07");
		expect(isDayKey("2026-11-07")).toBe(true);
		expect(isDayKey("2026-13-40")).toBe(false);
		expect(isDayKey("nope")).toBe(false);
		expect(shiftDay("2026-03-01", 2)).toBe("2026-02-27");
		expect(courseLabel("2026-11-07")).toBe("Sailrunner · Nov 7, 2026");
		expect(courseLabel("2026-11-07").length).toBeLessThanOrEqual(40);
	});

	test("every leg is a sensible length", () => {
		for (let i = 0; i < 120; i++) {
			const course = generateCourse(shiftDay("2026-11-07", i));
			let previous = course.start;
			for (const mark of course.marks) {
				const leg = distance(previous, mark);
				expect(leg).toBeGreaterThan(70);
				expect(leg).toBeLessThan(340);
				previous = mark;
			}
		}
	});

	test("an ordinary sailor finishes every course well inside the time limit", () => {
		const times: number[] = [];
		for (let i = 0; i < 60; i++) {
			const { course, race, timeMs } = sail(shiftDay("2026-11-07", i));
			expect(timeMs).toBeLessThan(MAX_RUN_MS * 0.6);
			// Nobody can beat the straight-line distance at top speed.
			expect(timeMs).toBeGreaterThan((courseLength(course) / MAX_SPEED) * 1000);
			expect(race.splits).toHaveLength(course.marks.length);
			expect(race.trace.length / 3).toBeLessThanOrEqual(MAX_TRACE_SAMPLES);
			times.push(timeMs);
		}
		const mean = times.reduce((a, b) => a + b, 0) / times.length;
		expect(mean).toBeGreaterThan(50_000);
		expect(mean).toBeLessThan(130_000);
	});
});

describe("physics", () => {
	test("the boat stalls in irons and is fastest on a reach", () => {
		expect(polar(NO_GO_ANGLE - 0.01)).toBe(0);
		expect(polar(Math.PI / 2)).toBeGreaterThan(polar(Math.PI));
		expect(polar(Math.PI / 2)).toBeGreaterThan(polar((55 * Math.PI) / 180));
	});

	test("pointing into the wind bleeds speed to zero", () => {
		let boat = { x: 0, y: 0, heading: 0, speed: 12 };
		for (let i = 0; i < 600; i++) boat = stepBoat(boat, 0, 0, 1 / 60);
		expect(boat.speed).toBeLessThan(0.1);
	});

	test("identical inputs give an identical run", () => {
		expect(sail("2026-11-07").timeMs).toBe(sail("2026-11-07").timeMs);
	});
});

describe("race and replay", () => {
	test("a resumed race keeps the clock running and pads the trace", () => {
		const course = generateCourse("2026-11-07");
		const race = createRace(course);
		for (let i = 0; i < 120; i++) stepRace(course, race, 0);
		const resumed = resumeRace(race, 10_000);
		expect(resumed.elapsedMs).toBe(10_000);
		expect(resumed.trace.length / 3).toBe(21);
		expect(resumed.trace.slice(-3)).toEqual([
			Math.round(race.boat.x),
			Math.round(race.boat.y),
			Math.round(race.boat.heading * 100),
		]);
	});

	test("replay poses follow the recorded run and end on the finish", () => {
		const { race, timeMs } = sail("2026-11-08");
		const end = poseAt(race.trace, timeMs, timeMs + 5000);
		expect(end.x).toBe(race.trace.at(-3)!);
		expect(end.y).toBe(race.trace.at(-2)!);
		const mid = poseAt(race.trace, timeMs, 1250);
		expect(mid.x).toBeCloseTo((race.trace[6]! + race.trace[9]!) / 2, 5);
		expect(mid.speed).toBeGreaterThanOrEqual(0);
	});
});

test("formatting", () => {
	expect(formatTime(83_456)).toBe("1:23.4");
	expect(formatTime(5_000)).toBe("0:05.0");
	expect(formatDelta(2_340)).toBe("+2.3s");
	expect(formatDelta(-1_100)).toBe("−1.1s");
});

describe("speed and velocity stats", () => {
	test("VMG is full speed toward the mark, zero across, negative away", () => {
		const boat = { x: 0, y: 0, heading: 0, speed: 10 };
		expect(velocityMadeGood(boat, { x: 0, y: 100 })).toBeCloseTo(10, 5);
		expect(velocityMadeGood(boat, { x: 100, y: 0 })).toBeCloseTo(0, 5);
		expect(velocityMadeGood(boat, { x: 0, y: -100 })).toBeCloseTo(-10, 5);
	});

	test("finished-run stats are consistent with the course and the boat", () => {
		const { course, race, timeMs } = sail("2026-11-09");
		const stats = raceStats(course, race.trace, timeMs);
		expect(stats.distance).toBeGreaterThanOrEqual(courseLength(course) * 0.95);
		expect(stats.avgSpeed).toBeCloseTo(stats.distance / (timeMs / 1000), 5);
		expect(stats.topSpeed).toBeLessThanOrEqual(MAX_SPEED * 1.1);
		expect(stats.topSpeed).toBeGreaterThan(stats.avgSpeed);
		// Tacking means progress round the course is slower than boat speed.
		expect(stats.avgVmg).toBeLessThan(stats.avgSpeed);
		expect(statsMarkdown(stats, timeMs)).toContain("Velocity toward buoys");
	});
});
