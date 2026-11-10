import { expect, test } from "bun:test";
import { CRUISE_SPEED, DT, START_TIME } from "./constants";
import { maxClimbFor, maxTurnFor, nextRing, type Ring, ringBonus, ringRadius } from "./course";
import { createSim, gateFault, groundBelow, NO_CONTROLS, type SimEvent, stepSim } from "./flight";
import { FAST_GATE, FULL_SPEED, SLOW_GATE } from "./constants";
import { maxTurnAt, yawRateAt } from "./course";
import { DAILY, DAILY_SECONDS, dailyScore, dayKey, daySeed, decodeDailyScore, LEVEL_COUNT, levelSeed, levelSpec, starsFor } from "./modes";
import { FINALE_LEVEL, levelCourse, levelStars } from "./levels";
import { surfaceHeight, terrainHeight } from "./terrain";

function fly(seed: number, seconds: number, ctl = NO_CONTROLS) {
	const sim = createSim(seed);
	const events: SimEvent[] = [];
	for (let i = 0; i < Math.round(seconds / DT) && sim.phase !== "ended"; i++) stepSim(sim, ctl, DT, events);
	return { sim, events };
}

test("one seed gives one course; different seeds give different courses", () => {
	const a = createSim(7), b = createSim(7), c = createSim(8);
	expect(a.rings).toEqual(b.rings);
	expect(a.terr).toEqual(b.terr);
	expect(c.rings[1]).not.toEqual(a.rings[1]);
});

test("the first ring is straight ahead and level, so hands-off flying scores it", () => {
	for (const seed of [1, 2, 3, 99, 12345]) {
		const { sim, events } = fly(seed, 9);
		expect(sim.score).toBe(1);
		expect(events.filter((e) => e.kind === "ring")).toHaveLength(1);
		expect(sim.timeLeft).toBeCloseTo(START_TIME - 9 + ringBonus(0), 0);
	}
});

test("a flight takes off at full throttle and accelerates from cruise speed", () => {
	const { sim } = fly(4, 6);
	expect(createSim(4).throttle).toBe(1);
	expect(createSim(4).plane.v).toBe(CRUISE_SPEED);
	expect(sim.plane.v).toBeGreaterThan(CRUISE_SPEED + 15);
});

test("a ring counts once, and only after the plane crosses it", () => {
	const sim = createSim(5);
	const events: SimEvent[] = [];
	const ring = sim.rings[0];
	if (!ring) throw new Error("no ring");
	while (sim.plane.z < ring.z - 1) stepSim(sim, NO_CONTROLS, DT, events);
	expect(sim.score).toBe(0);
	for (let i = 0; i < 60; i++) stepSim(sim, NO_CONTROLS, DT, events);
	expect(sim.score).toBe(1);
	expect(sim.next).toBe(1);
	expect(ring.hit).toBe(true);
});

test("diving into the ground crashes and then ends the run", () => {
	const { sim, events } = fly(3, 30, { roll: 0, pitch: -1, throttleRate: 0 });
	expect(sim.phase).toBe("ended");
	expect(sim.endReason).toBe("ground");
	expect(events.map((e) => e.kind)).toContain("crash");
	expect(events.at(-1)?.kind).toBe("ended");
});

test("running out of time ends the run", () => {
	const sim = createSim(11);
	sim.timeLeft = 0.05;
	sim.rings[0] = { ...sim.rings[0]!, z: 1e6 }; // keep the ring out of reach
	const events: SimEvent[] = [];
	for (let i = 0; i < 10; i++) stepSim(sim, NO_CONTROLS, DT, events);
	expect(sim.phase).toBe("ended");
	expect(sim.endReason).toBe("time");
	expect(events.map((e) => e.kind)).toEqual(["timeout"]);
});

test("every generated ring is reachable and clear of the ground", () => {
	for (const seed of [1, 42, 777, 2024]) {
		const sim = createSim(seed);
		const rings: Ring[] = [];
		for (let i = 0; i < 60; i++) rings.push(nextRing(rings[i - 1] ?? null, i, sim.rand, sim.terr));
		for (let i = 1; i < rings.length; i++) {
			const p = rings[i - 1]!, r = rings[i]!;
			const dist = Math.hypot(r.x - p.x, r.z - p.z);
			expect(Math.abs(r.yaw - p.yaw)).toBeLessThanOrEqual(maxTurnFor(dist) + 1e-9);
			expect(r.y - terrainHeight(sim.terr, r.x, r.z)).toBeGreaterThanOrEqual(r.r);
			expect(r.y - p.y).toBeLessThanOrEqual(maxClimbFor(dist) + 1e-9);
		}
	}
});

test("difficulty ramps to a floor", () => {
	expect(ringRadius(0)).toBeGreaterThan(ringRadius(10));
	expect(ringRadius(1000)).toBe(20);
	expect(ringBonus(1000)).toBe(4.5);
	expect(CRUISE_SPEED).toBeGreaterThan(0);
});

test("the same inputs give the same flight", () => {
	const ctl = { roll: 0.4, pitch: 0.2, throttleRate: 0 };
	const a = fly(9, 6, ctl).sim, b = fly(9, 6, ctl).sim;
	expect(a.plane).toEqual(b.plane);
});

test("the throttle sets a wide range of speeds, and slower planes turn tighter", () => {
	const settle = (throttle: number) => {
		const sim = createSim(21);
		sim.throttle = throttle;
		const events: SimEvent[] = [];
		for (let i = 0; i < 60 * 40 && sim.phase === "flying"; i++) {
			sim.timeLeft = 99;
			sim.plane.y = 1200;
			stepSim(sim, NO_CONTROLS, DT, events);
		}
		return sim.plane.v;
	};
	expect(settle(1)).toBeGreaterThan(105);
	expect(settle(0.4)).toBeCloseTo(CRUISE_SPEED, 0);
	expect(settle(0.1)).toBeLessThan(50);
	// Same bank, half the speed: about twice the turn rate.
	const turn = (v: number) => (9.81 * Math.tan(1.1)) / v;
	expect(turn(45)).toBeGreaterThan(turn(100) * 2);
});

test("a level is a fixed, finite course that completes after its last ring", () => {
	const spec = levelSpec(3);
	const a = createSim(levelSeed(3), spec), b = createSim(levelSeed(3), spec);
	expect(a.rings).toEqual(b.rings);
	const events: SimEvent[] = [];
	// Steer straight through each ring by placing the plane just before it.
	for (let i = 0; i < 200 && a.phase === "flying"; i++) {
		const r = a.rings[a.next];
		if (r) a.plane = { ...a.plane, x: r.x - Math.sin(r.yaw) * 0.5, y: r.y, z: r.z - Math.cos(r.yaw) * 0.5, yaw: r.yaw, pitch: 0, v: r.gate === "slow" ? 45 : r.gate === "fast" ? 100 : 73 };
		stepSim(a, NO_CONTROLS, DT, events);
	}
	expect(a.rings).toHaveLength(spec.ringCount ?? 0);
	expect(a.score).toBe(spec.ringCount ?? 0);
	expect(a.endReason).toBe("complete");
	expect(starsFor(3, a.score, true)).toBe(3);
	expect(starsFor(3, a.score, false)).toBe(0);
	expect(starsFor(3, a.score - 1, true)).toBe(2);
	expect(starsFor(3, 0, true)).toBe(0);
});

test("later levels are harder, and the daily seed depends only on the date", () => {
	const first = levelSpec(1), last = levelSpec(LEVEL_COUNT);
	expect((last.ringCount ?? 0)).toBeGreaterThan(first.ringCount ?? 0);
	expect(last.radius(0)).toBeLessThan(first.radius(0));
	expect(last.turn(0)).toBeGreaterThan(first.turn(0));
	expect(daySeed("2025-06-12")).toBe(daySeed("2025-06-12"));
	expect(daySeed("2025-06-12")).not.toBe(daySeed("2025-06-13"));
	expect(dayKey(Date.UTC(2025, 5, 12, 23, 59))).toBe("2025-06-12");
});

test("level rings sit low in a canyon: water under every ring, rock walls to either side", () => {
	for (const level of [1, 6, LEVEL_COUNT - 1]) {
		const spec = levelSpec(level);
		const sim = createSim(levelSeed(level), spec);
		const dims = spec.canyon;
		if (!dims) throw new Error("levels fly canyons");
		expect(sim.rings).toHaveLength(spec.ringCount ?? 0);
		for (const r of sim.rings) {
			expect(sim.terrain.height(r.x, r.z)).toBe(0);
			expect(surfaceHeight(sim.terrain, r.x, r.z)).toBeLessThan(r.y - r.r);
			// Well outside the floor, the walls tower over the ring.
			const off = dims.halfWidth + dims.wallRun + 40;
			const side = Math.max(
				sim.terrain.height(r.x + Math.cos(r.yaw) * off, r.z - Math.sin(r.yaw) * off),
				sim.terrain.height(r.x - Math.cos(r.yaw) * off, r.z + Math.sin(r.yaw) * off),
			);
			expect(side).toBeGreaterThan(r.y + r.r);
		}
		// Take-off is inside the canyon too.
		expect(groundBelow(sim)).toBe(0);
	}
});

test("speed gates: blue rings need under 200 km/h, purple ones over 330, and they arrive from level 3", () => {
	expect(gateFault("slow", SLOW_GATE - 1)).toBeUndefined();
	expect(gateFault("slow", SLOW_GATE + 1)).toBe("fast");
	expect(gateFault("fast", FAST_GATE + 1)).toBeUndefined();
	expect(gateFault("fast", FAST_GATE - 1)).toBe("slow");
	expect(gateFault(undefined, 200)).toBeUndefined();
	const gatesOf = (n: number) => createSim(levelSeed(n), levelSpec(n)).rings.map((r) => r.gate);
	expect(gatesOf(1).filter(Boolean)).toEqual([]);
	expect(gatesOf(2).filter(Boolean)).toEqual([]);
	expect(gatesOf(3)).toContain("slow");
	expect(gatesOf(3)).not.toContain("fast");
	expect(gatesOf(4)).toContain("fast");
	expect(gatesOf(12).filter(Boolean).length).toBeGreaterThan(gatesOf(5).filter(Boolean).length);
});

test("a slow gate's hairpin is one a slow plane can make and a full-throttle plane cannot", () => {
	for (let n = 3; n <= LEVEL_COUNT; n++) {
		const rings = createSim(levelSeed(n), levelSpec(n)).rings;
		rings.forEach((r, i) => {
			if (r.gate !== "slow") return;
			const p = rings[i - 1]!;
			const dist = Math.hypot(r.x - p.x, r.z - p.z);
			const turn = Math.abs(r.yaw - p.yaw);
			expect(turn).toBeLessThanOrEqual(maxTurnAt(dist, SLOW_GATE) + 1e-9);
			// Full bank at full speed for the whole leg still falls short of 1.6× the turn asked.
			expect(yawRateAt(FULL_SPEED) * (dist / FULL_SPEED)).toBeLessThan(turn * 1.6);
		});
	}
});

test("passing a gate at the wrong speed is a miss with a reason", () => {
	const sim = createSim(levelSeed(4), levelSpec(4));
	const events: SimEvent[] = [];
	const gi = sim.rings.findIndex((r) => r.gate === "slow");
	sim.next = gi;
	const r = sim.rings[gi]!;
	sim.plane = { ...sim.plane, x: r.x - Math.sin(r.yaw) * 0.5, y: r.y, z: r.z - Math.cos(r.yaw) * 0.5, yaw: r.yaw, pitch: 0, v: 100 };
	stepSim(sim, NO_CONTROLS, DT, events);
	expect(events.find((e) => e.kind === "miss")).toMatchObject({ kind: "miss", why: "fast" });
	expect(sim.score).toBe(0);
});

test("the last level flies the mission course, and the others are generated canyons", () => {
	expect(levelCourse(FINALE_LEVEL).authored).toBeDefined();
	expect(levelCourse(FINALE_LEVEL - 1).authored).toBeUndefined();
	expect(levelStars(FINALE_LEVEL, 15, true, false)).toBe(0);
	expect(levelStars(FINALE_LEVEL, 15, true, true)).toBe(3);
});

test("the daily run is a fixed 40-second clock: rings add no time, and the last ring's time is kept", () => {
	const sim = createSim(daySeed("2025-06-12"), DAILY);
	expect(sim.timeLeft).toBe(DAILY_SECONDS);
	const events: SimEvent[] = [];
	for (let i = 0; i < 60 * 9; i++) stepSim(sim, NO_CONTROLS, DT, events);
	expect(sim.score).toBe(1);
	expect(sim.timeLeft).toBeCloseTo(DAILY_SECONDS - 9, 5);
	expect(sim.lastRingAt).toBeGreaterThan(3);
	expect(sim.lastRingAt).toBeLessThan(9);
	expect(decodeDailyScore(dailyScore(12, 31.4))).toEqual({ rings: 12, seconds: 31.4 });
	expect(dailyScore(12, 39.9)).toBeGreaterThan(dailyScore(11, 1));
	expect(dailyScore(12, 30)).toBeGreaterThan(dailyScore(12, 31));
});
