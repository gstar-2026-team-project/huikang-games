import {
	acquireSharedRenderBudget,
	adoptSharedRenderBudgetRenderer,
	type RenderBudget,
} from "poe-tiles-sdk/v1/client.js";
import {
	DirectionalLight,
	Fog,
	HemisphereLight,
	PerspectiveCamera,
	Scene,
	Vector3,
	WebGLRenderer,
} from "three";
import type { Course } from "../game/course";
import { normalizeAngle } from "../game/physics";
import { BOAT_LENGTH, type BoatModel, type BoatPose, createBoatModel } from "./boat";
import { type Palette, readPalette } from "./palette";
import { addToScene, Marks, Sea } from "./world";

/** Chase camera offset behind and above the boat, in world units. */
const CAMERA_BACK = 21;
const CAMERA_UP = 10.5;
const CAMERA_LOOK_AHEAD = 16;
const CAMERA_FOLLOW_RATE = 3.5;

export interface FrameState {
	pose: BoatPose;
	wind: number;
	steer: number;
	nextMark: number;
	timeSec: number;
	dt: number;
	/** Snap the camera instead of easing (new race, new replay). */
	snapCamera?: boolean;
}

/** Owns the three.js renderer, the world, and the chase camera. */
export class SailingScene {
	readonly budget: RenderBudget;
	readonly pixelRatio: number;
	private renderer: WebGLRenderer;
	private scene = new Scene();
	private camera = new PerspectiveCamera(58, 1, 0.5, 900);
	private boat: BoatModel;
	private sea: Sea;
	private marks: Marks;
	private sun = new DirectionalLight(0xffffff, 1.6);
	private hemi = new HemisphereLight(0xffffff, 0x335566, 1.4);
	private cameraHeading = 0;
	private lookTarget = new Vector3();
	private stern = { x: 0, z: 0 };

	constructor(canvas: HTMLCanvasElement) {
		const shared = acquireSharedRenderBudget();
		this.renderer = new WebGLRenderer({ canvas, ...shared.rendererOptions() });
		this.budget = adoptSharedRenderBudgetRenderer(this.renderer);
		this.pixelRatio = this.budget.defaults.pixelRatio;
		const palette = readPalette();
		this.boat = createBoatModel(palette);
		this.sea = new Sea(palette);
		this.marks = new Marks(palette);
		this.sun.position.set(-40, 80, 30);
		addToScene(this.scene, this.sea.root, this.marks.root, this.boat.group, this.sun, this.hemi);
		this.applyPalette(palette);
	}

	private applyPalette(palette: Palette): void {
		this.scene.background = palette.sky;
		this.scene.fog = new Fog(palette.sky, 70, 330);
	}

	/** Re-read world colours after a light/dark scheme change. */
	refreshPalette(): void {
		const palette = readPalette();
		this.applyPalette(palette);
		this.sea.setPalette(palette);
		this.marks.setPalette(palette);
	}

	setCourse(course: Course): void {
		this.marks.setCourse(course);
		this.sea.resetWake();
	}

	resize(width: number, height: number): void {
		if (width === 0 || height === 0) return;
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		// Narrow phones get a wider view so the marks stay in frame.
		this.camera.fov = width / height < 0.8 ? 66 : 54;
		this.camera.updateProjectionMatrix();
	}

	render(frame: FrameState): void {
		const { pose } = frame;
		this.boat.update(pose, frame.wind, frame.steer, frame.timeSec);
		this.marks.setProgress(frame.nextMark, frame.timeSec);

		const follow = frame.snapCamera ? 1 : 1 - Math.exp(-frame.dt * CAMERA_FOLLOW_RATE);
		this.cameraHeading += normalizeAngle(pose.heading - this.cameraHeading) * follow;
		const fx = Math.sin(this.cameraHeading);
		const fz = -Math.cos(this.cameraHeading);
		const bx = pose.x;
		const bz = -pose.y;
		const desired = new Vector3(bx - fx * CAMERA_BACK, CAMERA_UP, bz - fz * CAMERA_BACK);
		if (frame.snapCamera) this.camera.position.copy(desired);
		else this.camera.position.lerp(desired, follow);
		this.lookTarget.set(bx + fx * CAMERA_LOOK_AHEAD, 1.5, bz + fz * CAMERA_LOOK_AHEAD);
		this.camera.lookAt(this.lookTarget);

		const moving = pose.speed > 1;
		this.stern.x = bx - Math.sin(pose.heading) * (BOAT_LENGTH / 2);
		this.stern.z = bz + Math.cos(pose.heading) * (BOAT_LENGTH / 2);
		if (frame.snapCamera) this.sea.resetWake();
		this.sea.update(bx, bz, frame.wind, frame.timeSec, moving ? this.stern : undefined);
		this.renderer.render(this.scene, this.camera);
	}

	dispose(): void {
		this.boat.dispose();
		this.sea.dispose();
		this.marks.dispose();
		this.renderer.dispose();
	}
}
