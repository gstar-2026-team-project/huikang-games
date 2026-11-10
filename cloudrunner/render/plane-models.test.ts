import { expect, test } from "bun:test";
import { buildGlider, HALF_SPAN, NOSE_Z, TAIL_Z } from "./glider-model";
import type { Tri, V3 } from "./model-kit";

const sub = (a: V3, b: V3) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as const;
const cross = (a: readonly number[], b: readonly number[]) => [
	(a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
	(a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
	(a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
];
const corners = (tris: Tri[]) => tris.flatMap((t) => [t.a, t.b, t.c]);

test("the glider's closed fuselage faces outward, so culling hides only the far side", () => {
	const tris = buildGlider({ roll: 0, pitch: 0 }).filter((t) => !t.twoSided);
	expect(tris.length).toBeGreaterThan(30);
	for (const t of tris) {
		const n = cross(sub(t.b, t.a), sub(t.c, t.a));
		const cx = (t.a[0] + t.b[0] + t.c[0]) / 3, cy = (t.a[1] + t.b[1] + t.c[1]) / 3 - 0.1, cz = (t.a[2] + t.b[2] + t.c[2]) / 3 - 0.5;
		// Outward means pointing away from the fuselage's long axis (or out of an end cap).
		expect((n[0] ?? 0) * cx + (n[1] ?? 0) * cy + (n[2] ?? 0) * cz).toBeGreaterThan(0);
	}
});

test("it is a sailplane: long slender wings, a T-tail, and no engine", () => {
	const all = corners(buildGlider({ roll: 0, pitch: 0 }));
	const xs = all.map((v) => v[0]), zs = all.map((v) => v[2]);
	const span = Math.max(...xs) - Math.min(...xs);
	const length = Math.max(...zs) - Math.min(...zs);
	expect(span).toBe(HALF_SPAN * 2);
	expect(length).toBeCloseTo(NOSE_Z - TAIL_Z, 1);
	expect(span).toBeGreaterThan(length * 1.6);
	// Slender: the wing is many times longer than it is deep at the root.
	const wing = corners(buildGlider({ roll: 0, pitch: 0 }).filter((t) => t.twoSided && t.paint !== "glass")).filter((v) => Math.abs(v[0]) > 0.25 && Math.abs(v[0]) < 0.35);
	const chord = Math.max(...wing.map((v) => v[2])) - Math.min(...wing.map((v) => v[2]));
	expect(span / chord).toBeGreaterThan(12);
	// T-tail: the tailplane sits at the top of the fin, well above the wing root.
	const tail = all.filter((v) => v[2] < -4.2 && Math.abs(v[0]) > 1);
	expect(Math.min(...tail.map((v) => v[1]))).toBeGreaterThan(1.2);
	// Nothing ahead of the nose point: no propeller, no spinner.
	expect(Math.max(...zs)).toBe(NOSE_Z);
	expect(all.filter((v) => v[2] === NOSE_Z)).toHaveLength(6);
});

test("the stick moves the ailerons, the elevator and the rudder", () => {
	const shape = (roll: number, pitch: number) => buildGlider({ roll, pitch }).map((t) => `${t.a.join()}|${t.b.join()}|${t.c.join()}`);
	const still = shape(0, 0);
	const rolled = shape(1, 0), pitched = shape(0, 1);
	expect(rolled).not.toEqual(still);
	expect(pitched).not.toEqual(still);
	expect(rolled).not.toEqual(pitched);
	// Ailerons move opposite ways: one wing's trailing edge up, the other's down.
	const tipTe = (roll: number, side: number) => corners(buildGlider({ roll, pitch: 0 })).filter((v) => v[0] === side * HALF_SPAN).sort((a, b) => a[2] - b[2])[0]!;
	expect(tipTe(1, 1)[1] - tipTe(0, 1)[1]).toBeCloseTo(-(tipTe(1, -1)[1] - tipTe(0, -1)[1]), 6);
	expect(Math.abs(tipTe(1, 1)[1] - tipTe(0, 1)[1])).toBeGreaterThan(0.02);
});
