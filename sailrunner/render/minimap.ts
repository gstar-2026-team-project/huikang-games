import { NO_GO_ANGLE } from "../game/constants";
import type { Course, Point } from "../game/course";
import type { BoatPose } from "./boat";
import { easeView, fitView, focusPoints, type MapView } from "./minimap-view";

export interface MinimapColors {
	sea: string;
	edge: string;
	mark: string;
	next: string;
	done: string;
	finish: string;
	boat: string;
	trail: string;
	wind: string;
}

const PADDING = 9;
/** How quickly the view glides to a new leg (per second; higher is snappier). */
const VIEW_EASE_RATE = 4;
/** Where the wind arrows sit across the map, as fractions of its size. */
const WIND_GRID = [0.2, 0.5, 0.8];
/** Radius of the no-go wedge drawn at the boat, in CSS pixels. */
const NO_GO_RADIUS = 22;

/**
 * North-up chart of the leg being sailed: the boat, its track, the next buoy,
 * the wind across the water, and the no-go zone the boat cannot point into.
 */
export class Minimap {
	private ctx: CanvasRenderingContext2D | null;
	private size = 0;
	/** Null until the first draw of a course, which snaps instead of gliding. */
	private view: MapView | null = null;
	private lastDrawMs = 0;

	constructor(
		private canvas: HTMLCanvasElement,
		private pixelRatio: number,
	) {
		this.ctx = canvas.getContext("2d");
	}

	resize(cssSize: number): void {
		if (cssSize === this.size) return;
		this.size = cssSize;
		this.canvas.width = Math.round(cssSize * this.pixelRatio);
		this.canvas.height = Math.round(cssSize * this.pixelRatio);
		this.ctx?.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
	}

	setCourse(_course: Course): void {
		this.view = null;
	}

	/** Glide the view toward the boat, its target and the leg between them. */
	private updateView(target: MapView): MapView {
		const now = performance.now();
		const dt = Math.min(0.25, Math.max(0, (now - this.lastDrawMs) / 1000));
		this.lastDrawMs = now;
		this.view = this.view ? easeView(this.view, target, 1 - Math.exp(-dt * VIEW_EASE_RATE)) : target;
		return this.view;
	}

	/** World position to map pixels; may fall outside the map. */
	private project(x: number, y: number): [number, number] {
		const view = this.view ?? { cx: 0, cy: 0, span: 1 };
		const inner = this.size - PADDING * 2;
		return [
			this.size / 2 + ((x - view.cx) / view.span) * inner,
			this.size / 2 - ((y - view.cy) / view.span) * inner,
		];
	}

	/** Like `project`, but pinned to the map's edge so off-map buoys still show their direction. */
	private projectPinned(x: number, y: number): [number, number] {
		const clamp = (v: number) => Math.max(4, Math.min(this.size - 4, v));
		const [px, py] = this.project(x, y);
		return [clamp(px), clamp(py)];
	}

	draw(
		course: Course,
		pose: BoatPose,
		nextMark: number,
		wind: number,
		trace: readonly number[],
		colors: MinimapColors,
		guide: readonly Point[] = [],
		/** Frame the whole guide (the lesson) rather than only the leg being sailed. */
		frameGuide = true,
	): void {
		const ctx = this.ctx;
		const size = this.size;
		if (!ctx || size === 0) return;
		this.updateView(fitView(focusPoints(course, pose, nextMark, frameGuide ? guide : [])));
		ctx.clearRect(0, 0, size, size);
		ctx.fillStyle = colors.sea;
		ctx.beginPath();
		ctx.roundRect(0, 0, size, size, 12);
		ctx.fill();
		ctx.strokeStyle = colors.edge;
		ctx.lineWidth = 1.5;
		ctx.stroke();
		// Legs and tracks that run off the map are cut at its edge.
		ctx.save();
		ctx.clip();

		// Wind across the water: each arrow points the way the wind blows.
		ctx.globalAlpha = 0.45;
		ctx.strokeStyle = colors.wind;
		ctx.lineWidth = 1.5;
		ctx.lineCap = "round";
		for (const fx of WIND_GRID) {
			for (const fy of WIND_GRID) {
				ctx.save();
				ctx.translate(size * fx, size * fy);
				ctx.rotate(wind + Math.PI);
				ctx.beginPath();
				ctx.moveTo(0, 6);
				ctx.lineTo(0, -6);
				ctx.moveTo(-3, -2.5);
				ctx.lineTo(0, -6);
				ctx.lineTo(3, -2.5);
				ctx.stroke();
				ctx.restore();
			}
		}
		ctx.globalAlpha = 1;

		// Course legs, or the lesson's intended path when there is one.
		const path = guide.length >= 2 ? guide : [course.start, ...course.marks];
		ctx.setLineDash([3, 4]);
		ctx.strokeStyle = guide.length >= 2 ? colors.next : colors.edge;
		ctx.lineWidth = guide.length >= 2 ? 2.5 : 1;
		ctx.beginPath();
		path.forEach((p, i) => (i === 0 ? ctx.moveTo(...this.project(p.x, p.y)) : ctx.lineTo(...this.project(p.x, p.y))));
		ctx.stroke();
		ctx.setLineDash([]);

		// Track sailed so far.
		if (trace.length >= 6) {
			ctx.strokeStyle = colors.trail;
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			ctx.moveTo(...this.project(trace[0]!, trace[1]!));
			for (let i = 3; i < trace.length; i += 3) {
				ctx.lineTo(...this.project(trace[i]!, trace[i + 1]!));
			}
			ctx.lineTo(...this.project(pose.x, pose.y));
			ctx.stroke();
		}

		const last = course.marks.length - 1;
		course.marks.forEach((mark, index) => {
			const [x, y] = this.projectPinned(mark.x, mark.y);
			ctx.fillStyle =
				index < nextMark
					? colors.done
					: index === nextMark
						? colors.next
						: index === last
							? colors.finish
							: colors.mark;
			ctx.beginPath();
			ctx.arc(x, y, index === nextMark ? 5 : 3.5, 0, Math.PI * 2);
			ctx.fill();
			if (index === nextMark) {
				ctx.strokeStyle = colors.next;
				ctx.lineWidth = 1.5;
				ctx.beginPath();
				ctx.arc(x, y, 8, 0, Math.PI * 2);
				ctx.stroke();
			}
		});

		ctx.restore();

		// No-go zone: headings this close to the wind stall the boat.
		const [bx, by] = this.projectPinned(pose.x, pose.y);
		ctx.globalAlpha = 0.3;
		ctx.fillStyle = colors.wind;
		ctx.beginPath();
		ctx.moveTo(bx, by);
		ctx.arc(bx, by, NO_GO_RADIUS, wind - NO_GO_ANGLE - Math.PI / 2, wind + NO_GO_ANGLE - Math.PI / 2);
		ctx.closePath();
		ctx.fill();
		ctx.globalAlpha = 1;

		// Boat arrow.
		ctx.save();
		ctx.translate(bx, by);
		ctx.rotate(pose.heading);
		ctx.fillStyle = colors.boat;
		ctx.beginPath();
		ctx.moveTo(0, -7);
		ctx.lineTo(4.5, 5);
		ctx.lineTo(0, 3);
		ctx.lineTo(-4.5, 5);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}
}

/** Mini-map colours from the CSS tokens, so dark mode applies. */
export function readMinimapColors(): MinimapColors {
	const style = getComputedStyle(document.documentElement);
	const read = (token: string) => style.getPropertyValue(token).trim() || "#888888";
	return {
		sea: read("--map-sea"),
		edge: read("--map-edge"),
		mark: read("--world-buoy"),
		next: read("--world-buoy-next"),
		done: read("--world-buoy-done"),
		finish: read("--world-finish"),
		boat: read("--map-boat"),
		trail: read("--map-trail"),
		wind: read("--map-wind"),
	};
}
