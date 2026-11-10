import { expect, test } from "bun:test";
import { BEST_GLIDE, BEST_GLIDE_SPEED, CRASH_DURATION, DT, STALL_SPEED } from "./constants";
import { type Controls, createSim, glideRatio, groundBelow, NO_CONTROLS, type Sim, type SimEvent, sinkRate, stepSim, trimPitch } from "./flight";
import { DAILY, DAILY_SECONDS, DAILY_TURNPOINTS, FREE } from "./modes";
import { CLOUD_BASE, START_THERMAL, windOf } from "./thermals";

function fly(sim: Sim, seconds: number, ctl: Controls | ((sim: Sim) => Controls) = NO_CONTROLS): SimEvent[] {
	const events: SimEvent[] = [];
	for (let i = Math.round(seconds / DT); i > 0 && sim.phase !== "ended"; i--) stepSim(sim, typeof ctl === "function" ? ctl(sim) : ctl, DT, events);
	return events;
}

/** Height above the cloud base, where no thermal reaches. */
const HIGH = CLOUD_BASE + 150;

/** A sim moved to still air, high over open country, at speed v on its steady glide. */
function inStillAir(v: number): Sim {
	const sim = createSim(5);
	Object.assign(sim.plane, { x: 60_000, z: 60_000, y: HIGH, v, pitch: trimPitch(v) });
	return sim;
}

test("the glide is about 8:1 near 40 m/s and clearly worse when fast or near the stall", () => {
	expect(glideRatio(BEST_GLIDE_SPEED)).toBeCloseTo(BEST_GLIDE, 6);
	expect(BEST_GLIDE).toBeGreaterThanOrEqual(7);
	expect(BEST_GLIDE).toBeLessThanOrEqual(8);
	expect(glideRatio(60)).toBeLessThan(6);
	expect(glideRatio(80)).toBeLessThan(4);
	expect(glideRatio(STALL_SPEED)).toBeLessThan(glideRatio(BEST_GLIDE_SPEED));
	expect(sinkRate(BEST_GLIDE_SPEED)).toBeCloseTo(BEST_GLIDE_SPEED / Math.hypot(1, BEST_GLIDE), 6);
});

test("hands off, the glider holds its speed and comes down the glide slope", () => {
	const sim = inStillAir(BEST_GLIDE_SPEED);
	const { y, z } = sim.plane;
	fly(sim, 12);
	expect(sim.plane.v).toBeCloseTo(BEST_GLIDE_SPEED, 1);
	expect((sim.plane.z - z) / (y - sim.plane.y)).toBeCloseTo(BEST_GLIDE, 1);
	expect(sim.climb).toBeCloseTo(-sinkRate(BEST_GLIDE_SPEED), 1);
	expect(sim.lift).toBe(0);
});

test("there is no engine: nose down trades height for speed, nose up trades speed for height", () => {
	const dive = inStillAir(BEST_GLIDE_SPEED);
	fly(dive, 3, { roll: 0, pitch: -1 });
	expect(dive.plane.v).toBeGreaterThan(BEST_GLIDE_SPEED + 10);
	expect(dive.plane.y).toBeLessThan(HIGH - 60);
	// Level flight cannot be held: with the nose on the horizon the speed bleeds away.
	const level = inStillAir(BEST_GLIDE_SPEED);
	for (let t = 0; t < 5; t += DT) {
		level.plane.pitch = 0;
		stepSim(level, { roll: 0, pitch: 0.06 }, DT, []);
	}
	expect(level.plane.v).toBeLessThan(BEST_GLIDE_SPEED - 4);
	// A pull-up from a dive climbs, and only for a moment.
	const zoom = inStillAir(70);
	const y0 = zoom.plane.y;
	fly(zoom, 4, { roll: 0, pitch: 1 });
	expect(zoom.plane.y).toBeGreaterThan(y0 + 40);
	expect(zoom.plane.v).toBeLessThan(50);
});

test("below stall speed the nose drops until the glider flies again", () => {
	const sim = inStillAir(STALL_SPEED - 6);
	sim.plane.pitch = 0.3;
	fly(sim, 1.5, { roll: 0, pitch: 0.06 });
	expect(sim.plane.pitch).toBeLessThan(0.3);
	fly(sim, 12);
	expect(sim.plane.v).toBeGreaterThanOrEqual(STALL_SPEED - 0.5);
});

test("bank turns the glider, and a slower glider turns tighter", () => {
	const turnIn = (v: number) => {
		const sim = inStillAir(v);
		fly(sim, 4, (s) => ({ roll: 1, pitch: Math.max(-1, Math.min(1, (trimPitch(v) + (s.plane.v - v) * 0.04 - s.plane.pitch) * 5)) }));
		return sim.plane.yaw;
	};
	expect(turnIn(34)).toBeGreaterThan(1.2);
	expect(turnIn(34)).toBeGreaterThan(turnIn(60) * 1.4);
	const left = inStillAir(40);
	fly(left, 2, { roll: -1, pitch: 0 });
	expect(left.plane.yaw).toBeLessThan(-0.3);
	expect(left.plane.roll).toBeLessThan(-0.8);
});

test("rising air carries the glider up, and the variometer shows it", () => {
	const sim = createSim(9);
	const wind = windOf(9);
	// Parked in the opening thermal's core (by re-centring each step), on a steady glide.
	const events: SimEvent[] = [];
	const y0 = sim.plane.y;
	for (let t = 0; t < 10; t += DT) {
		sim.plane.x = START_THERMAL.x + wind.x * sim.elapsed;
		sim.plane.z = START_THERMAL.z + wind.z * sim.elapsed;
		stepSim(sim, NO_CONTROLS, DT, events);
	}
	expect(sim.lift).toBeCloseTo(START_THERMAL.strength, 3);
	expect(sim.climb).toBeCloseTo(START_THERMAL.strength - sinkRate(BEST_GLIDE_SPEED), 0);
	expect(sim.plane.y).toBeGreaterThan(y0 + 60);
	// The same glide outside the thermal only comes down.
	const out = createSim(9);
	out.plane.y = HIGH;
	fly(out, 5);
	expect(out.climb).toBeLessThan(-4);
});

test("a turnpoint counts once, at any height, the moment the glider is within its radius", () => {
	const sim = createSim(3, DAILY);
	const tp = sim.turnpoints[0]!;
	const events: SimEvent[] = [];
	sim.plane.z = tp.z - tp.r - 5;
	stepSim(sim, NO_CONTROLS, DT, events);
	expect(sim.next).toBe(0);
	fly(sim, 0.5).forEach((e) => events.push(e));
	expect(events.filter((e) => e.kind === "turnpoint")).toEqual([{ kind: "turnpoint", index: 0 }]);
	expect(sim.next).toBe(1);
	expect(sim.lastTurnpointAt).toBeGreaterThan(0);
	expect(sim.fx).toHaveLength(1);
	// Still inside the first beacon's circle: it is not counted again.
	fly(sim, 0.5).forEach((e) => events.push(e));
	expect(events.filter((e) => e.kind === "turnpoint")).toHaveLength(1);
	// High above or low down makes no difference.
	for (const y of [groundBelow(sim) + 30, 1000]) {
		const other = createSim(3, DAILY);
		Object.assign(other.plane, { z: tp.z - 20, y });
		stepSim(other, NO_CONTROLS, DT, []);
		expect(other.next).toBe(1);
	}
});

test("the daily task ends on its last turnpoint; free flight just lays out more", () => {
	const daily = createSim(3, DAILY);
	const events: SimEvent[] = [];
	for (const tp of daily.turnpoints) {
		Object.assign(daily.plane, { x: tp.x, z: tp.z, y: 900 });
		stepSim(daily, NO_CONTROLS, DT, events);
	}
	expect(daily.next).toBe(DAILY_TURNPOINTS);
	expect(daily.phase).toBe("ended");
	expect(daily.endReason).toBe("complete");
	expect(events.at(-1)).toEqual({ kind: "complete" });
	const free = createSim(3, FREE);
	for (let i = 0; i < 9; i++) {
		const tp = free.turnpoints[free.next]!;
		Object.assign(free.plane, { x: tp.x, z: tp.z, y: 900 });
		stepSim(free, NO_CONTROLS, DT, events);
	}
	expect(free.next).toBe(9);
	expect(free.phase).toBe("flying");
	expect(free.turnpoints.length).toBe(12);
});

test("touching the ground lands out: a crash, then the end", () => {
	const sim = createSim(2, DAILY);
	const events = fly(sim, 60, { roll: 0, pitch: -1 });
	expect(events.map((e) => e.kind)).toEqual(["crash", "ended"]);
	expect(sim.endReason).toBe("ground");
	expect(sim.burst.length).toBeGreaterThan(0);
	expect(sim.crashT).toBeGreaterThanOrEqual(CRASH_DURATION);
	expect(sim.plane.y).toBeLessThanOrEqual(groundBelow(sim) + 5);
});

test("the daily task is called off at its time limit; free flight has none", () => {
	const sim = createSim(2, DAILY);
	sim.elapsed = DAILY_SECONDS - 0.5;
	sim.plane.y = 900;
	const events = fly(sim, 2);
	expect(events).toEqual([{ kind: "timeout" }]);
	expect(sim.endReason).toBe("time");
	const free = createSim(2, FREE);
	free.elapsed = DAILY_SECONDS - 0.5;
	free.plane.y = 900;
	fly(free, 2);
	expect(free.phase).toBe("flying");
});

test("the same seed and inputs give the same flight, whatever the frame rate that drove it", () => {
	const weave = (s: Sim): Controls => ({ roll: Math.sin(s.elapsed * 0.7), pitch: Math.sin(s.elapsed * 1.3) * 0.3 });
	const a = createSim(77, DAILY), b = createSim(77, DAILY);
	fly(a, 40, weave);
	// The loop feeds whole fixed steps however frames arrive: same steps, same flight.
	for (let i = 0; i < 600 && b.phase !== "ended"; i++) for (let k = 0; k < 4; k++) stepSim(b, weave(b), DT, []);
	expect(b.plane).toEqual(a.plane);
	expect(b.elapsed).toBe(a.elapsed);
	const c = createSim(78, DAILY);
	fly(c, 40, weave);
	expect(c.plane).not.toEqual(a.plane);
});
