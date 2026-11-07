import {
	CircleGeometry,
	ConeGeometry,
	CylinderGeometry,
	DoubleSide,
	Group,
	InstancedMesh,
	Matrix4,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	Object3D,
	PlaneGeometry,
	Quaternion,
	RingGeometry,
	Scene,
	Vector3,
} from "three";
import type { Course } from "../game/course";
import { createRng } from "../game/rng";
import { markRadius } from "../game/race";
import type { Palette } from "./palette";

const FLECK_COUNT = 420;
/** Flecks tile the sea in a square this wide around the camera target. */
const FLECK_CELL = 320;
const WAKE_COUNT = 40;
const WAKE_LIFE_S = 2.6;
const WAKE_SPACING = 1.6;

export interface MarkView {
	group: Group;
	buoy: MeshLambertMaterial;
	ring: MeshBasicMaterial;
	beam: Mesh;
}

/** Calm sea, wind flecks, and the boat's wake. */
export class Sea {
	readonly root = new Group();
	private water: Mesh;
	private flecks: InstancedMesh;
	private fleckBase: Array<[number, number]> = [];
	private wake: InstancedMesh;
	private wakeSlots: Array<{ x: number; z: number; born: number }> = [];
	private wakeNext = 0;
	private lastWake: { x: number; z: number } | null = null;
	private matrix = new Matrix4();
	private position = new Vector3();
	private rotation = new Quaternion();
	private scale = new Vector3();
	private dummy = new Object3D();

	constructor(palette: Palette) {
		this.water = new Mesh(
			new PlaneGeometry(3000, 3000),
			new MeshLambertMaterial({ color: palette.sea }),
		);
		this.water.rotation.x = -Math.PI / 2;
		this.root.add(this.water);

		const fleckGeometry = new PlaneGeometry(2.6, 0.32);
		fleckGeometry.rotateX(-Math.PI / 2);
		this.flecks = new InstancedMesh(
			fleckGeometry,
			new MeshBasicMaterial({ color: palette.fleck, transparent: true, opacity: 0.55 }),
			FLECK_COUNT,
		);
		const rng = createRng(7);
		for (let i = 0; i < FLECK_COUNT; i++) {
			this.fleckBase.push([rng() * FLECK_CELL, rng() * FLECK_CELL]);
		}
		this.root.add(this.flecks);

		this.wake = new InstancedMesh(
			new CircleGeometry(1, 10).rotateX(-Math.PI / 2),
			new MeshBasicMaterial({ color: palette.wake, transparent: true, opacity: 0.5 }),
			WAKE_COUNT,
		);
		for (let i = 0; i < WAKE_COUNT; i++) this.wakeSlots.push({ x: 0, z: 0, born: -99 });
		this.root.add(this.wake);
	}

	setPalette(palette: Palette): void {
		(this.water.material as MeshLambertMaterial).color.copy(palette.sea);
		(this.flecks.material as MeshBasicMaterial).color.copy(palette.fleck);
		(this.wake.material as MeshBasicMaterial).color.copy(palette.wake);
	}

	resetWake(): void {
		for (const slot of this.wakeSlots) slot.born = -99;
		this.lastWake = null;
	}

	/** Re-place flecks and wake around the focus point (world x, z). */
	update(
		focusX: number,
		focusZ: number,
		wind: number,
		timeSec: number,
		stern?: { x: number; z: number },
	): void {
		this.water.position.set(focusX, 0, focusZ);
		const fleckAngle = -wind + Math.PI / 2;
		for (let i = 0; i < FLECK_COUNT; i++) {
			const [bx, bz] = this.fleckBase[i]!;
			const x = bx + FLECK_CELL * Math.round((focusX - bx) / FLECK_CELL);
			const z = bz + FLECK_CELL * Math.round((focusZ - bz) / FLECK_CELL);
			this.dummy.position.set(x, 0.04, z);
			this.dummy.rotation.set(0, fleckAngle, 0);
			const s = 0.75 + 0.35 * Math.sin(timeSec * 0.9 + i);
			this.dummy.scale.set(s, 1, 1);
			this.dummy.updateMatrix();
			this.flecks.setMatrixAt(i, this.dummy.matrix);
		}
		this.flecks.instanceMatrix.needsUpdate = true;

		if (stern) {
			const last = this.lastWake;
			if (!last || Math.hypot(stern.x - last.x, stern.z - last.z) > WAKE_SPACING) {
				const slot = this.wakeSlots[this.wakeNext]!;
				slot.x = stern.x;
				slot.z = stern.z;
				slot.born = timeSec;
				this.wakeNext = (this.wakeNext + 1) % WAKE_COUNT;
				this.lastWake = { x: stern.x, z: stern.z };
			}
		}
		for (let i = 0; i < WAKE_COUNT; i++) {
			const slot = this.wakeSlots[i]!;
			const age = timeSec - slot.born;
			const life = Math.max(0, 1 - age / WAKE_LIFE_S);
			const r = life > 0 ? (0.7 + age * 0.9) * life : 0.0001;
			this.position.set(slot.x, 0.03, slot.z);
			this.scale.set(r, 1, r);
			this.matrix.compose(this.position, this.rotation, this.scale);
			this.wake.setMatrixAt(i, this.matrix);
		}
		this.wake.instanceMatrix.needsUpdate = true;
	}

	dispose(): void {
		for (const mesh of [this.water, this.flecks, this.wake]) {
			mesh.geometry.dispose();
			(mesh.material as MeshBasicMaterial).dispose();
		}
	}
}

/** Buoys with their capture rings; the next mark gets a tall beacon. */
export class Marks {
	readonly root = new Group();
	private views: MarkView[] = [];
	private palette: Palette;

	constructor(palette: Palette) {
		this.palette = palette;
	}

	setCourse(course: Course): void {
		this.clear();
		course.marks.forEach((mark, index) => {
			const isFinish = index === course.marks.length - 1;
			const group = new Group();
			group.position.set(mark.x, 0, -mark.y);
			const buoyMaterial = new MeshLambertMaterial({ color: this.palette.buoy });
			const body = new Mesh(new CylinderGeometry(1.1, 1.4, 2.2, 12), buoyMaterial);
			body.position.y = 1.1;
			const top = new Mesh(new ConeGeometry(1.1, 1.8, 12), buoyMaterial);
			top.position.y = 3.1;
			group.add(body, top);
			if (isFinish) {
				const pole = new Mesh(new CylinderGeometry(0.08, 0.08, 6, 5), buoyMaterial);
				pole.position.y = 5;
				const flag = new Mesh(new PlaneGeometry(2.2, 1.3), buoyMaterial);
				flag.position.set(1.1, 7.2, 0);
				group.add(pole, flag);
			}
			const radius = markRadius(course, index);
			const ringMaterial = new MeshBasicMaterial({
				color: this.palette.buoy,
				transparent: true,
				opacity: 0.35,
				side: DoubleSide,
			});
			const ring = new Mesh(new RingGeometry(radius - 0.7, radius, 48), ringMaterial);
			ring.rotation.x = -Math.PI / 2;
			ring.position.y = 0.06;
			group.add(ring);
			const beam = new Mesh(
				new CylinderGeometry(0.5, 0.5, 60, 8, 1, true),
				new MeshBasicMaterial({ color: this.palette.buoyNext, transparent: true, opacity: 0.28, depthWrite: false }),
			);
			beam.position.y = 30;
			group.add(beam);
			this.root.add(group);
			this.views.push({ group, buoy: buoyMaterial, ring: ringMaterial, beam });
		});
	}

	/** Colour marks by progress: rounded, next, upcoming, finish. */
	setProgress(nextIndex: number, timeSec: number): void {
		const last = this.views.length - 1;
		this.views.forEach((view, index) => {
			const done = index < nextIndex;
			const next = index === nextIndex;
			const color = done
				? this.palette.buoyDone
				: next
					? this.palette.buoyNext
					: index === last
						? this.palette.finish
						: this.palette.buoy;
			view.buoy.color.copy(color);
			view.ring.color.copy(color);
			view.ring.opacity = next ? 0.5 + 0.25 * Math.sin(timeSec * 3) : done ? 0.12 : 0.28;
			view.beam.visible = next;
		});
	}

	setPalette(palette: Palette): void {
		this.palette = palette;
		for (const view of this.views) {
			(view.beam.material as MeshBasicMaterial).color.copy(palette.buoyNext);
		}
	}

	private clear(): void {
		for (const view of this.views) {
			view.group.traverse((node) => {
				if (node instanceof Mesh) {
					node.geometry.dispose();
					(node.material as MeshBasicMaterial).dispose();
				}
			});
			this.root.remove(view.group);
		}
		this.views = [];
	}

	dispose(): void {
		this.clear();
	}
}

export function addToScene(scene: Scene, ...objects: Object3D[]): void {
	for (const object of objects) scene.add(object);
}
