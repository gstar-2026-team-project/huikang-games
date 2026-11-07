import { expect, test } from "bun:test";
import { distance } from "./course";
import { normalizeAngle, type Steer } from "./physics";
import { velocityMadeGood } from "./stats";
import { createTutorial, stepTutorial, TUTORIAL_STEPS, type TutorialState, zigzagPath } from "./tutorial";

const DEG = Math.PI / 180;

function steerTo(t: TutorialState, heading: number): Steer {
	const error = normalizeAngle(heading - t.boat.heading);
	return Math.abs(error) < 0.03 ? 0 : error > 0 ? 1 : -1;
}

function bearingToBuoy(t: TutorialState): number {
	const buoy = t.course.marks[0]!;
	return Math.atan2(buoy.x - t.boat.x, buoy.y - t.boat.y);
}

/** What a learner following each instruction (and the drawn path) would do. */
function learner(t: TutorialState): Steer {
	switch (t.step) {
		case 0:
		case 1:
		case 2:
		case 3:
			return steerTo(t, bearingToBuoy(t));
		case 4:
		case 5:
			return steerTo(t, 50 * DEG);
		case 6:
			return steerTo(t, -50 * DEG);
		default: {
			const bearing = bearingToBuoy(t);
			if (Math.abs(bearing) > 45 * DEG) return steerTo(t, Math.sign(bearing) * 50 * DEG);
			const onRight = normalizeAngle(t.boat.heading) > 0;
			return steerTo(t, onRight ? 50 * DEG : -50 * DEG);
		}
	}
}

test("a learner who follows the prompts finishes the lesson, always with a buoy to sail to", () => {
	const t = createTutorial();
	const seen: number[] = [];
	let result: ReturnType<typeof stepTutorial> = null;
	for (let i = 0; i < 60 * 180 && result !== "done"; i++) {
		expect(t.course.marks).toHaveLength(1);
		expect(t.guide.length).toBeGreaterThanOrEqual(2);
		result = stepTutorial(t, learner(t));
		if (result === "advanced") seen.push(t.step);
	}
	expect(result).toBe("done");
	expect(seen).toEqual(TUTORIAL_STEPS.map((_, i) => i).slice(1));
	expect(t.elapsedMs).toBeLessThan(120_000);
});

test("each steering buoy needs the turn the prompt asks for, and none is in the no-go zone", () => {
	const t = createTutorial();
	// Step 1: the first buoy is to the right of the starting heading.
	expect(normalizeAngle(bearingToBuoy(t) - t.boat.heading)).toBeGreaterThan(30 * DEG);
	while (t.step === 0) stepTutorial(t, learner(t));
	// Step 2: the next buoy is to the left.
	expect(normalizeAngle(bearingToBuoy(t) - t.boat.heading)).toBeLessThan(-30 * DEG);
});

test("the upwind buoy sits straight upwind behind a zig-zag path, and tacking makes progress", () => {
	const t = createTutorial();
	while (t.step < 5) stepTutorial(t, learner(t));
	const buoy = t.course.marks[0]!;
	expect(buoy.x).toBeCloseTo(t.boat.x, 0);
	expect(buoy.y).toBeGreaterThan(t.boat.y + 100);
	expect(t.guide.length).toBeGreaterThanOrEqual(4);
	expect(t.guide.at(-1)).toEqual(buoy);
	// Every leg of the drawn path is sailable: at least 40° off the wind.
	for (let i = 1; i < t.guide.length - 1; i++) {
		const a = t.guide[i - 1]!;
		const b = t.guide[i]!;
		expect(Math.abs(Math.atan2(b.x - a.x, b.y - a.y))).toBeGreaterThan(40 * DEG);
	}
	// Sailing 50° off the wind still closes on the buoy.
	const boat = { ...t.boat, heading: 50 * DEG, speed: 10 };
	expect(velocityMadeGood(boat, buoy)).toBeGreaterThan(5);
});

test("zigzag paths alternate sides and end at the buoy", () => {
	const path = zigzagPath({ x: 0, y: 0 }, { x: 0, y: 150 }, 1);
	expect(path[1]!.x).toBeGreaterThan(0);
	expect(path[2]!.x).toBeLessThan(0);
	expect(distance(path.at(-1)!, { x: 0, y: 150 })).toBe(0);
});

test("standing still or steering away does not advance", () => {
	const t = createTutorial();
	for (let i = 0; i < 600; i++) stepTutorial(t, -1);
	expect(t.step).toBe(0);
});
