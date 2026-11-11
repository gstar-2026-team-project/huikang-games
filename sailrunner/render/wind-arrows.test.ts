import { expect, test } from "bun:test";
import { Matrix4, Vector3 } from "three";
import { readPalette } from "./palette";
import { WindArrows } from "./wind-arrows";

function positions(arrows: WindArrows): Vector3[] {
	const m = new Matrix4();
	const out: Vector3[] = [];
	for (let i = 0; i < arrows.mesh.count; i++) {
		arrows.mesh.getMatrixAt(i, m);
		out.push(new Vector3().setFromMatrixPosition(m));
	}
	return out;
}

test("with the boat stopped, every arrow slides the way it points, at the drift speed", () => {
	const arrows = new WindArrows(readPalette());
	for (const wind of [0, 1, 2.5, -2]) {
		// Downwind in world xz (sim y is world -z).
		const blow = wind + Math.PI;
		const dir = new Vector3(Math.sin(blow), 0, -Math.cos(blow));
		arrows.update(30, -40, wind, 10);
		const a = positions(arrows);
		arrows.update(30, -40, wind, 10.05);
		const b = positions(arrows);
		let checked = 0;
		a.forEach((p, i) => {
			const step = b[i]!.clone().sub(p);
			// Skip arrows that started a new life (moved to a fresh spot) or wrapped.
			if (step.length() > 1) return;
			expect(step.length()).toBeCloseTo(4 * 0.05, 3);
			expect(step.normalize().dot(dir)).toBeCloseTo(1, 5);
			checked++;
		});
		expect(checked).toBeGreaterThan(150);
	}
});
