import type { Course } from "../game/course";
import type { BoatPose } from "./boat";

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
/** Smallest area the map shows, so a lone buoy (the lesson) is not zoomed absurdly. */
const MIN_SPAN = 320;

/** North-up overview of the whole course with the boat, its track, and the wind. */
export class Minimap {
	private ctx: CanvasRenderingContext2D | null;
	private size = 0;
	private bounds = { minX: 0, minY: 0, scale: 1 };

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

	setCourse(course: Course): void {
		const xs = [course.start.x, ...course.marks.map((m) => m.x)];
		const ys = [course.start.y, ...course.marks.map((m) => m.y)];
		const minX = Math.min(...xs);
		const minY = Math.min(...ys);
		const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, MIN_SPAN);
		// Leave margin so a boat sailing wide of the course stays on the map.
		const margin = span * 0.18;
		this.bounds = {
			minX: minX - margin,
			minY: minY - margin,
			scale: 1 / (span + margin * 2),
		};
	}

	private project(x: number, y: number): [number, number] {
		const inner = this.size - PADDING * 2;
		const px = PADDING + (x - this.bounds.minX) * this.bounds.scale * inner;
		const py = this.size - PADDING - (y - this.bounds.minY) * this.bounds.scale * inner;
		const clamp = (v: number) => Math.max(3, Math.min(this.size - 3, v));
		return [clamp(px), clamp(py)];
	}

	draw(
		course: Course,
		pose: BoatPose,
		nextMark: number,
		wind: number,
		trace: readonly number[],
		colors: MinimapColors,
	): void {
		const ctx = this.ctx;
		const size = this.size;
		if (!ctx || size === 0) return;
		ctx.clearRect(0, 0, size, size);
		ctx.fillStyle = colors.sea;
		ctx.beginPath();
		ctx.roundRect(0, 0, size, size, 12);
		ctx.fill();
		ctx.strokeStyle = colors.edge;
		ctx.lineWidth = 1.5;
		ctx.stroke();

		// Course legs.
		ctx.setLineDash([3, 4]);
		ctx.strokeStyle = colors.edge;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.moveTo(...this.project(course.start.x, course.start.y));
		for (const mark of course.marks) ctx.lineTo(...this.project(mark.x, mark.y));
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
			const [x, y] = this.project(mark.x, mark.y);
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

		// Boat arrow.
		const [bx, by] = this.project(pose.x, pose.y);
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

		// Wind arrow in the corner: points the way the wind blows.
		ctx.save();
		ctx.translate(size - 15, 15);
		ctx.rotate(wind + Math.PI);
		ctx.strokeStyle = colors.wind;
		ctx.fillStyle = colors.wind;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(0, 8);
		ctx.lineTo(0, -5);
		ctx.stroke();
		ctx.beginPath();
		ctx.moveTo(0, -9);
		ctx.lineTo(4, -3);
		ctx.lineTo(-4, -3);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
	}
}
