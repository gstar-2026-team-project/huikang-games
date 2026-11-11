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
import { Islands } from "./islands";
import { Fleet, Gulls } from "./life";
import { Marks } from "./marks";
import { type Palette, readPalette } from "./palette";
import { Sky } from "./sky";
import { rimUniforms, setSkyPalette, SUN_LIGHT, SUN_VIEW } from "./sun";
import { Wake } from "./wake";
import { FOG_FAR, FOG_NEAR, Sea } from "./water";
import { WindArrows } from "./wind-arrows";
import { addToScene, GuidePath } from "./world";
import { AdaptiveResolution } from "./adaptive-resolution";

/** Chase camera: low and close behind the boat for drama, looking a little ahead. */
const CAMERA_BACK = 16.5;
const CAMERA_UP = 6.6;
const CAMERA_LOOK_AHEAD = 18;
const CAMERA_LOOK_UP = 3.4;
const CAMERA_FOLLOW_RATE = 3.5;
/** Extra field of view (degrees) at top speed: the world rushes past. */
const FOV_SPEED_BOOST = 7;
const FOV_EASE_RATE = 1.5;
/** Where the wake starts: the drawn boat's stern, aft of its centre. */
const STERN_OFFSET = (BOAT_LENGTH / 2) * BOAT_SCALE;
/** Gulls wheel around a point this far ahead of the boat. */
const GULLS_AHEAD = 45;

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
	private camera = new PerspectiveCamera(58, 1, 1, 2600);
	private boat: BoatModel;
	private sea: Sea;
	private sky: Sky;
	private islands: Islands;
	private wake: Wake;
	private marks: Marks;
	private guide: GuidePath;
	private windArrows: WindArrows;
	private gulls: Gulls;
	private fleet: Fleet;
	/** Golden key light from the low sun, cool blue fill from the sky above. */
	private sun = new DirectionalLight(0xffffff, 2.2);
	private hemi = new HemisphereLight(0xffffff, 0x335566, 1.6);
	private cameraHeading = 0;
	private lookTarget = new Vector3();
	private stern = { x: 0, z: 0 };
	private baseFov = 54;
	private speedFov = 0;
	private forward = new Vector3();
	private resolution: AdaptiveResolution;
	private width = 1;
	private height = 1;

	constructor(canvas: HTMLCanvasElement) {
		const shared = acquireSharedRenderBudget();
		this.renderer = new WebGLRenderer({ canvas, ...shared.rendererOptions() });
		this.budget = adoptSharedRenderBudgetRenderer(this.renderer);
		this.pixelRatio = this.budget.defaults.pixelRatio;
		this.resolution = new AdaptiveResolution(this.renderer.getPixelRatio(), (ratio) => {
			this.renderer.setPixelRatio(ratio);
			this.renderer.setSize(this.width, this.height, false);
		});
		const palette = readPalette();
		setSkyPalette(palette);
		this.boat = createBoatModel(palette);
		this.sea = new Sea(palette);
		this.sky = new Sky(palette);
		this.islands = new Islands(palette);
		this.wake = new Wake(palette);
		this.marks = new Marks(palette);
		this.guide = new GuidePath(palette);
		this.windArrows = new WindArrows(palette);
		this.gulls = new Gulls(palette);
		this.fleet = new Fleet(palette);
		this.sun.position.copy(SUN_LIGHT).multiplyScalar(100);
		addToScene(
			this.scene,
			this.sky.root,
			this.islands.root,
			this.fleet.mesh,
			this.sea.root,
			this.wake.mesh,
			this.marks.root,
			this.guide.mesh,
			this.windArrows.mesh,
			this.boat.group,
			this.gulls.mesh,
			this.sun,
			this.hemi,
		);
		this.applyPalette(palette);
	}

	private applyPalette(palette: Palette): void {
		setSkyPalette(palette);
		this.scene.background = palette.sky;
		// Near things (marks, arrows) fade towards the cool haze; far ones use their own sky-matched haze.
		this.scene.fog = new Fog(palette.sky, FOG_NEAR, FOG_FAR);
		this.sun.color.copy(palette.lightKey);
		this.sun.intensity = palette.night > 0.5 ? 1.1 : 2.3;
		this.hemi.color.copy(palette.lightFill);
		// Light bounced off the water: brighter than the sea itself so shaded sides stay readable.
		this.hemi.groundColor.copy(palette.sea).lerp(palette.sky, 0.5);
		this.hemi.intensity = palette.night > 0.5 ? 1.5 : 1.35;
		rimUniforms.uRim.value.copy(palette.rim);
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
		this.windArrows.setPalette(palette);
		this.gulls.setPalette(palette);
		this.fleet.setPalette(palette);
	}

	setCourse(course: Course): void {
		this.marks.setCourse(course);
		this.islands.setCentre(course.start);
		this.fleet.setCourse(course.start, this.islands.anchorages());
		this.wake.reset();
	}

	/** Show an intended path on the water (the lesson); empty to hide it. */
	setGuide(points: readonly Point[]): void {
		this.guide.setPath(points);
	}

	resize(width: number, height: number): void {
		if (width === 0 || height === 0) return;
		this.width = width;
		this.height = height;
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / height;
		// Narrow phones get a wider view so the marks stay in frame.
		this.baseFov = width / height < 0.8 ? 64 : 52;
		this.camera.fov = this.baseFov + this.speedFov;
		this.camera.updateProjectionMatrix();
	}

	render(frame: FrameState): void {
		this.resolution.frame(performance.now());
		const { pose } = frame;
		// Centred on last frame's camera; set first so the boat and buoys read this frame's swell.
		this.sea.update(this.camera.position.x, this.camera.position.z, frame.wind, frame.timeSec);
		// How squarely the camera looks into the sun: sails glow and edges catch the light.
		this.camera.getWorldDirection(this.forward);
		const backlit = Math.max(0, this.forward.x * SUN_VIEW.x + this.forward.z * SUN_VIEW.z) ** 2;
		rimUniforms.uRimStrength.value = 0.25 + 0.75 * backlit;
		this.boat.update(pose, frame.wind, frame.steer, frame.timeSec, backlit);
		this.marks.setProgress(frame.nextMark, frame.timeSec, frame.wind, this.camera.position);

		const follow = frame.snapCamera ? 1 : 1 - Math.exp(-frame.dt * CAMERA_FOLLOW_RATE);
		this.cameraHeading += normalizeAngle(pose.heading - this.cameraHeading) * follow;
		const fx = Math.sin(this.cameraHeading);
		const fz = -Math.cos(this.cameraHeading);
		const bx = pose.x;
		const bz = -pose.y;
		const desired = new Vector3(bx - fx * CAMERA_BACK, CAMERA_UP, bz - fz * CAMERA_BACK);
		if (frame.snapCamera) this.camera.position.copy(desired);
		else this.camera.position.lerp(desired, follow);
		// The camera never rolls: the horizon stays level and the heel shows in the boat.
		this.lookTarget.set(bx + fx * CAMERA_LOOK_AHEAD, CAMERA_LOOK_UP, bz + fz * CAMERA_LOOK_AHEAD);
		this.camera.lookAt(this.lookTarget);
		const targetFov = FOV_SPEED_BOOST * Math.min(1, pose.speed / MAX_SPEED) ** 1.5;
		const ease = frame.snapCamera ? 1 : 1 - Math.exp(-frame.dt * FOV_EASE_RATE);
		const nextFov = this.speedFov + (targetFov - this.speedFov) * ease;
		if (Math.abs(nextFov - this.speedFov) > 0.002) {
			this.speedFov = nextFov;
			this.camera.fov = this.baseFov + this.speedFov;
			this.camera.updateProjectionMatrix();
		}

		const moving = pose.speed > 1;
		this.stern.x = bx - Math.sin(pose.heading) * STERN_OFFSET;
		this.stern.z = bz + Math.cos(pose.heading) * STERN_OFFSET;
		if (frame.snapCamera) this.wake.reset();
		this.wake.update(frame.timeSec, pose.heading, pose.speed / MAX_SPEED, moving ? this.stern : undefined);
		this.sky.update(this.camera.position.x, this.camera.position.z, frame.timeSec);
		this.islands.update(frame.timeSec);
		this.fleet.update(frame.timeSec, frame.wind);
		this.gulls.update(bx + fx * GULLS_AHEAD, bz + fz * GULLS_AHEAD, frame.timeSec, frame.dt, frame.snapCamera === true);
		this.windArrows.update(bx, bz, frame.wind, frame.timeSec, { x: this.camera.position.x, z: this.camera.position.z });
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
		this.windArrows.dispose();
		this.gulls.dispose();
		this.fleet.dispose();
		this.renderer.dispose();
	}
}
