import { expect, test } from "bun:test";
import { createSim } from "./flight";
import { beaconPointer, liftPointer, relativeBearing } from "./guide";
import { DAILY } from "./modes";
import { START_THERMAL } from "./thermals";

test("bearings are relative to the heading: ahead is 0, right is positive, behind is ±π", () => {
	const sim = createSim(3, DAILY);
	const p = sim.plane;
	p.x = 0; p.z = 0; p.yaw = 0;
	expect(relativeBearing(sim, 0, 100)).toBeCloseTo(0, 6);
	expect(relativeBearing(sim, 100, 0)).toBeCloseTo(Math.PI / 2, 6);
	expect(relativeBearing(sim, -100, 0)).toBeCloseTo(-Math.PI / 2, 6);
	expect(Math.abs(relativeBearing(sim, 0, -100))).toBeCloseTo(Math.PI, 6);
	p.yaw = Math.PI / 2;
	expect(relativeBearing(sim, 100, 0)).toBeCloseTo(0, 6);
});

test("the beacon pointer gives the next beacon's distance, and nothing once the task is done", () => {
	const sim = createSim(3, DAILY);
	const tp = sim.turnpoints[0]!;
	expect(beaconPointer(sim)?.dist).toBeCloseTo(Math.hypot(tp.x - sim.plane.x, tp.z - sim.plane.z), 6);
	sim.next = sim.turnpoints.length;
	expect(beaconPointer(sim)).toBeNull();
});

test("the lift pointer points at the opening thermal ahead, and hides once climbing inside the lift", () => {
	const sim = createSim(3, DAILY);
	sim.elapsed = 20;
	const ptr = liftPointer(sim, false);
	expect(ptr).not.toBeNull();
	expect(Math.abs(ptr!.rel)).toBeLessThan(0.5);
	expect(ptr!.dist).toBeLessThan(START_THERMAL.z + 200);
	// Put the glider in the core of that thermal: no chip once it climbs.
	const p = sim.plane;
	const before = { x: p.x, z: p.z };
	p.x = before.x + Math.sin(p.yaw + ptr!.rel) * ptr!.dist;
	p.z = before.z + Math.cos(p.yaw + ptr!.rel) * ptr!.dist;
	expect(liftPointer(sim, true)).toBeNull();
	expect(liftPointer(sim, false)?.dist).toBeLessThan(5);
});
