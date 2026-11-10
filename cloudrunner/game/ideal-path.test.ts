import { expect, test } from "bun:test";
import { planRoute } from "./autopilot";
import { createSim } from "./flight";
import { idealPath, PATH_BUFFER_LENGTH, PATH_SAMPLES_PER_LEG } from "./ideal-path";
import { DAILY } from "./modes";
import { terrainHeight } from "./terrain";

const at = (out: Float32Array, k: number) => [out[k * 3]!, out[k * 3 + 1]!, out[k * 3 + 2]!] as const;

test("with a thermal in the plan, the path runs from the glider to the thermal, up it, and on to the beacon", () => {
	const sim = createSim(7, DAILY);
	const plan = planRoute(sim);
	expect(plan.mode).toBe("seek");
	const th = plan.thermal!, tp = plan.turnpoint!;
	const out = new Float32Array(PATH_BUFFER_LENGTH);
	const count = idealPath(sim, plan, out);
	expect(count).toBe(2 * PATH_SAMPLES_PER_LEG + 2);
	expect(count * 3).toBe(PATH_BUFFER_LENGTH);
	expect(at(out, 0)).toEqual([sim.plane.x, sim.plane.y, sim.plane.z]);
	// The first leg ends at the thermal, lower than it started.
	const arrive = at(out, PATH_SAMPLES_PER_LEG);
	expect(arrive[0]).toBeCloseTo(th.x, 2);
	expect(arrive[2]).toBeCloseTo(th.z, 2);
	expect(arrive[1]).toBeLessThan(sim.plane.y);
	// Then straight up, never down, to the height the next leg needs.
	const top = at(out, PATH_SAMPLES_PER_LEG + 1);
	expect(top[0]).toBeCloseTo(th.x, 2);
	expect(top[2]).toBeCloseTo(th.z, 2);
	expect(top[1]).toBeGreaterThanOrEqual(arrive[1]);
	// And it ends over the beacon, above the ground all the way.
	const end = at(out, count - 1);
	expect(end[0]).toBeCloseTo(tp.x, 2);
	expect(end[2]).toBeCloseTo(tp.z, 2);
	for (let k = 1; k < count; k++) {
		const [x, y, z] = at(out, k);
		expect(y).toBeGreaterThanOrEqual(terrainHeight(sim.terr, x, z) + 24.9);
	}
});

test("with the beacon in range the path is one straight glide to it", () => {
	const sim = createSim(7, DAILY);
	sim.plane.y = 1000;
	const tp = sim.turnpoints[0]!;
	const out = new Float32Array(PATH_BUFFER_LENGTH);
	const count = idealPath(sim, { mode: "glide", thermal: null, turnpoint: tp, need: 0, goal: 0 }, out);
	expect(count).toBe(PATH_SAMPLES_PER_LEG + 1);
	const end = at(out, count - 1);
	expect(end[0]).toBeCloseTo(tp.x, 2);
	expect(end[2]).toBeCloseTo(tp.z, 2);
	expect(end[1]).toBeLessThan(sim.plane.y);
	expect(end[1]).toBeGreaterThan(sim.plane.y - 200);
	// Evenly spaced along a straight line.
	const mid = at(out, PATH_SAMPLES_PER_LEG / 2);
	expect(mid[2]).toBeCloseTo((sim.plane.z + tp.z) / 2, 2);
	expect(idealPath(sim, { mode: "glide", thermal: null, turnpoint: null, need: 0, goal: 0 }, out)).toBe(1);
});
