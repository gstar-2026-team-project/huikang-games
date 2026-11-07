import { TRACE_INTERVAL_MS } from "./constants";
import { normalizeAngle } from "./physics";

export interface ReplayPose {
	x: number;
	y: number;
	heading: number;
	speed: number;
}

function point(trace: readonly number[], index: number) {
	const i = Math.max(0, Math.min(index, trace.length / 3 - 1)) * 3;
	return {
		x: trace[i] ?? 0,
		y: trace[i + 1] ?? 0,
		heading: (trace[i + 2] ?? 0) / 100,
	};
}

/**
 * Pose of a recorded run at race time `ms`. Samples are TRACE_INTERVAL_MS
 * apart except the final one, which is the finish position at `totalMs`.
 */
export function poseAt(
	trace: readonly number[],
	totalMs: number,
	ms: number,
): ReplayPose {
	const count = trace.length / 3;
	if (count === 0) return { x: 0, y: 0, heading: 0, speed: 0 };
	const regular = count - 1;
	const lastRegularMs = (regular - 1) * TRACE_INTERVAL_MS;
	let a: number;
	let b: number;
	let f: number;
	let spanMs: number;
	if (ms >= lastRegularMs) {
		a = regular - 1;
		b = regular;
		spanMs = Math.max(1, totalMs - lastRegularMs);
		f = Math.min(1, (ms - lastRegularMs) / spanMs);
	} else {
		a = Math.floor(Math.max(0, ms) / TRACE_INTERVAL_MS);
		b = a + 1;
		spanMs = TRACE_INTERVAL_MS;
		f = (Math.max(0, ms) - a * TRACE_INTERVAL_MS) / TRACE_INTERVAL_MS;
	}
	const p = point(trace, a);
	const q = point(trace, b);
	const dist = Math.hypot(q.x - p.x, q.y - p.y);
	return {
		x: p.x + (q.x - p.x) * f,
		y: p.y + (q.y - p.y) * f,
		heading: p.heading + normalizeAngle(q.heading - p.heading) * f,
		speed: dist / (spanMs / 1000),
	};
}
