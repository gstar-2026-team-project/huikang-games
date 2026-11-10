import { InstancedMesh, MeshBasicMaterial, Object3D, Shape, ShapeGeometry } from "three";
import type { Palette } from "./palette";

/** Arrows sit on a square lattice this far apart (world units). */
const SPACING = 20;
/** Lattice points per side; the patch re-centres on the boat as it moves. */
const PER_SIDE = 13;
const EXTENT = SPACING * PER_SIDE;
/** How fast the arrows drift downwind, so the direction reads at a glance. */
const DRIFT_SPEED = 5;

/** Flat arrow pointing along +Y, about 8 units long. */
function arrowShape(): Shape {
	const shape = new Shape();
	shape.moveTo(-0.45, -4);
	shape.lineTo(0.45, -4);
	shape.lineTo(0.45, 1);
	shape.lineTo(1.7, 1);
	shape.lineTo(0, 4);
	shape.lineTo(-1.7, 1);
	shape.lineTo(-0.45, 1);
	shape.closePath();
	return shape;
}

/** Arrows lying on the water all around the boat, pointing and drifting the way the wind blows. */
export class WindArrows {
	readonly mesh: InstancedMesh;
	private dummy = new Object3D();

	constructor(palette: Palette) {
		const geometry = new ShapeGeometry(arrowShape());
		// Lay the arrow flat on the water: +Y becomes -Z, which is north in sim space.
		geometry.rotateX(-Math.PI / 2);
		this.mesh = new InstancedMesh(
			geometry,
			new MeshBasicMaterial({ color: palette.fleck, transparent: true, opacity: 0.5, depthWrite: false }),
			PER_SIDE * PER_SIDE,
		);
		// Instances move far from the mesh origin; a stale bounding sphere would cull them.
		this.mesh.frustumCulled = false;
	}

	setPalette(palette: Palette): void {
		(this.mesh.material as MeshBasicMaterial).color.copy(palette.fleck);
	}

	/** `wind` is where the wind comes from (sim heading); the arrows point the other way. */
	update(focusX: number, focusZ: number, wind: number, timeSec: number): void {
		const blow = wind + Math.PI;
		const driftX = Math.sin(blow) * DRIFT_SPEED * timeSec;
		const driftZ = -Math.cos(blow) * DRIFT_SPEED * timeSec;
		let index = 0;
		for (let i = 0; i < PER_SIDE; i++) {
			for (let j = 0; j < PER_SIDE; j++) {
				// Offset alternate rows so the field does not read as a rigid grid.
				const baseX = i * SPACING + (j % 2) * (SPACING / 2) + driftX;
				const baseZ = j * SPACING + driftZ;
				const x = baseX + EXTENT * Math.round((focusX - baseX) / EXTENT);
				const z = baseZ + EXTENT * Math.round((focusZ - baseZ) / EXTENT);
				this.dummy.position.set(x, 0.045, z);
				this.dummy.rotation.set(0, -blow, 0);
				this.dummy.updateMatrix();
				this.mesh.setMatrixAt(index++, this.dummy.matrix);
			}
		}
		this.mesh.instanceMatrix.needsUpdate = true;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		(this.mesh.material as MeshBasicMaterial).dispose();
	}
}
