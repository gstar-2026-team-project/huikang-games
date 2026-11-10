import { InstancedMesh, MeshBasicMaterial, Object3D, Shape, ShapeGeometry } from "three";
import type { Palette } from "./palette";

/** Arrows sit one per cell of a square lattice this far apart (world units). */
const SPACING = 20;
/** Lattice cells per side; the patch is centred on the boat and travels with it. */
const PER_SIDE = 13;
const EXTENT = SPACING * PER_SIDE;
/** How fast an arrow drifts downwind, relative to the boat, while it is showing. */
const DRIFT_SPEED = 6;
/** Each arrow grows in, drifts, and shrinks away over this many seconds, out of step with its neighbours. */
const LIFE_S = 3.2;
/** Arrows shrink to nothing toward the edge of the patch, so none pops in or out in view. */
const FADE_START = 0.55;

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
 * Arrows lying on the water all around the boat, pointing and drifting the way
 * the wind blows. They drift relative to the boat, not the water, so on screen
 * each arrow always slides the way it points, whatever the boat is doing; the
 * sea's own flecks and facets carry the sense of the boat's speed.
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
			new MeshBasicMaterial({ color: palette.fleck, transparent: true, opacity: 0.62, depthWrite: false }),
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
		const dirX = Math.sin(blow);
		const dirZ = -Math.cos(blow);
		const half = EXTENT / 2;
		let index = 0;
		for (let i = 0; i < PER_SIDE; i++) {
			for (let j = 0; j < PER_SIDE; j++) {
				// Each arrow lives in its own cell at a jittered spot, so the field is not a rigid grid.
				const cellX = (i + 0.2 + hash(i, j, 1) * 0.6) * SPACING;
				const cellZ = (j + 0.2 + hash(i, j, 2) * 0.6) * SPACING;
				const x0 = focusX + cellX - half;
				const z0 = focusZ + cellZ - half;
				// Its own clock: born at its spot, drifts downwind, then fades and starts again.
				const age = (timeSec / LIFE_S + hash(i, j, 3)) % 1;
				const travel = (age - 0.5) * DRIFT_SPEED * LIFE_S;
				const x = x0 + dirX * travel;
				const z = z0 + dirZ * travel;
				// Full size for most of its life; it only grows in and shrinks away at the ends.
				const life = Math.min(1, 2.5 * Math.sin(age * Math.PI));
				const edge = Math.max(Math.abs(x - focusX), Math.abs(z - focusZ)) / half;
				const reach = 1 - smoothstep(FADE_START, 1, edge);
				const size = life * reach;
				this.dummy.position.set(x, 0.045, z);
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
