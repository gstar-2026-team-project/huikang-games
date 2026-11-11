import { expect, test } from "bun:test";
import {
	BEST_GLIDE,
	FIRST_TURNPOINT_DISTANCE,
	START_CLEARANCE,
	TURNPOINT_DISTANCE_MIN,
	TURNPOINT_DISTANCE_SPREAD,
	TURNPOINT_RADIUS,
	TURNPOINT_TURN_MAX,
	TURNPOINT_TURN_MIN,
} from "./constants";
import { createSim } from "./flight";
import { DAILY, DAILY_SECONDS, DAILY_TURNPOINTS, dailyDisplay, dailyScore, dayKey, dayLabel, daySeed, decodeDailyScore, FREE } from "./modes";
import { startAltitude } from "./task";
import { terrainHeight } from "./terrain";

test("one seed gives one task; different seeds give different tasks", () => {
	expect(createSim(11, DAILY).turnpoints).toEqual(createSim(11, DAILY).turnpoints);
	expect(createSim(11, DAILY).turnpoints).not.toEqual(createSim(12, DAILY).turnpoints);
	expect(createSim(11, DAILY).turnpoints).toHaveLength(DAILY_TURNPOINTS);
	// Free flight lays out the same first beacons from the same seed.
	expect(createSim(11, FREE).turnpoints).toEqual(createSim(11, DAILY).turnpoints.slice(0, 3));
});

test("the first beacon is dead ahead; every later leg is about 1.2–1.5 km with a modest turn", () => {
	for (let seed = 1; seed <= 60; seed++) {
		const tps = createSim(seed, DAILY).turnpoints;
		expect(tps[0]).toEqual({ x: 0, z: FIRST_TURNPOINT_DISTANCE, r: TURNPOINT_RADIUS, yaw: 0 });
		for (let i = 1; i < tps.length; i++) {
			const a = tps[i - 1]!, b = tps[i]!;
			const dist = Math.hypot(b.x - a.x, b.z - a.z);
			expect(dist).toBeGreaterThanOrEqual(TURNPOINT_DISTANCE_MIN - 1e-6);
			expect(dist).toBeLessThanOrEqual(TURNPOINT_DISTANCE_MIN + TURNPOINT_DISTANCE_SPREAD + 1e-6);
			const turn = Math.abs(b.yaw - a.yaw);
			expect(turn).toBeGreaterThanOrEqual(TURNPOINT_TURN_MIN - 1e-9);
			expect(turn).toBeLessThanOrEqual(TURNPOINT_TURN_MAX + 1e-9);
			expect(b.r).toBe(TURNPOINT_RADIUS);
		}
	}
});

test("the launch is clear of the hills, but far too low to glide the whole task", () => {
	for (let seed = 1; seed <= 60; seed++) {
		const sim = createSim(seed, DAILY);
		expect(sim.plane.y).toBe(startAltitude(sim.terr));
		let length = 0, x = 0, z = 0;
		for (const tp of sim.turnpoints) {
			for (let f = 0; f <= 1; f += 0.1) {
				if (tp === sim.turnpoints[0]) expect(sim.plane.y - terrainHeight(sim.terr, x + (tp.x - x) * f, z + (tp.z - z) * f)).toBeGreaterThanOrEqual(START_CLEARANCE - 1);
			}
			length += Math.hypot(tp.x - x, tp.z - z);
			x = tp.x;
			z = tp.z;
		}
		// Even at the best glide all the way, over ground at sea level, the launch height does not
		// cover the task; over the real hills, with a margin to arrive on, it covers about half.
		expect(sim.plane.y * BEST_GLIDE).toBeLessThan(length);
		expect((sim.plane.y - 220) * BEST_GLIDE).toBeLessThan(length * 0.6);
	}
});

test("the daily score ranks beacons first, then the faster time", () => {
	expect(dailyScore(3, 250)).toBeGreaterThan(dailyScore(2, 10));
	expect(dailyScore(4, 150.3)).toBeGreaterThan(dailyScore(4, 150.4));
	expect(dailyScore(1, 0)).toBeLessThan(dailyScore(2, DAILY_SECONDS));
	expect(decodeDailyScore(dailyScore(3, 142.5))).toEqual({ turnpoints: 3, seconds: 142.5 });
	expect(decodeDailyScore(dailyScore(4, 9999))).toEqual({ turnpoints: 4, seconds: DAILY_SECONDS });
	expect(dailyDisplay(3, 142.5)).toBe("3 beacons · 142.5 s");
	expect(dailyDisplay(1, 20)).toBe("1 beacon · 20.0 s");
});

test("the daily seed depends only on the UTC date", () => {
	expect(dayKey(Date.UTC(2025, 5, 12, 23, 59))).toBe("2025-06-12");
	expect(dayKey(Date.UTC(2025, 5, 13, 0, 0))).toBe("2025-06-13");
	expect(daySeed("2025-06-12")).toBe(daySeed("2025-06-12"));
	expect(daySeed("2025-06-12")).not.toBe(daySeed("2025-06-13"));
	expect(dayLabel("2025-06-12")).toBe("Jun 12");
});
