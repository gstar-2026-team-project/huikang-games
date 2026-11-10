import { describe, expect, test } from "bun:test";
import { generateCourse } from "../game/course";
import { easeView, fitView, focusPoints, MIN_SPAN } from "./minimap-view";

const course = generateCourse("2026-11-07");

describe("map view", () => {
	test("frames the boat, its target buoy and the leg, centred", () => {
		const boat = { x: course.start.x + 10, y: course.start.y + 20 };
		const points = focusPoints(course, boat, 0);
		expect(points).toEqual([boat, course.marks[0]!, course.start]);
		const view = fitView(points);
		const xs = points.map((p) => p.x);
		const ys = points.map((p) => p.y);
		// Centred on the framed points, not anchored to a corner.
		expect(view.cx).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2);
		expect(view.cy).toBeCloseTo((Math.min(...ys) + Math.max(...ys)) / 2);
		// Every framed point sits inside the view with room to spare.
		for (const p of points) {
			expect(Math.abs(p.x - view.cx)).toBeLessThan(view.span / 2);
			expect(Math.abs(p.y - view.cy)).toBeLessThan(view.span / 2);
		}
	});

	test("follows the leg being sailed, the lesson's guide, and the whole course at the finish", () => {
		const boat = { x: 0, y: 0 };
		expect(focusPoints(course, boat, 2)).toEqual([boat, course.marks[2]!, course.marks[1]!]);
		const guide = [{ x: 1, y: 2 }, { x: 3, y: 4 }];
		expect(focusPoints(course, boat, 0, guide)).toEqual([boat, course.marks[0]!, ...guide]);
		expect(focusPoints(course, boat, course.marks.length)).toEqual([course.start, ...course.marks, boat]);
	});

	test("never zooms closer than the minimum span, and eases between views", () => {
		const close = fitView([{ x: 5, y: 5 }, { x: 6, y: 5 }]);
		expect(close.span).toBe(MIN_SPAN);
		const far = { cx: 100, cy: -50, span: 900 };
		expect(easeView(close, far, 0)).toEqual(close);
		expect(easeView(close, far, 1)).toEqual(far);
		expect(easeView(close, far, 0.5).span).toBe((MIN_SPAN + 900) / 2);
	});
});
