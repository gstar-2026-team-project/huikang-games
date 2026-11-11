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
import { MAX_SPEED } from "../game/constants";
import type { Course, Point } from "../game/course";
import { normalizeAngle } from "../game/physics";
import { BOAT_LENGTH, BOAT_SCALE, type BoatModel, type BoatPose, createBoatModel } from "./boat";
import { Marks } from "./marks";
import { type Palette, readPalette } from "./palette";
import { Islands, Sky } from "./sky";
import { Wake } from "./wake";
import { FOG_FAR, FOG_NEAR, Sea, SUN_DIRECTION } from "./water";
import { addToScene, GuidePath } from "./world";

/** Chase camera offset behind and above the boat, in world units. */
const CAMERA_BACK = 21;
const CAMERA_UP = 10.5;
const CAMERA_LOOK_AHEAD = 16;
const CAMERA_FOLLOW_RATE = 3.5;
/** Where the wake starts: the drawn boat's stern, aft of its centre. */
const STERN_OFFSET = (BOAT_LENGTH / 2) * BOAT_SCALE;

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
	private camera = new PerspectiveCamera(58, 1, 1, 2400);
	private boat: BoatModel;
	private sea: Sea;
	private sky: Sky;
	private islands: Islands;
	private wake: Wake;
	private marks: Marks;
	private guide: GuidePath;
	/** Warm key light from the sun, cool fill from the sky and the sea below. */
	private sun = new DirectionalLight(0xffffff, 1.7);
	private hemi = new HemisphereLight(0xffffff, 0x335566, 2);
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
		this.sky = new Sky(palette);
		this.islands = new Islands(palette);
		this.wake = new Wake(palette);
		this.marks = new Marks(palette);
		this.guide = new GuidePath(palette);
		this.sun.position.copy(SUN_DIRECTION).multiplyScalar(100);
		addToScene(
			this.scene,
			this.sky.root,
			this.islands.mesh,
			this.sea.root,
			this.wake.mesh,
			this.marks.root,
			this.guide.mesh,
			this.boat.group,
			this.sun,
			this.hemi,
		);
		this.applyPalette(palette);
	}

	private applyPalette(palette: Palette): void {
		this.scene.background = palette.sky;
		this.scene.fog = new Fog(palette.sky, FOG_NEAR, FOG_FAR);
		this.sun.color.copy(palette.lightKey);
		this.hemi.color.copy(palette.lightFill);
		// Light bounced off the water: brighter than the sea itself so shaded sides stay readable.
		this.hemi.groundColor.copy(palette.sea).lerp(palette.sky, 0.55);
	}

	/** Re-read world colours after a light/dark scheme change. */
	refreshPalette(): void {
		const palette = readPalette();
		this.applyPalette(palette);
		this.sea.setPalette(palette);
		this.sky.setPalette(palette);
		this.islands.setPalette(palette);
		this.wake.setPalette(palette);
		// The boat bakes its colours into vertices; rebuild it for the new scheme.
		this.scene.remove(this.boat.group);
		this.boat.dispose();
		this.boat = createBoatModel(palette);
		this.scene.add(this.boat.group);
		this.marks.setPalette(palette);
		this.guide.setPalette(palette);
	}

	setCourse(course: Course): void {
		this.marks.setCourse(course);
		this.islands.setCentre(course.start);
		this.wake.reset();
	}

	/** Show an intended path on the water (the lesson); empty to hide it. */
	setGuide(points: readonly Point[]): void {
		this.guide.setPath(points);
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
		// Centred on last frame's camera; set first so the boat and buoys read this frame's swell.
		this.sea.update(this.camera.position.x, this.camera.position.z, frame.wind, frame.timeSec);
		this.boat.update(pose, frame.wind, frame.steer, frame.timeSec);
		this.marks.setProgress(frame.nextMark, frame.timeSec, frame.wind);

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
		this.stern.x = bx - Math.sin(pose.heading) * STERN_OFFSET;
		this.stern.z = bz + Math.cos(pose.heading) * STERN_OFFSET;
		if (frame.snapCamera) this.wake.reset();
		this.wake.update(frame.timeSec, pose.heading, pose.speed / MAX_SPEED, moving ? this.stern : undefined);
		this.sky.update(this.camera.position.x, this.camera.position.z, frame.timeSec);
		this.renderer.render(this.scene, this.camera);
	}

	dispose(): void {
		this.boat.dispose();
		this.sea.dispose();
		this.sky.dispose();
		this.islands.dispose();
		this.wake.dispose();
		this.marks.dispose();
		this.guide.dispose();
		this.renderer.dispose();
	}
}
