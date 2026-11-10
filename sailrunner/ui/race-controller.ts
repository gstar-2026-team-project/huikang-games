import { isPoeTileForeground, subscribePoeTileForegroundState } from "poe-tiles-sdk/v1/client.js";
import { type CoachAction, sameAction } from "../game/coach";
import { MAX_FRAME_DT, SIM_DT, TRACE_INTERVAL_MS } from "../game/constants";
import type { Course } from "../game/course";
import { type Steer, windAt } from "../game/physics";
import { createRace, type RaceEvent, type RaceState, stepRace } from "../game/race";
import { poseAt } from "../game/replay";
import { createTutorial, stepTutorial, type TutorialState } from "../game/tutorial";
import type { BoatPose } from "../render/boat";
import { Minimap, type MinimapColors, readMinimapColors } from "../render/minimap";
import { SailingScene } from "../render/scene";
import { type HudNodes, HudWriter } from "./hud-writer";
import { IdealPath } from "./ideal-path";

type Mode = "ready" | "racing" | "lesson" | "replay" | "paused";

export type { HudNodes } from "./hud-writer";

export interface ControllerEvents {
	onRaceEvent(event: RaceEvent, race: RaceState): void;
	onReplayEnd(): void;
	/** A lesson step was completed; `done` once the whole lesson is. */
	onLessonStep(step: number, done: boolean): void;
	/** The lesson coach's suggested helm action changed. */
	onLessonAction(action: CoachAction): void;
}

export interface ReplayRun {
	trace: readonly number[];
	splits: readonly number[];
	timeMs: number;
}

/** Read-only snapshot for browser tests that sail the course (tests/autopilot.ts). */
export interface RegattaProbe {
	mode: Mode;
	x: number;
	y: number;
	heading: number;
	wind: number;
	nextMark: { x: number; y: number } | null;
	lessonStep: number | null;
}

declare global {
	interface Window {
		__regattaProbe?: () => RegattaProbe;
	}
}

/** Ambient frame interval on screens where nothing needs to move. */
const IDLE_FRAME_MS = 250;
/** Full-rate rendering continues this long after an input or mode change. */
const WAKE_MS = 1000;
const MINIMAP_EVERY_N_FRAMES = 3;
/** A finished replay holds on the finish line this long before ending. */
const REPLAY_TAIL_MS = 1500;

interface View {
	pose: BoatPose;
	ms: number;
	nextMark: number;
	trace: readonly number[];
}

/** Owns the simulation clock, input, and the render loop for one canvas. */
export class RaceController {
	private scene: SailingScene;
	private minimap: Minimap;
	private course: Course | null = null;
	private mode: Mode = "ready";
	private race: RaceState | null = null;
	private replay: (ReplayRun & { ms: number; speed: number }) | null = null;
	private lesson: TutorialState | null = null;
	private lessonCourseVersion = -1;
	private lessonPlanVersion = -1;
	private lessonAction: CoachAction | null = null;
	private pads = { left: false, right: false };
	private keys = { left: false, right: false };
	private raf = 0;
	private lastNow = 0;
	private accumulator = 0;
	private wallSec = 0;
	private lastIdleRender = Number.NEGATIVE_INFINITY;
	private awakeUntil = 0;
	private snapCamera = true;
	private frameCount = 0;
	private hudWriter: HudWriter;
	private minimapColors: MinimapColors;
	private readyPose: BoatPose = { x: 0, y: 0, heading: 0, speed: 0 };
	private idealPath = new IdealPath();

	constructor(
		canvas: HTMLCanvasElement,
		minimapCanvas: HTMLCanvasElement,
		hud: HudNodes,
		private events: ControllerEvents,
	) {
		this.scene = new SailingScene(canvas);
		this.minimap = new Minimap(minimapCanvas, this.scene.pixelRatio);
		this.hudWriter = new HudWriter(hud);
		this.minimapColors = readMinimapColors();
		window.addEventListener("keydown", this.onKey);
		window.addEventListener("keyup", this.onKey);
		window.__regattaProbe = () => this.probe();
		// Stop the loop entirely while the host covers or backgrounds the tile;
		// the race clock is simulation time, so it pauses with it.
		this.unsubscribeForeground = subscribePoeTileForegroundState(() => this.syncForeground());
		this.syncForeground();
	}

	private unsubscribeForeground: () => void;

	private syncForeground(): void {
		cancelAnimationFrame(this.raf);
		this.raf = 0;
		if (!isPoeTileForeground()) {
			this.pads = { left: false, right: false };
			this.keys = { left: false, right: false };
			return;
		}
		this.lastNow = 0;
		this.wake();
		this.raf = requestAnimationFrame(this.loop);
	}

	private probe(): RegattaProbe {
		const view = this.currentView();
		const course = this.course;
		return {
			mode: this.mode,
			x: view.pose.x,
			y: view.pose.y,
			heading: view.pose.heading,
			wind: course ? windAt(course, view.ms / 1000) : 0,
			nextMark: course?.marks[view.nextMark] ?? null,
			lessonStep: this.lesson?.step ?? null,
		};
	}

	setCourse(course: Course): void {
		this.applyCourse(course);
		this.readyPose = { ...createRace(course).boat };
		this.snapCamera = true;
		this.planPath();
		this.wake();
	}

	/** Show or hide the computed ideal path on the water and the map. */
	setShowPath(show: boolean): void {
		if (show === this.idealPath.shown) return;
		this.idealPath.shown = show;
		this.planPath();
		this.wake();
	}

	/** Only the start line and a live race have an ideal path; the lesson draws its own guide. */
	private planPath(): void {
		const course = this.course;
		if (this.idealPath.shown && course && !this.lesson && (this.mode === "ready" || this.mode === "racing")) {
			const view = this.currentView();
			this.scene.setGuide(this.idealPath.plan(course, view.pose, view.nextMark, view.ms));
			return;
		}
		if (this.idealPath.route.length > 0 && !this.lesson) this.scene.setGuide([]);
		this.idealPath.clear();
	}

	private applyCourse(course: Course): void {
		this.course = course;
		this.scene.setCourse(course);
		this.minimap.setCourse(course);
	}

	resize(width: number, height: number, minimapSize: number): void {
		this.scene.resize(width, height);
		this.minimap.resize(minimapSize);
		this.wake();
	}

	refreshPalette(): void {
		this.scene.refreshPalette();
		this.minimapColors = readMinimapColors();
		this.wake();
	}

	showReady(): void {
		this.scene.setGuide([]);
		this.mode = "ready";
		this.race = null;
		this.replay = null;
		this.lesson = null;
		this.snapCamera = true;
		this.idealPath.clear();
		this.planPath();
		this.wake();
	}

	startRace(race: RaceState): void {
		this.scene.setGuide([]);
		this.race = race;
		this.replay = null;
		this.lesson = null;
		this.mode = "racing";
		this.accumulator = 0;
		this.snapCamera = true;
		this.idealPath.clear();
		this.planPath();
		this.wake();
	}

	/** Freeze the scene on the current pose (finish moment, overlays). */
	pause(): void {
		this.mode = "paused";
		this.planPath();
		this.wake();
	}

	/** An untimed practice on open water with a steady wind and step-by-step goals. */
	startLesson(): void {
		this.lesson = createTutorial();
		this.lessonCourseVersion = this.lesson.courseVersion;
		this.lessonPlanVersion = this.lesson.planVersion;
		this.lessonAction = this.lesson.action;
		this.events.onLessonAction(this.lesson.action);
		this.idealPath.clear();
		this.applyCourse(this.lesson.course);
		this.scene.setGuide(this.lesson.guide);
		this.race = null;
		this.replay = null;
		this.mode = "lesson";
		this.accumulator = 0;
		this.snapCamera = true;
		this.wake();
	}

	startReplay(run: ReplayRun, speed: number): void {
		this.scene.setGuide([]);
		this.idealPath.clear();
		this.replay = { ...run, ms: 0, speed };
		this.race = null;
		this.lesson = null;
		this.mode = "replay";
		this.snapCamera = true;
		this.wake();
	}

	setReplaySpeed(speed: number): void {
		if (this.replay) this.replay.speed = speed;
	}

	setPad(side: "left" | "right", pressed: boolean): void {
		this.pads[side] = pressed;
		this.wake();
	}

	dispose(): void {
		cancelAnimationFrame(this.raf);
		this.unsubscribeForeground();
		window.removeEventListener("keydown", this.onKey);
		window.removeEventListener("keyup", this.onKey);
		delete window.__regattaProbe;
		this.scene.dispose();
	}

	private onKey = (event: KeyboardEvent): void => {
		const down = event.type === "keydown";
		const key = event.key.toLowerCase();
		if (key === "arrowleft" || key === "a") this.keys.left = down;
		else if (key === "arrowright" || key === "d") this.keys.right = down;
		else return;
		event.preventDefault();
		this.wake();
	};

	private steer(): Steer {
		const left = this.pads.left || this.keys.left;
		const right = this.pads.right || this.keys.right;
		return left === right ? 0 : left ? -1 : 1;
	}

	/** Modes where the player is at the helm. */
	private steering(): boolean {
		return this.mode === "racing" || this.mode === "lesson";
	}

	private wake(): void {
		this.awakeUntil = performance.now() + WAKE_MS;
	}

	private loop = (now: number): void => {
		this.raf = requestAnimationFrame(this.loop);
		const dt = Math.min(MAX_FRAME_DT, Math.max(0, (now - (this.lastNow || now)) / 1000));
		this.lastNow = now;
		this.wallSec += dt;
		const course = this.course;
		if (!course) return;
		this.advance(course, dt);

		const active = this.steering() || this.mode === "replay" || now < this.awakeUntil;
		if (!active) {
			if (now - this.lastIdleRender < IDLE_FRAME_MS) {
				this.scene.budget.shouldRenderFrame(now, { idle: true });
				return;
			}
			this.lastIdleRender = now;
		}
		if (!this.scene.budget.shouldRenderFrame(now)) return;
		this.scene.budget.renderFrame(() => this.draw(course, dt));
	};

	private advance(course: Course, dt: number): void {
		if (this.mode === "racing" && this.race) {
			this.accumulator += dt;
			while (this.accumulator >= SIM_DT && this.mode === "racing") {
				this.accumulator -= SIM_DT;
				const event = stepRace(course, this.race, this.steer());
				if (this.idealPath.tick() && this.mode === "racing") this.planPath();
				if (event) this.events.onRaceEvent(event, this.race);
			}
		} else if (this.mode === "lesson" && this.lesson) {
			const lesson = this.lesson;
			this.accumulator += dt;
			while (this.accumulator >= SIM_DT && this.mode === "lesson") {
				this.accumulator -= SIM_DT;
				const result = stepTutorial(lesson, this.steer());
				if (result === "done") this.mode = "paused";
				if (result) this.events.onLessonStep(lesson.step, result === "done");
			}
			if (lesson.courseVersion !== this.lessonCourseVersion) {
				this.lessonCourseVersion = lesson.courseVersion;
				this.applyCourse(lesson.course);
			}
			if (lesson.planVersion !== this.lessonPlanVersion) {
				this.lessonPlanVersion = lesson.planVersion;
				this.scene.setGuide(lesson.guide);
				if (!this.lessonAction || !sameAction(this.lessonAction, lesson.action)) {
					this.lessonAction = lesson.action;
					this.events.onLessonAction(lesson.action);
				}
			}
		} else if (this.mode === "replay" && this.replay) {
			this.replay.ms += dt * 1000 * this.replay.speed;
			if (this.replay.ms >= this.replay.timeMs + REPLAY_TAIL_MS) {
				this.mode = "paused";
				this.events.onReplayEnd();
			}
		}
	}

	private currentView(): View {
		if (this.replay) {
			const { trace, splits, timeMs } = this.replay;
			const ms = Math.min(this.replay.ms, timeMs);
			const samples = Math.min(trace.length / 3, Math.floor(ms / TRACE_INTERVAL_MS) + 1);
			return {
				pose: poseAt(trace, timeMs, ms),
				ms,
				nextMark: splits.filter((split) => split <= ms).length,
				trace: trace.slice(0, samples * 3),
			};
		}
		if (this.lesson) {
			return { pose: this.lesson.boat, ms: this.lesson.elapsedMs, nextMark: 0, trace: this.lesson.trace };
		}
		if (this.race) {
			return {
				pose: this.race.boat,
				ms: this.race.elapsedMs,
				nextMark: this.race.markIndex,
				trace: this.race.trace,
			};
		}
		return { pose: this.readyPose, ms: 0, nextMark: 0, trace: [] };
	}

	private draw(course: Course, dt: number): void {
		const view = this.currentView();
		const wind = windAt(course, view.ms / 1000);
		this.scene.render({
			pose: view.pose,
			wind,
			steer: this.steering() ? this.steer() : 0,
			nextMark: view.nextMark,
			timeSec: this.wallSec,
			dt,
			snapCamera: this.snapCamera,
		});
		this.snapCamera = false;
		if (!this.steering() || this.frameCount % MINIMAP_EVERY_N_FRAMES === 0) {
			const guide = this.lesson?.guide ?? this.idealPath.route;
			this.minimap.draw(course, view.pose, view.nextMark, wind, view.trace, this.minimapColors, guide, this.lesson !== null);
		}
		this.frameCount++;
		this.hudWriter.write({ course, ...view, wind, lesson: this.lesson !== null, steering: this.steering() });
	}
}
