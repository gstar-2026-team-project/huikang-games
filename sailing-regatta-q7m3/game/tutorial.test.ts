import { expect, test } from "bun:test";
import { normalizeAngle, type Steer } from "./physics";
import { createTutorial, stepTutorial, TUTORIAL_STEPS, type TutorialState } from "./tutorial";

const DEG = Math.PI / 180;

function steerTo(t: TutorialState, heading: number): Steer {
	const error = normalizeAngle(heading - t.boat.heading);
	return Math.abs(error) < 0.03 ? 0 : error > 0 ? 1 : -1;
}

/** What a learner following each instruction would do. */
function learner(t: TutorialState): Steer {
	switch (t.step) {
		case 0:
			return 1;
		case 1:
			return -1;
		case 2:
			return steerTo(t, 95 * DEG);
		case 3:
			return steerTo(t, 0);
		case 4:
		case 5:
			return steerTo(t, 50 * DEG);
		case 6:
			return steerTo(t, -50 * DEG);
		default: {
			const buoy = t.course.marks[0]!;
			const bearing = Math.atan2(buoy.x - t.boat.x, buoy.y - t.boat.y);
			// Tack back and forth across the line to the buoy.
			if (Math.abs(bearing) > 45 * DEG) return steerTo(t, Math.sign(bearing) * 50 * DEG);
			const onRight = normalizeAngle(t.boat.heading) > 0;
			return steerTo(t, onRight ? 50 * DEG : -50 * DEG);
		}
	}
}

test("a learner who follows the prompts finishes the lesson in a couple of minutes", () => {
	const t = createTutorial();
	const seen: number[] = [];
	let result: ReturnType<typeof stepTutorial> = null;
	for (let i = 0; i < 60 * 180 && result !== "done"; i++) {
		result = stepTutorial(t, learner(t));
		if (result === "advanced") seen.push(t.step);
	}
	expect(result).toBe("done");
	expect(seen).toEqual(TUTORIAL_STEPS.map((_, i) => i).slice(1));
	expect(t.elapsedMs).toBeLessThan(120_000);
});

test("the buoy appears straight upwind when the upwind step begins", () => {
	const t = createTutorial();
	t.step = 4;
	t.boat = { ...t.boat, speed: 0 };
	while (t.step < 5) stepTutorial(t, 1);
	const buoy = t.course.marks[0]!;
	expect(t.courseVersion).toBe(1);
	expect(buoy.x).toBeCloseTo(t.boat.x, 0);
	expect(buoy.y).toBeGreaterThan(t.boat.y + 100);
});

test("standing still or steering the wrong way does not advance", () => {
	const t = createTutorial();
	for (let i = 0; i < 600; i++) stepTutorial(t, -1);
	expect(t.step).toBe(0);
	for (let i = 0; i < 600; i++) stepTutorial(t, 0);
	expect(t.step).toBe(0);
});
