import { expect, test } from "bun:test";
import { createSim } from "./flight";
import { idealPath, PATH_BUFFER_LENGTH, PATH_RINGS, PATH_SAMPLES_PER_LEG } from "./ideal-path";

test("the ideal path starts at the plane and passes through the centre of each of the next rings", () => {
	const sim = createSim(7);
	const out = new Float32Array(PATH_BUFFER_LENGTH);
	const count = idealPath(sim.plane, sim.rings, sim.next, out);
	expect(count).toBe(PATH_RINGS * PATH_SAMPLES_PER_LEG + 1);
	expect([out[0], out[1], out[2]]).toEqual([sim.plane.x, sim.plane.y, sim.plane.z]);
	for (let leg = 1; leg <= PATH_RINGS; leg++) {
		const ring = sim.rings[sim.next + leg - 1]!;
		const o = leg * PATH_SAMPLES_PER_LEG * 3;
		expect(out[o]).toBeCloseTo(ring.x, 2);
		expect(out[o + 1]).toBeCloseTo(ring.y, 2);
		expect(out[o + 2]).toBeCloseTo(ring.z, 2);
	}
});

test("the path crosses a ring square-on and stops at the last ring of a course", () => {
	const sim = createSim(7);
	const out = new Float32Array(PATH_BUFFER_LENGTH);
	idealPath(sim.plane, sim.rings, sim.next, out);
	const ring = sim.rings[sim.next]!;
	const o = PATH_SAMPLES_PER_LEG * 3;
	// The step just after the ring heads along the ring's facing, not sideways.
	const dx = out[o + 3]! - out[o]!;
	const dz = out[o + 5]! - out[o + 2]!;
	const along = dx * Math.sin(ring.yaw) + dz * Math.cos(ring.yaw);
	const across = dx * Math.cos(ring.yaw) - dz * Math.sin(ring.yaw);
	expect(along).toBeGreaterThan(0);
	expect(Math.abs(across)).toBeLessThan(along * 0.2);

	const lastOnly = idealPath(sim.plane, sim.rings.slice(0, 1), 0, out);
	expect(lastOnly).toBe(PATH_SAMPLES_PER_LEG + 1);
	expect(idealPath(sim.plane, [], 0, out)).toBe(1);
});
