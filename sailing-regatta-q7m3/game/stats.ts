import { TRACE_INTERVAL_MS } from "./constants";
import { type Course, courseLength, type Point } from "./course";
import { formatSpeed, formatTime } from "./format";
import type { Boat } from "./physics";

/**
 * Velocity made good: the part of the boat's velocity that closes on `target`,
 * in world units per second. Negative when sailing away from it.
 */
export function velocityMadeGood(boat: Boat, target: Point): number {
	const bearing = Math.atan2(target.x - boat.x, target.y - boat.y);
	return boat.speed * Math.cos(boat.heading - bearing);
}

export interface RaceStats {
	/** Distance actually sailed, in world units. */
	distance: number;
	/** World units per second. */
	avgSpeed: number;
	topSpeed: number;
	/** Course length over time: how fast the boat made progress round the course. */
	avgVmg: number;
}

/**
 * Stats for a finished run from its replay trace. Samples are TRACE_INTERVAL_MS
 * apart except the last (the finish), which lands at `timeMs`.
 */
export function raceStats(course: Course, trace: readonly number[], timeMs: number): RaceStats {
	const samples = trace.length / 3;
	let distance = 0;
	let topSpeed = 0;
	for (let i = 1; i < samples; i++) {
		const leg = Math.hypot(trace[i * 3]! - trace[(i - 1) * 3]!, trace[i * 3 + 1]! - trace[(i - 1) * 3 + 1]!);
		const isFinish = i === samples - 1;
		const spanMs = isFinish ? timeMs - (samples - 2) * TRACE_INTERVAL_MS : TRACE_INTERVAL_MS;
		distance += leg;
		// The finish span can be a few milliseconds; integer rounding would spike it.
		if (spanMs >= TRACE_INTERVAL_MS / 2) topSpeed = Math.max(topSpeed, leg / (spanMs / 1000));
	}
	const seconds = Math.max(timeMs, 1) / 1000;
	return {
		distance,
		avgSpeed: distance / seconds,
		topSpeed,
		avgVmg: courseLength(course) / seconds,
	};
}

/** Compact stats block for the leaderboard's per-player detail column. */
export function statsMarkdown(stats: RaceStats, timeMs: number): string {
	return [
		`⏱ ${formatTime(timeMs)} · ${Math.round(stats.distance)} m sailed`,
		`Speed: avg ${formatSpeed(stats.avgSpeed)} · top ${formatSpeed(stats.topSpeed)}`,
		`Velocity toward buoys: avg ${formatSpeed(stats.avgVmg)}`,
	].join("\n");
}
