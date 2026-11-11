import {
	BufferAttribute,
	BufferGeometry,
	Color,
	DoubleSide,
	DynamicDrawUsage,
	InstancedMesh,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	Object3D,
	Vector3,
} from "three";
import type { Point } from "../game/course";
import { MeshBuilder, type Vec3 } from "./mesh-builder";
import type { Palette } from "./palette";
import { hazeMaterial } from "./sun";

/** Gulls wheeling over the water near the boat: pure decoration. */
const GULLS = 5;
/** Vertices per gull: two wings of two triangles each. */
const GULL_VERTS = 12;
/** How quickly the flock's circling centre drifts after the boat (per second). */
const FLOCK_FOLLOW = 0.25;

interface Gull {
	radius: number;
	height: number;
	speed: number;
	phase: number;
	flap: number;
	span: number;
}

const FLOCK: readonly Gull[] = Array.from({ length: GULLS }, (_, i) => ({
	radius: 18 + i * 7,
	height: 13 + ((i * 7) % 5) * 3,
	speed: (0.32 + (i % 3) * 0.07) * (i % 2 === 0 ? 1 : -1),
	phase: i * 1.9,
	flap: 5.5 + (i % 2) * 1.3,
	span: 1.5 + (i % 3) * 0.2,
}));

/**
 * A few gulls circling ahead of the boat, flapping then gliding. Their
 * circling centre trails the boat slowly so they stay in the picture without
 * being tied to it. One draw call, rewritten each frame.
 */
export class Gulls {
	readonly mesh: Mesh;
	private positions = new Float32Array(GULLS * GULL_VERTS * 3);
	private attribute: BufferAttribute;
	private centre = new Vector3();
	private placed = false;
	private material: MeshBasicMaterial;

	constructor(palette: Palette) {
		const geometry = new BufferGeometry();
		this.attribute = new BufferAttribute(this.positions, 3).setUsage(DynamicDrawUsage);
		geometry.setAttribute("position", this.attribute);
		geometry.setAttribute("color", new BufferAttribute(gullColors(palette), 3));
		this.material = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
		this.mesh = new Mesh(geometry, this.material);
		this.mesh.frustumCulled = false;
	}

	setPalette(palette: Palette): void {
		this.mesh.geometry.setAttribute("color", new BufferAttribute(gullColors(palette), 3));
	}

	/** `ahead` is a point in front of the boat (world x, z); `dt` eases the flock after it. */
	update(aheadX: number, aheadZ: number, timeSec: number, dt: number, snap: boolean): void {
		if (snap || !this.placed) {
			this.centre.set(aheadX, 0, aheadZ);
			this.placed = true;
		} else {
			const k = 1 - Math.exp(-dt * FLOCK_FOLLOW);
			this.centre.x += (aheadX - this.centre.x) * k;
			this.centre.z += (aheadZ - this.centre.z) * k;
		}
		let v = 0;
		const put = (x: number, y: number, z: number) => {
			this.positions[v++] = x;
			this.positions[v++] = y;
			this.positions[v++] = z;
		};
		for (const gull of FLOCK) {
			const a = gull.phase + timeSec * gull.speed;
			const x = this.centre.x + Math.cos(a) * gull.radius;
			const z = this.centre.z + Math.sin(a) * gull.radius;
			const y = gull.height + Math.sin(timeSec * 0.7 + gull.phase) * 1.5;
			// Flying direction is the tangent of its circle; bank into the turn.
			const fx = -Math.sin(a) * Math.sign(gull.speed);
			const fz = Math.cos(a) * Math.sign(gull.speed);
			const rx = fz;
			const rz = -fx;
			// Flap for a while, then glide on still wings.
			const cycle = (timeSec * 0.35 + gull.phase) % 3;
			const flap = cycle < 1.3 ? Math.sin(timeSec * gull.flap * 2) * 0.55 : 0.12;
			const bank = 0.35 * Math.sign(gull.speed);
			const s = gull.span;
			for (const side of [1, -1]) {
				const lift = flap + bank * side;
				// Shoulder, elbow pushed forward, tip swept back: the gull's crooked wing.
				const elbow: Vec3 = [x + rx * side * s * 0.5 + fx * 0.15, y + lift * s * 0.35, z + rz * side * s * 0.5 + fz * 0.15];
				const tip: Vec3 = [x + rx * side * s - fx * 0.35, y + lift * s * 0.8, z + rz * side * s - fz * 0.35];
				put(x + fx * 0.3, y, z + fz * 0.3);
				put(x - fx * 0.25, y, z - fz * 0.25);
				put(...elbow);
				put(x - fx * 0.25, y, z - fz * 0.25);
				put(...elbow);
				put(...tip);
			}
		}
		this.attribute.needsUpdate = true;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.material.dispose();
	}
}

/** White bodies and inner wings, dark grey tips. */
function gullColors(palette: Palette): Float32Array {
	const colors = new Float32Array(GULLS * GULL_VERTS * 3);
	const body = palette.cloud.clone().lerp(new Color(1, 1, 1), 0.5);
	const tip = palette.glass.clone().lerp(palette.cloudShade, 0.4);
	for (let g = 0; g < GULLS; g++) {
		for (let k = 0; k < GULL_VERTS; k++) {
			const c = k % 6 === 5 ? tip : body;
			colors.set([c.r, c.g, c.b], (g * GULL_VERTS + k) * 3);
		}
	}
	return colors;
}

/** A small yacht: white hull, navy stripe, two white sails. About 7 m long, bow to -Z. */
function yachtGeometry(palette: Palette): BufferGeometry {
	const b = new MeshBuilder();
	const hull = palette.stripe;
	b.quad([-1.1, 0.8, 1.6], [1.1, 0.8, 1.6], [0.9, 0.8, -1.5], [-0.9, 0.8, -1.5], palette.plank);
	b.tri([-0.9, 0.8, -1.5], [0.9, 0.8, -1.5], [0, 1, -3.6], palette.plank);
	for (const side of [1, -1]) {
		b.quad([side * 1.1, 0.8, 1.6], [side * 0.9, 0.8, -1.5], [side * 0.7, -0.2, -1.4], [side * 0.9, -0.2, 1.5], hull);
		b.tri([side * 0.9, 0.8, -1.5], [0, 1, -3.6], [side * 0.7, -0.2, -1.4], hull);
		b.quad([side * 1.12, 0.55, 1.6], [side * 0.92, 0.55, -1.5], [side * 0.92, 0.42, -1.5], [side * 1.12, 0.42, 1.6], palette.hull);
	}
	b.quad([-1.1, 0.8, 1.6], [1.1, 0.8, 1.6], [0.9, -0.2, 1.5], [-0.9, -0.2, 1.5], hull);
	b.tube([0, 0.8, -0.6], [0, 10, -0.6], 0.08, palette.spar, 4);
	b.tri([0, 1.6, -0.45], [0, 9.6, -0.45], [0.35, 1.5, 2.6], palette.sail);
	b.tri([0, 1.1, -3.3], [0, 8.6, -0.7], [0.4, 1.3, -0.9], palette.sail);
	return b.build();
}

/** Two boats moored off the near islands and one sailing a slow circuit far out. */
export class Fleet {
	readonly mesh: InstancedMesh;
	private material: MeshLambertMaterial;
	private dummy = new Object3D();
	private centre = { x: 0, z: 0 };
	private moorings: Array<{ x: number; z: number; heading: number }> = [];

	constructor(palette: Palette) {
		this.material = hazeMaterial(new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, fog: false }));
		this.mesh = new InstancedMesh(yachtGeometry(palette), this.material, 3);
		this.mesh.frustumCulled = false;
	}

	setPalette(palette: Palette): void {
		this.mesh.geometry.dispose();
		this.mesh.geometry = yachtGeometry(palette);
	}

	/** Moor the boats off two islands (positions relative to the course start). */
	setCourse(start: Point, anchorages: ReadonlyArray<{ x: number; z: number }>): void {
		this.centre = { x: start.x, z: -start.y };
		this.moorings = anchorages.slice(0, 2).map((a, i) => ({
			x: this.centre.x + a.x,
			z: this.centre.z + a.z,
			heading: 0.8 + i * 2.1,
		}));
	}

	update(timeSec: number, wind: number): void {
		const d = this.dummy;
		this.moorings.forEach((m, i) => {
			d.position.set(m.x, 0, m.z);
			d.rotation.set(Math.sin(timeSec * 0.8 + i) * 0.03, m.heading, Math.sin(timeSec * 0.9 + i * 2) * 0.05);
			d.scale.setScalar(1.2);
			d.updateMatrix();
			this.mesh.setMatrixAt(i, d.matrix);
		});
		// The sailing boat: a slow lap well outside the course, heeled to the breeze.
		const a = timeSec * 0.006 + 2;
		const r = 360;
		d.position.set(this.centre.x + Math.cos(a) * r, 0, this.centre.z + Math.sin(a) * r);
		// Bow along the circle's tangent; heel away from the side the wind comes from.
		d.rotation.set(0, Math.PI - a, (Math.sin(a - wind) >= 0 ? 1 : -1) * 0.2, "YXZ");
		d.scale.setScalar(1.3);
		d.updateMatrix();
		this.mesh.setMatrixAt(2, d.matrix);
		this.mesh.count = this.moorings.length + 1;
		this.mesh.instanceMatrix.needsUpdate = true;
	}

	dispose(): void {
		this.mesh.geometry.dispose();
		this.material.dispose();
	}
}
