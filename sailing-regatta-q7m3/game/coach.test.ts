import { describe, expect, test } from "bun:test";
import { NO_GO_ANGLE } from "./constants";
import { coachAction, planRoute, TACK_ANGLE } from "./coach";

const DEG = Math.PI / 180;
const wind = 0; // from the north

describe("planRoute", () => {
	test("goes straight to a buoy that is off the wind", () => {
		const plan = planRoute({ x: 0, y: 0, heading: 0, speed: 10 }, { x: 100, y: 10 }, wind, 1);
		expect(plan.route).toHaveLength(2);
		expect(plan.heading).toBeCloseTo(Math.atan2(100, 10), 5);
	});

	test("tacks up to an upwind buoy: current tack to the layline, then one tack", () => {
		const boat = { x: 0, y: 0, heading: 50 * DEG, speed: 10 };
		const plan = planRoute(boat, { x: 0, y: 150 }, wind, 1);
		expect(plan.route).toHaveLength(3);
		expect(plan.side).toBe(1);
		expect(plan.heading).toBeCloseTo(TACK_ANGLE, 5);
		const [a, corner, buoy] = plan.route as [typeof boat, typeof boat, typeof boat];
		expect(corner.x).toBeGreaterThan(0);
		// Both legs are exactly the planned angle off the wind.
		expect(Math.atan2(corner.x - a.x, corner.y - a.y)).toBeCloseTo(TACK_ANGLE, 5);
		expect(Math.atan2(buoy.x - corner.x, buoy.y - corner.y)).toBeCloseTo(-TACK_ANGLE, 5);
	});

	test("past the layline, it heads straight for the buoy on the other tack, and says tack", () => {
		// Up and to the right of the buoy's layline while still on the right-hand tack.
		const boat = { x: 150, y: 100, heading: 50 * DEG, speed: 10 };
		const plan = planRoute(boat, { x: 0, y: 150 }, wind, 1);
		expect(plan.route).toHaveLength(2);
		expect(plan.heading).toBeLessThan(-TACK_ANGLE);
		expect(coachAction(boat, plan.heading, wind)).toEqual({ kind: "tack", dir: -1 });
	});

	test("keeps its tack while the boat points straight into the wind", () => {
		const boat = { x: 0, y: 0, heading: 0, speed: 1 };
		expect(planRoute(boat, { x: 0, y: 150 }, wind, -1).side).toBe(-1);
		expect(planRoute(boat, { x: 0, y: 150 }, wind, 1).side).toBe(1);
	});

	test("never plans a leg inside the no-go zone", () => {
		for (let x = -150; x <= 150; x += 25) {
			for (let h = -180; h < 180; h += 30) {
				const plan = planRoute({ x, y: 0, heading: h * DEG, speed: 8 }, { x: 0, y: 140 }, wind, 1);
				for (let i = 1; i < plan.route.length; i++) {
					const a = plan.route[i - 1]!;
					const b = plan.route[i]!;
					if (Math.hypot(b.x - a.x, b.y - a.y) < 1) continue;
					expect(Math.abs(Math.atan2(b.x - a.x, b.y - a.y))).toBeGreaterThan(NO_GO_ANGLE);
				}
			}
		}
	});
});

describe("coachAction", () => {
	const boat = (heading: number) => ({ x: 0, y: 0, heading: heading * DEG, speed: 10 });
	test("hold, turn left, turn right", () => {
		expect(coachAction(boat(90), 92 * DEG, wind)).toEqual({ kind: "hold" });
		expect(coachAction(boat(90), 60 * DEG, wind)).toEqual({ kind: "turn", dir: -1 });
		expect(coachAction(boat(90), 140 * DEG, wind)).toEqual({ kind: "turn", dir: 1 });
	});
	test("crossing the wind upwind is a tack, turning toward the wind", () => {
		expect(coachAction(boat(50), -50 * DEG, wind)).toEqual({ kind: "tack", dir: -1 });
		expect(coachAction(boat(-50), 50 * DEG, wind)).toEqual({ kind: "tack", dir: 1 });
	});
	test("crossing downwind is just a turn, not a tack", () => {
		expect(coachAction(boat(150), -150 * DEG, wind).kind).toBe("turn");
	});
});
