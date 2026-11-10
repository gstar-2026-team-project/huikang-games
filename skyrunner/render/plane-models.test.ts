import { expect, test } from "bun:test";
import { buildJet } from "./jet-model";
import type { PlanePose, Tri, V3 } from "./model-kit";
import { buildProp } from "./prop-model";

const sub = (a: V3, b: V3) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]] as const;
const cross = (a: readonly number[], b: readonly number[]) => [
	(a[1] ?? 0) * (b[2] ?? 0) - (a[2] ?? 0) * (b[1] ?? 0),
	(a[2] ?? 0) * (b[0] ?? 0) - (a[0] ?? 0) * (b[2] ?? 0),
	(a[0] ?? 0) * (b[1] ?? 0) - (a[1] ?? 0) * (b[0] ?? 0),
];

const models: [string, (p: PlanePose) => Tri[]][] = [["jet", (p) => buildJet(p)], ["prop plane", (p) => buildProp(p)]];
for (const [name, build] of models) test(`the ${name}'s closed fuselage faces outward, so culling hides only the far side`, () => {
	const tris = build({ roll: 0, pitch: 0 }).filter((t) => !t.twoSided);
	expect(tris.length).toBeGreaterThan(30);
	for (const t of tris) {
		const n = cross(sub(t.b, t.a), sub(t.c, t.a));
		const cx = (t.a[0] + t.b[0] + t.c[0]) / 3, cy = (t.a[1] + t.b[1] + t.c[1]) / 3 - 0.1, cz = (t.a[2] + t.b[2] + t.c[2]) / 3 - 0.5;
		// Outward means pointing away from the fuselage's long axis (or out of an end cap).
		expect((n[0] ?? 0) * cx + (n[1] ?? 0) * cy + (n[2] ?? 0) * cz).toBeGreaterThan(0);
	}
});

test("the stick moves the ailerons and tailplanes", () => {
	const still = buildJet({ roll: 0, pitch: 0 }).map((t) => t.a.join());
	const rolled = buildJet({ roll: 1, pitch: 0 }).map((t) => t.c.join());
	const pitched = buildJet({ roll: 0, pitch: 1 }).map((t) => t.a.join());
	expect(rolled).not.toEqual(buildJet({ roll: 0, pitch: 0 }).map((t) => t.c.join()));
	expect(pitched).not.toEqual(still);
});

test("the propeller turns with its angle", () => {
	const blades = (a: number) => buildProp({ roll: 0, pitch: 0, prop: a }).filter((t) => t.paint === "dark").map((t) => t.b.join());
	expect(blades(0)).not.toEqual(blades(1));
});
