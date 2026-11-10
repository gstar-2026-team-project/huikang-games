import {
	type BufferGeometry,
	type Color,
	ConeGeometry,
	CylinderGeometry,
	DoubleSide,
	Float32BufferAttribute,
	Group,
	IcosahedronGeometry,
	Mesh,
	MeshBasicMaterial,
	MeshLambertMaterial,
	PlaneGeometry,
	RingGeometry,
} from "three";
import type { Course } from "../game/course";
import { markRadius } from "../game/race";
import { MeshBuilder, place } from "./mesh-builder";
import type { Palette } from "./palette";

const BUOY_SCALE = 1.15;
/** Top of the finish pole, in buoy units. */
const POLE_TOP = 8.4;
const FLAG_WIDTH = 2.8;
const FLAG_HEIGHT = 1.7;

interface MarkView {
	group: Group;
	/** Bobs on the swell; the capture ring stays flat on the water. */
	buoy: Group;
	body: Mesh;
	ring: MeshBasicMaterial;
	flag: Mesh | null;
	/** The colour the body geometry was last built with. */
	painted: Color | null;
}

/** A striped channel buoy: float collar, banded body, and a lamp or flag pole. */
function buoyGeometry(color: Color, palette: Palette, finish: boolean): BufferGeometry {
	const builder = new MeshBuilder();
	const sides = 10;
	builder.add(new CylinderGeometry(1.5, 1.6, 0.6, sides), place([0, 0.15, 0]), color);
	builder.add(new CylinderGeometry(1.08, 1.32, 0.95, sides), place([0, 0.92, 0]), color);
	builder.add(new CylinderGeometry(0.86, 1.08, 0.75, sides), place([0, 1.77, 0]), palette.wake);
	builder.add(new CylinderGeometry(0.6, 0.86, 0.85, sides), place([0, 2.57, 0]), color);
	if (finish) {
		builder.tube([0, 2.9, 0], [0, POLE_TOP, 0], 0.1, palette.glass, 5, 0.07);
		builder.add(new IcosahedronGeometry(0.2, 0), place([0, POLE_TOP + 0.1, 0]), palette.wake);
	} else {
		builder.add(new CylinderGeometry(0.2, 0.26, 0.75, 6), place([0, 3.35, 0]), palette.glass);
		builder.add(new IcosahedronGeometry(0.45, 0), place([0, 4, 0]), palette.wake);
	}
	return builder.build();
}

/** Chequered finish flag flying towards +X from the pole. */
function flagGeometry(palette: Palette): BufferGeometry {
	const cols = 4;
	const rows = 3;
	const geometry = new PlaneGeometry(FLAG_WIDTH, FLAG_HEIGHT, cols, rows).toNonIndexed();
	geometry.translate(FLAG_WIDTH / 2, 0, 0);
	const colors: number[] = [];
	// Two triangles a cell, in row-major order.
	for (let cell = 0; cell < cols * rows; cell++) {
		const dark = ((cell % cols) + Math.floor(cell / cols)) % 2 === 0;
		const color = dark ? palette.glass : palette.wake;
		for (let k = 0; k < 6; k++) colors.push(color.r, color.g, color.b);
	}
	geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
	return geometry;
}

/** Buoys with their capture rings; the next mark gets a tall beacon and a pointer. */
export class Marks {
	readonly root = new Group();
	private views: MarkView[] = [];
	private palette: Palette;
	private bodyMaterial = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
	private flagMaterial = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
	private beaconMaterial: MeshBasicMaterial;
	private pointerMaterial: MeshBasicMaterial;
	private beacon = new Group();
	private pointer: Mesh;

	constructor(palette: Palette) {
		this.palette = palette;
		this.beaconMaterial = new MeshBasicMaterial({
			color: palette.buoyNext,
			transparent: true,
			opacity: 0.3,
			depthWrite: false,
			side: DoubleSide,
		});
		this.pointerMaterial = new MeshBasicMaterial({ color: palette.buoyNext });
		const beam = new Mesh(new CylinderGeometry(0.85, 0.4, 56, 8, 1, true), this.beaconMaterial);
		beam.position.y = 42;
		// A downward arrowhead hovering over the buoy: "this one next".
		const head = new ConeGeometry(1.25, 2.4, 4);
		head.rotateX(Math.PI);
		this.pointer = new Mesh(head, this.pointerMaterial);
		this.beacon.add(beam, this.pointer);
		this.beacon.visible = false;
		this.root.add(this.beacon);
	}

	setCourse(course: Course): void {
		this.clear();
		course.marks.forEach((mark, index) => {
			const finish = index === course.marks.length - 1;
			const group = new Group();
			group.position.set(mark.x, 0, -mark.y);
			const buoy = new Group();
			buoy.scale.setScalar(BUOY_SCALE);
			const body = new Mesh(undefined, this.bodyMaterial);
			buoy.add(body);
			let flag: Mesh | null = null;
			if (finish) {
				flag = new Mesh(flagGeometry(this.palette), this.flagMaterial);
				flag.position.y = POLE_TOP - FLAG_HEIGHT / 2 - 0.1;
				buoy.add(flag);
			}
			const radius = markRadius(course, index);
			const ring = new MeshBasicMaterial({
				color: this.palette.buoy,
				transparent: true,
				opacity: 0.35,
				depthWrite: false,
				side: DoubleSide,
			});
			const ringMesh = new Mesh(new RingGeometry(radius - 0.8, radius, 64), ring);
			ringMesh.rotation.x = -Math.PI / 2;
			ringMesh.position.y = 0.06;
			group.add(buoy, ringMesh);
			this.root.add(group);
			this.views.push({ group, buoy, body, ring, flag, painted: null });
		});
	}

	/** Colour marks by progress (rounded, next, upcoming, finish) and animate them. */
	setProgress(nextIndex: number, timeSec: number, wind: number): void {
		const last = this.views.length - 1;
		this.beacon.visible = false;
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
			if (view.painted !== color) {
				// Marks change colour a handful of times a race; rebuilding the
				// small geometry then keeps each buoy to one draw call.
				view.body.geometry.dispose();
				view.body.geometry = buoyGeometry(color, this.palette, index === last);
				view.painted = color;
			}
			view.ring.color.copy(color);
			view.ring.opacity = next ? 0.72 + 0.22 * Math.sin(timeSec * 3) : done ? 0.16 : 0.34;

			const phase = timeSec * 1.3 + index * 1.9;
			view.buoy.position.y = Math.sin(phase) * 0.14 - 0.05;
			view.buoy.rotation.z = Math.sin(phase * 0.8 + 1) * 0.07;
			view.buoy.rotation.x = Math.cos(phase * 0.9) * 0.06;
			if (view.flag) {
				// Fly downwind: `wind` is where the wind comes from.
				view.flag.rotation.y = Math.atan2(-Math.cos(wind), -Math.sin(wind)) + Math.sin(timeSec * 5) * 0.2;
			}
			if (next) {
				this.beacon.visible = true;
				this.beacon.position.copy(view.group.position);
				this.pointer.position.y = (index === last ? 13 : 8.6) + Math.sin(timeSec * 2.6) * 0.5;
				this.pointer.rotation.y = timeSec * 1.2;
			}
		});
	}

	setPalette(palette: Palette): void {
		this.palette = palette;
		this.beaconMaterial.color.copy(palette.buoyNext);
		this.pointerMaterial.color.copy(palette.buoyNext);
		for (const view of this.views) {
			// Force a repaint with the new scheme's colours on the next frame.
			view.painted = null;
			if (view.flag) {
				view.flag.geometry.dispose();
				view.flag.geometry = flagGeometry(palette);
			}
		}
	}

	private clear(): void {
		for (const view of this.views) {
			view.group.traverse((node) => {
				if (node instanceof Mesh) node.geometry.dispose();
			});
			view.ring.dispose();
			this.root.remove(view.group);
		}
		this.views = [];
		this.beacon.visible = false;
	}

	dispose(): void {
		this.clear();
		this.beacon.traverse((node) => {
			if (node instanceof Mesh) node.geometry.dispose();
		});
		for (const material of [this.bodyMaterial, this.flagMaterial, this.beaconMaterial, this.pointerMaterial]) {
			material.dispose();
		}
	}
}
