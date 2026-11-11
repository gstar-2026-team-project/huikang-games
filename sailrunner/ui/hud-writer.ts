import { NO_GO_ANGLE } from "../game/constants";
import type { Course } from "../game/course";
import { formatTime } from "../game/format";
import { normalizeAngle, polar, trueWindAngle } from "../game/physics";
import { velocityMadeGood } from "../game/stats";
import type { BoatPose } from "../render/boat";

/** DOM nodes the loop writes directly, at canvas cadence, only on change. */
export interface HudNodes {
	timer: HTMLElement;
	marks: HTMLElement;
	speed: HTMLElement;
	speedBar: HTMLElement;
	/** Velocity made good toward the next buoy. */
	vmg: HTMLElement;
	windArrow: HTMLElement;
	irons: HTMLElement;
	/** Points at the next mark, relative to the boat, with its distance. */
	pointer: HTMLElement;
	pointerArrow: HTMLElement;
	pointerText: HTMLElement;
}

export interface HudFrame {
	course: Course;
	pose: BoatPose;
	ms: number;
	nextMark: number;
	wind: number;
	lesson: boolean;
	/** The player is at the helm (racing or in the lesson). */
	steering: boolean;
}

/** Writes the live HUD values, touching the DOM only when a value changed. */
export class HudWriter {
	private written = new Map<string, string>();

	constructor(private hud: HudNodes) {}

	write({ course, pose, ms, nextMark, wind, lesson, steering }: HudFrame): void {
		const twa = trueWindAngle(pose.heading, wind);
		const efficiency = polar(twa);
		const total = course.marks.length;
		const time = formatTime(ms);
		this.set("timer", time, () => (this.hud.timer.textContent = time));
		const markText = lesson
			? "Sailing lesson"
			: nextMark >= total
				? "Finished"
				: nextMark === total - 1
					? "Finish line"
					: `Mark ${nextMark + 1} of ${total - 1}`;
		this.set("marks", markText, () => (this.hud.marks.textContent = markText));
		const speed = pose.speed.toFixed(1);
		this.set("speed", speed, () => (this.hud.speed.textContent = speed));
		const target = course.marks[nextMark];
		const vmg = target ? velocityMadeGood(pose, target) : null;
		// No buoy to close on (after the finish): hide the readout.
		this.set("vmgShown", String(vmg !== null), () => {
			this.hud.vmg.closest<HTMLElement>(".metric")!.hidden = vmg === null;
		});
		const vmgText = vmg === null ? "" : vmg.toFixed(1);
		this.set("vmg", vmgText, () => (this.hud.vmg.textContent = vmgText));
		const vmgTone = vmg === null || Math.abs(vmg) < 0.5 ? "ok" : vmg > 0 ? "good" : "bad";
		this.set("vmgTone", vmgTone, () => (this.hud.vmg.dataset.tone = vmgTone));
		const bar = efficiency.toFixed(2);
		this.set("bar", bar, () => (this.hud.speedBar.style.transform = `scaleX(${bar})`));
		const tone = efficiency === 0 ? "bad" : efficiency > 0.9 ? "good" : "ok";
		this.set("tone", tone, () => (this.hud.speedBar.dataset.tone = tone));
		// The arrow shows where the wind blows relative to the camera (boat heading).
		const relative = Math.round((normalizeAngle(wind + Math.PI - pose.heading) * 180) / Math.PI);
		this.set("wind", String(relative), () => (this.hud.windArrow.style.transform = `rotate(${relative}deg)`));
		// Where the next mark is from the bow, so it can be found when it is off screen.
		const showPointer = steering && !lesson && target !== undefined;
		this.set("pointerShown", String(showPointer), () => (this.hud.pointer.hidden = !showPointer));
		if (showPointer && target) {
			const bearing = Math.atan2(target.x - pose.x, target.y - pose.y);
			const rel = Math.round((normalizeAngle(bearing - pose.heading) * 180) / Math.PI / 3) * 3;
			// The glyph points right; rotate so 0° is straight up the screen.
			this.set("pointerRot", String(rel), () => (this.hud.pointerArrow.style.transform = `rotate(${rel - 90}deg)`));
			const meters = Math.round(Math.hypot(target.x - pose.x, target.y - pose.y) / 5) * 5;
			const label = `${meters} m`;
			this.set("pointerText", label, () => (this.hud.pointerText.textContent = label));
		}
		const inIrons = steering && twa < NO_GO_ANGLE && pose.speed < 4;
		this.set("irons", String(inIrons), () => (this.hud.irons.dataset.show = String(inIrons)));
	}

	private set(key: string, value: string, apply: () => void): void {
		if (this.written.get(key) === value) return;
		this.written.set(key, value);
		apply();
	}
}
