/** Task specs for each way to fly. Pure: shared by the sim, the UI and mutators. */

export interface TaskSpec {
	/** Turnpoints in the task; null = endless. */
	count: number | null;
	/** Seconds before the flight is called off; null = no limit. */
	timeLimit: number | null;
}

/** Free flight: endless turnpoints, over when the glider lands out. */
export const FREE: TaskSpec = { count: null, timeLimit: null };

export const DAILY_TURNPOINTS = 4;
export const DAILY_SECONDS = 360;
/** The daily task: a fixed set of turnpoints against the clock. */
export const DAILY: TaskSpec = { count: DAILY_TURNPOINTS, timeLimit: DAILY_SECONDS };

const SCORE_STEP = 10_000;

/**
 * Daily leaderboard score: turnpoints first, then how soon the last one was
 * reached. Packed as turnpoints * 10000 + tenths of a second left over, so
 * "highest" ranks both.
 */
export function dailyScore(turnpoints: number, seconds: number): number {
	const tenths = Math.round(Math.max(0, Math.min(DAILY_SECONDS, seconds)) * 10);
	return turnpoints * SCORE_STEP + (DAILY_SECONDS * 10 - tenths);
}
export function decodeDailyScore(score: number): { turnpoints: number; seconds: number } {
	const turnpoints = Math.floor(score / SCORE_STEP);
	return { turnpoints, seconds: (DAILY_SECONDS * 10 - (score - turnpoints * SCORE_STEP)) / 10 };
}
export const beaconsText = (n: number) => `${n} ${n === 1 ? "beacon" : "beacons"}`;
export const dailyDisplay = (turnpoints: number, seconds: number) => `${beaconsText(turnpoints)} · ${seconds.toFixed(1)} s`;

/** One task per calendar day (UTC), the same for every pilot. */
export function dayKey(nowMs: number): string {
	return new Date(nowMs).toISOString().slice(0, 10);
}

export function daySeed(day: string): number {
	let h = 2166136261;
	for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619);
	return h & 0x7fffffff;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Jun 12" from "2025-06-12". */
export function dayLabel(day: string): string {
	const [, m, d] = day.split("-");
	return `${MONTHS[Number(m) - 1] ?? ""} ${Number(d)}`;
}
