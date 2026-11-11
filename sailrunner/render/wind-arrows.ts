import { InstancedMesh, MeshBasicMaterial, Object3D, Shape, ShapeGeometry } from "three";
import type { Palette } from "./palette";
import { rideSwell } from "./swell";

/** Arrows sit one per cell of a square lattice this far apart (world units). */
const SPACING = 20;
/** Lattice cells per side of the patch kept around the boat. */
const PER_SIDE = 13;
const EXTENT = SPACING * PER_SIDE;
/** How fast the arrows drift downwind over the water (m/s), like foam blown along. */
const DRIFT_SPEED = 4;
/** Each arrow grows in, drifts, and shrinks away over this many seconds, out of step with its neighbours. */
const LIFE_S = 4;
/** Arrows shrink to nothing toward the edge of the patch, so none pops in or out in view. */
const FADE_START = 0.55;
/** Arrows closer than this to the camera (m) shrink away. */
const NEAR_CAMERA = 7;

/** Deterministic 0..1 value for lattice cell (i, j) and salt k. */
function hash(i: number, j: number, k: number): number {
	const h = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
	return h - Math.floor(h);
}

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

/**
 * Arrows lying on the water around the boat, pointing the way the wind blows
 * and carried downwind over the sea. They belong to the water, not the boat:
 * sail downwind faster than they drift and you overtake them; sail upwind and
 * they stream past. Each fades in and out on its own clock, and they thin out
 * toward the edge of the patch, which follows the boat without any arrow
 * jumping in view.
 */
export class WindArrows {
	readonly mesh: InstancedMesh;
	private dummy = new Object3D();

	constructor(palette: Palette) {
		const geometry = new ShapeGeometry(arrowShape());
		// Lay the arrow flat on the water: +Y becomes -Z, which is north in sim space.
		geometry.rotateX(-Math.PI / 2);
		this.mesh = new InstancedMesh(
			geometry,
			rideSwell(
				new MeshBasicMaterial({ color: palette.fleck, transparent: true, opacity: 0.6, depthWrite: false }),
			),
			PER_SIDE * PER_SIDE,
		);
		// Instances move far from the mesh origin; a stale bounding sphere would cull them.
		this.mesh.frustumCulled = false;
	}

	setPalette(palette: Palette): void {
		(this.mesh.material as MeshBasicMaterial).color.copy(palette.fleck);
	}

	/**
	 * `wind` is where the wind comes from (sim heading); the arrows point and
	 * drift the other way. Pass the camera's position to shrink the few arrows
	 * passing right under it, which would otherwise fill the screen.
	 */
	update(focusX: number, focusZ: number, wind: number, timeSec: number, camera?: { x: number; z: number }): void {
		const blow = wind + Math.PI;
		const dirX = Math.sin(blow);
		const dirZ = -Math.cos(blow);
		const half = EXTENT / 2;
		let index = 0;
		for (let i = 0; i < PER_SIDE; i++) {
			for (let j = 0; j < PER_SIDE; j++) {
				// Its own clock: each life it appears at a fresh spot in its cell and drifts downwind.
				const t = timeSec / LIFE_S + hash(i, j, 3);
				const life = Math.floor(t);
				const age = t - life;
				const cellX = (i + 0.15 + hash(i, j, 1 + life) * 0.7) * SPACING;
				const cellZ = (j + 0.15 + hash(i, j, 2 + life) * 0.7) * SPACING;
				// Born where the water carried it to by then, so it moves with the sea, not the boat.
				const born = (life - hash(i, j, 3)) * LIFE_S;
				const travel = (born + age * LIFE_S) * DRIFT_SPEED;
				const wx = cellX + dirX * travel;
				const wz = cellZ + dirZ * travel;
				// The lattice tiles the sea; use the copy of this arrow nearest the boat.
				const x = wx + EXTENT * Math.round((focusX - wx) / EXTENT);
				const z = wz + EXTENT * Math.round((focusZ - wz) / EXTENT);
				const edge = Math.max(Math.abs(x - focusX), Math.abs(z - focusZ)) / half;
				let size = Math.min(1, 2.5 * Math.sin(age * Math.PI)) * (1 - smoothstep(FADE_START, 1, edge));
				if (camera) size *= smoothstep(NEAR_CAMERA, NEAR_CAMERA * 2.2, Math.hypot(x - camera.x, z - camera.z));
				this.dummy.position.set(x, 0, z);
				this.dummy.rotation.set(0, -blow, 0);
				// A collapsed arrow is invisible without a per-instance opacity.
				this.dummy.scale.setScalar(Math.max(size, 0.0001));
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

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}
