import { createRng, hashSeed, range } from "./rng";

export interface Point {
	x: number;
	y: number;
}

export interface WindShift {
	amplitude: number;
	period: number;
	phase: number;
}

export interface Course {
	day: string;
	/** Direction the wind blows FROM, in radians (0 = from +y, clockwise). */
	baseWind: number;
	shifts: WindShift[];
	start: Point;
	/** Marks to round in order; the last one is the finish. */
	marks: Point[];
}

/** Uniform size of the course; tuned so a typical run takes about 1.5 minutes. */
const COURSE_SCALE = 0.8;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

/** UTC calendar day, so everyone in the world races the same course at once. */
export function dayKey(nowMs: number): string {
	return new Date(nowMs).toISOString().slice(0, 10);
}

export function isDayKey(value: string): boolean {
	return DAY_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/** Day key `days` before `day`. */
export function shiftDay(day: string, days: number): string {
	return dayKey(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000);
}

/** Dated label so a notification read tomorrow still names the right course. */
export function courseLabel(day: string): string {
	const month = MONTHS[Number(day.slice(5, 7)) - 1] ?? "";
	return `Regatta · ${month} ${Number(day.slice(8, 10))}, ${day.slice(0, 4)}`;
}

export function leaderboardIdFor(day: string): string {
	return `day-${day}`;
}

/** Converts wind-frame coordinates (up = upwind, side = to the right) to world. */
function fromWindFrame(baseWind: number, up: number, side: number): Point {
	const ux = Math.sin(baseWind);
	const uy = Math.cos(baseWind);
	return { x: ux * up + uy * side, y: uy * up - ux * side };
}

/**
 * The day's course: a windward beat, a reach, a run back down, a second beat
 * to the other side, and a finish near the start. Leg lengths are bounded so
 * every leg is sailable well inside MAX_RUN_MS (see course.test.ts).
 */
export function generateCourse(day: string): Course {
	const rng = createRng(hashSeed(`regatta/${day}`));
	const baseWind = range(rng, 0, Math.PI * 2);
	const side = rng() < 0.5 ? -1 : 1;
	const frameMarks: Array<[number, number]> = [
		[range(rng, 230, 300), range(rng, -50, 50)],
		[range(rng, 170, 230), side * range(rng, 170, 220)],
		[range(rng, -40, 20), side * range(rng, 20, 70)],
		[range(rng, 180, 240), -side * range(rng, 110, 170)],
		[range(rng, -20, 10), range(rng, -25, 25)],
	];
	const shifts: WindShift[] = [
		{
			amplitude: (range(rng, 8, 14) * Math.PI) / 180,
			period: range(rng, 45, 70),
			phase: range(rng, 0, Math.PI * 2),
		},
		{
			amplitude: (range(rng, 3, 6) * Math.PI) / 180,
			period: range(rng, 17, 26),
			phase: range(rng, 0, Math.PI * 2),
		},
	];
	return {
		day,
		baseWind,
		shifts,
		// Start a little downwind of the finish so the two never overlap.
		start: fromWindFrame(baseWind, -60 * COURSE_SCALE, 0),
		marks: frameMarks.map(([up, s]) =>
			fromWindFrame(baseWind, up * COURSE_SCALE, s * COURSE_SCALE),
		),
	};
}

export function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Straight-line length of the whole course; no run can beat it at top speed. */
export function courseLength(course: Course): number {
	let total = 0;
	let previous = course.start;
	for (const mark of course.marks) {
		total += distance(previous, mark);
		previous = mark;
	}
	return total;
}
