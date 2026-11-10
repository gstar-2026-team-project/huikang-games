import type { Course, Point } from "../game/course";

/** The square patch of water the map shows: its centre and side length, in world units. */
export interface MapView {
	cx: number;
	cy: number;
	span: number;
}

/** Smallest area the map shows, so a boat beside its buoy is not zoomed absurdly. */
export const MIN_SPAN = 260;
/** Extra room around the framed points, as a fraction of their extent. */
const MARGIN = 0.22;

/** Centre a square view on the points, with a margin so a boat sailing wide stays on the map. */
export function fitView(points: readonly Point[], minSpan = MIN_SPAN): MapView {
	const xs = points.map((p) => p.x);
	const ys = points.map((p) => p.y);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);
	const minY = Math.min(...ys);
	const maxY = Math.max(...ys);
	const extent = Math.max(maxX - minX, maxY - minY);
	return {
		cx: (minX + maxX) / 2,
		cy: (minY + maxY) / 2,
		span: Math.max(extent * (1 + MARGIN * 2), minSpan),
	};
}

/**
 * What the map frames: the boat, the buoy it is sailing for, and the leg (or
 * the lesson's guide path) between them. After the finish it is the whole course.
 */
export function focusPoints(course: Course, boat: Point, nextMark: number, guide: readonly Point[] = []): Point[] {
	const target = course.marks[nextMark];
	if (!target) return [course.start, ...course.marks, boat];
	if (guide.length >= 2) return [boat, target, ...guide];
	return [boat, target, course.marks[nextMark - 1] ?? course.start];
}

/** Move `from` a fraction `t` of the way to `to`, so the map glides between legs. */
export function easeView(from: MapView, to: MapView, t: number): MapView {
	const mix = (a: number, b: number) => a + (b - a) * t;
	return { cx: mix(from.cx, to.cx), cy: mix(from.cy, to.cy), span: mix(from.span, to.span) };
}
