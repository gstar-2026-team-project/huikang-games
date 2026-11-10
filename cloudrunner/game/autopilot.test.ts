import { expect, test } from "bun:test";
import { autopilot, heightToGlide, PLAN_GLIDE, planRoute } from "./autopilot";
import { DT } from "./constants";
import { createSim, glideRatio, NO_CONTROLS, type Sim, type SimEvent, stepSim } from "./flight";
import { DAILY, DAILY_SECONDS, DAILY_TURNPOINTS, daySeed, FREE } from "./modes";
import { terrainHeight } from "./terrain";

/** Fly a whole flight on the autopilot; returns how many separate climbs it made. */
function flyOnAutopilot(sim: Sim, maxSeconds = Number.POSITIVE_INFINITY): number {
	const events: SimEvent[] = [];
	let plan = planRoute(sim);
	let climbs = 0;
	while (sim.phase !== "ended" && sim.elapsed < maxSeconds) {
		const next = planRoute(sim, plan);
		if (next.mode === "climb" && plan.mode !== "climb") climbs++;
		plan = next;
		stepSim(sim, autopilot(sim, plan), DT, events);
	}
	return climbs;
}

const DAYS = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(2026, 10, 10) + i * 86_400_000).toISOString().slice(0, 10));

test("the autopilot completes the daily task inside the time limit, day after day, and has to climb to do it", () => {
	const times: number[] = [];
	let climbs = 0;
	for (const day of DAYS) {
		const sim = createSim(daySeed(day), DAILY);
		climbs += flyOnAutopilot(sim);
		expect(`${day} ${sim.endReason} ${sim.next}`).toBe(`${day} complete ${DAILY_TURNPOINTS}`);
		expect(sim.elapsed).toBeLessThan(DAILY_SECONDS);
		expect(sim.lastTurnpointAt).toBeCloseTo(sim.elapsed, 6);
		times.push(sim.elapsed);
	}
	times.sort((a, b) => a - b);
	// A typical day takes two to three and a half minutes, with two or more climbs.
	const median = times[times.length >> 1]!;
	expect(median).toBeGreaterThan(120);
	expect(median).toBeLessThan(210);
	expect(climbs / DAYS.length).toBeGreaterThanOrEqual(2);
});

test("a hands-off flight glides through the first beacon and then lands out: nobody finishes without flying", () => {
	for (const day of DAYS) {
		const sim = createSim(daySeed(day), DAILY);
		const events: SimEvent[] = [];
		while (sim.phase !== "ended") stepSim(sim, NO_CONTROLS, DT, events);
		expect(sim.next).toBe(1);
		expect(sim.endReason).toBe("ground");
	}
});

test("steering straight for the beacons without ever circling rarely finishes: the lift met on the way is not enough", () => {
	let finished = 0;
	for (const day of DAYS) {
		const sim = createSim(daySeed(day), DAILY);
		const events: SimEvent[] = [];
		while (sim.phase !== "ended") stepSim(sim, autopilot(sim, { ...planRoute(sim), mode: "glide", thermal: null }), DT, events);
		if (sim.endReason === "complete") finished++;
	}
	expect(finished).toBeLessThan(DAYS.length / 4);
});

test("in free flight the autopilot keeps rounding turnpoints", () => {
	const sim = createSim(977, FREE);
	flyOnAutopilot(sim, 400);
	expect(sim.next).toBeGreaterThanOrEqual(5);
});

test("the plan is a pure function of the flight: glide when in range, otherwise a live thermal within reach", () => {
	const sim = createSim(daySeed(DAYS[0]!), DAILY);
	const first = planRoute(sim);
	expect(planRoute(sim)).toEqual(first);
	// At launch the task is out of range, and the opening thermal is right there.
	expect(first.mode).toBe("seek");
	expect(first.thermal?.id).toBe(-1);
	expect(first.turnpoint).toBe(sim.turnpoints[0]!);
	// With all the height in the sky, it simply glides.
	const high = createSim(daySeed(DAYS[0]!), DAILY);
	high.next = DAILY_TURNPOINTS - 1;
	const last = high.turnpoints[high.next]!;
	Object.assign(high.plane, { x: last.x - 800, z: last.z, y: 1000 });
	expect(planRoute(high)).toMatchObject({ mode: "glide", thermal: null, turnpoint: last });
	// Inside the opening thermal and still low: it circles, and keeps circling.
	const climbing = createSim(daySeed(DAYS[0]!), DAILY);
	fly: for (let plan = planRoute(climbing); ; plan = planRoute(climbing, plan)) {
		if (plan.mode === "climb") {
			expect(plan.thermal?.id).toBe(-1);
			const y = climbing.plane.y;
			for (let t = 0; t < 8; t += DT) {
				plan = planRoute(climbing, plan);
				expect(plan.mode).toBe("climb");
				stepSim(climbing, autopilot(climbing, plan), DT, []);
			}
			expect(climbing.plane.y).toBeGreaterThan(y + 40);
			break fly;
		}
		stepSim(climbing, autopilot(climbing, plan), DT, []);
		expect(climbing.elapsed).toBeLessThan(20);
	}
});

test("the planner's glide is more cautious than the real one, and keeps clear of the hills", () => {
	expect(PLAN_GLIDE).toBeLessThan(glideRatio(52) - 0.5);
	const sim = createSim(5);
	const need = heightToGlide(sim.terr, 0, 0, 2000, 500, 100);
	expect(need).toBeGreaterThanOrEqual(terrainHeight(sim.terr, 2000, 500) + 100 + Math.hypot(2000, 500) / PLAN_GLIDE - 1e-6);
	for (let f = 0; f < 1; f += 0.125) {
		const ground = terrainHeight(sim.terr, 2000 * f, 500 * f);
		expect(need - (Math.hypot(2000, 500) * f) / PLAN_GLIDE).toBeGreaterThanOrEqual(ground + 59);
	}
});
