import { expect, test } from "bun:test";
import { DT, FULL_SPEED, TIGHT_TURN_SPEED } from "./constants";
import { CORNER, CORNER_RADIUS, CORNER_RINGS } from "./corner";
import { maxClimbFor, yawRateAt } from "./course";
import { createSim, groundBelow, NO_CONTROLS, type SimEvent, stepSim } from "./flight";
import { CORNER_LEVEL, levelCourse, levelStars } from "./levels";
import { levelSeed } from "./modes";
import { surfaceHeight } from "./terrain";
import { sinkingIntoGround } from "../ui/hud";

test("level 6 is the hand-built corner run: one 90° turn, a climb, a dive, and it ends on the target", () => {
	expect(levelCourse(CORNER_LEVEL)).toBe(CORNER);
	const sim = createSim(levelSeed(CORNER_LEVEL), CORNER);
	const rings = sim.rings;
	expect(rings).toHaveLength(CORNER_RINGS);
	const turns = rings.slice(1).map((r, i) => r.yaw - (rings[i]?.yaw ?? 0)).filter((t) => Math.abs(t) > 0.01);
	expect(turns).toEqual([Math.PI / 2]);
	expect(rings.at(-1)?.target).toBe(true);
	expect(rings.filter((r) => r.target)).toHaveLength(1);
	const ys = rings.map((r) => r.y);
	expect(Math.max(...ys)).toBeGreaterThan(300);
	expect(ys.at(-1) ?? 99).toBeLessThan(60);
	for (let i = 1; i < rings.length; i++) {
		const a = rings[i - 1]!, b = rings[i]!;
		expect(Math.abs(b.y - a.y)).toBeLessThanOrEqual(maxClimbFor(Math.hypot(b.x - a.x, b.z - a.z)));
	}
	expect(groundBelow(sim)).toBe(0);
});

test("the corner fits a cruising plane but not a flat-out one", () => {
	const radius = (v: number) => v / yawRateAt(v);
	expect(radius(TIGHT_TURN_SPEED)).toBeLessThan(CORNER_RADIUS);
	expect(radius(73)).toBeLessThan(CORNER_RADIUS);
	expect(radius(FULL_SPEED)).toBeGreaterThan(CORNER_RADIUS);
});

test("the ground under the route stays clear of the straight line between rings", () => {
	const sim = createSim(levelSeed(CORNER_LEVEL), CORNER);
	const pts = [{ x: 0, y: sim.plane.y, z: 0 }, ...sim.rings];
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1]!, b = pts[i]!;
		if (i === 3) continue; // the corner leg is flown as an arc, not a chord
		for (let k = 0; k <= 40; k++) {
			const f = k / 40;
			expect(a.y + (b.y - a.y) * f - surfaceHeight(sim.terrain, a.x + (b.x - a.x) * f, a.z + (b.z - a.z) * f)).toBeGreaterThan(20);
		}
	}
});

test("flying ring to ring completes it; stars need the target", () => {
	const sim = createSim(levelSeed(CORNER_LEVEL), CORNER);
	const events: SimEvent[] = [];
	for (let i = 0; i < 200 && sim.phase === "flying"; i++) {
		const r = sim.rings[sim.next];
		if (r) sim.plane = { ...sim.plane, x: r.x - Math.sin(r.yaw) * 0.5, y: r.y, z: r.z - Math.cos(r.yaw) * 0.5, yaw: r.yaw, pitch: 0 };
		stepSim(sim, NO_CONTROLS, DT, events);
	}
	expect(sim.endReason).toBe("complete");
	expect(levelStars(CORNER_LEVEL, CORNER_RINGS, true, true)).toBe(3);
	expect(levelStars(CORNER_LEVEL, CORNER_RINGS - 1, true, true)).toBe(2);
	expect(levelStars(CORNER_LEVEL, CORNER_RINGS - 1, true, false)).toBe(0);
});

test("the pull-up warning ignores steady low flight and fires when the ground is coming fast", () => {
	expect(sinkingIntoGround(40, 0)).toBe(false); // cruising the canyon floor
	expect(sinkingIntoGround(40, -5)).toBe(false); // 8 s from the water
	expect(sinkingIntoGround(40, -20)).toBe(true); // 2 s from the water
	expect(sinkingIntoGround(8, 0)).toBe(true); // skimming
	expect(sinkingIntoGround(8, 5)).toBe(false); // already climbing away
});
