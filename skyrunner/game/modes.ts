/** Course specs for each way to fly. Pure: shared by the sim, the UI and mutators. */
import type { CanyonDims } from "./canyon";
import { START_TIME } from "./constants";
import type { Ring } from "./course";

/** A ring that must be passed below (slow) or above (fast) a set speed. */
export type Gate = "slow" | "fast";

/** A hand-built course: fixed rings, mid-flight callouts, an opening tip, and how many misses still earn 2 stars. */
export interface AuthoredCourse {
	rings(): Ring[];
	/** Callout as the plane heads for ring `next`, if that ring opens a new phase. */
	callout(next: number): string | null;
	tip: string;
	twoStarMisses: number;
}

export interface CourseSpec {
	/** null = endless */
	ringCount: number | null;
	startTime: number;
	radius(index: number): number;
	bonus(index: number): number;
	/** largest heading change asked between rings, before the fairness bound */
	turn(index: number): number;
	/** Levels fly a river canyon carved along the course; endless modes fly the open valley. */
	canyon?: CanyonDims;
	/** A hand-built course (with a target ring) instead of a generated one. */
	authored?: AuthoredCourse;
	/** Which rings are speed gates; undefined for plain rings. */
	gate?(index: number): Gate | undefined;
}

/** Free flight and the daily challenge: endless, ramping to a floor. */
export const ENDLESS: CourseSpec = {
	ringCount: null,
	startTime: START_TIME,
	radius: (i) => Math.max(20, 38 - i * 0.9),
	bonus: (i) => Math.max(4.5, 8.5 - i * 0.18),
	turn: (i) => Math.min(0.62, 0.22 + i * 0.035),
};

/** The daily challenge: a fixed clock, no time bonus. */
export const DAILY_SECONDS = 40;
export const DAILY: CourseSpec = { ...ENDLESS, startTime: DAILY_SECONDS, bonus: () => 0 };

/**
 * Daily leaderboard score: rings first, then how soon the last ring was hit.
 * Packed as rings * 1000 + tenths of a second left over, so "highest" ranks both.
 */
export function dailyScore(rings: number, lastRingSeconds: number): number {
	const tenths = Math.round(Math.max(0, Math.min(DAILY_SECONDS, lastRingSeconds)) * 10);
	return rings * 1000 + (DAILY_SECONDS * 10 - tenths);
}
export function decodeDailyScore(score: number): { rings: number; seconds: number } {
	const rings = Math.floor(score / 1000);
	return { rings, seconds: (DAILY_SECONDS * 10 - (score - rings * 1000)) / 10 };
}
export const dailyDisplay = (rings: number, seconds: number) =>
	`${rings} ${rings === 1 ? "ring" : "rings"} · ${seconds.toFixed(1)} s`;

export const LEVEL_COUNT = 12;
/** Mean distance between ring centres on a course (m), from the course generator's spacing. */
const AVG_RING_GAP = 730;
/** Level 1 pays time for flying at cruising speed; each level asks a bit more. */
const LEVEL_PACE_START = 72;
const LEVEL_PACE_STEP = 2.4;

/** Level n (1-based): more rings, smaller rings, sharper turns, tighter clock. */
export function levelSpec(level: number): CourseSpec {
	const n = Math.max(1, Math.min(LEVEL_COUNT, Math.round(level))) - 1;
	const baseR = 40 - n * 1.2;
	const baseTurn = 0.15 + n * 0.03;
	// The clock is paid per ring from the average gap between rings and a
	// target pace that rises from cruising speed to about 98 m/s (350 km/h).
	const pace = LEVEL_PACE_START + n * LEVEL_PACE_STEP;
	return {
		ringCount: 6 + n,
		startTime: 20,
		radius: (i) => Math.max(baseR - 4, baseR - i * 0.4),
		// A slow gate costs time to brake into, so it pays it back.
		bonus: (i) => AVG_RING_GAP / pace + 1 + (levelGate(n, i) === "slow" ? SLOW_GATE_TIME : 0),
		gate: (i) => levelGate(n, i),
		turn: (i) => Math.min(0.6, baseTurn + i * 0.01),
		// Wide and shallow at level 1; narrow and deep by level 12.
		canyon: { halfWidth: Math.max(120, 170 - n * 7), wallRun: 200 - n * 6, rim: 140 + n * 20 },
	};
}

const SLOW_GATE_TIME = 4.5;

/**
 * Speed gates by level (n is 0-based): none on levels 1–2, slow gates from
 * level 3, fast ones too from level 4, alternating and closer together later.
 */
export function levelGate(n: number, i: number): Gate | undefined {
	if (n < 2 || i < 2) return undefined;
	const every = Math.max(2, 5 - Math.floor(n / 3));
	if ((i - 2) % every !== 0) return undefined;
	const g = (i - 2) / every;
	return n === 2 || g % 2 === 0 ? "slow" : "fast";
}

export function levelSeed(level: number): number {
	return 1000 + level * 7919;
}

/** One course per calendar day (UTC), the same for every pilot. */
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

/**
 * Stars for a level attempt. The course must be finished (every ring reached,
 * no crash, clock not out): every ring hit is 3 stars, one miss is 2, and at
 * least 60% hit is 1. Anything less clears nothing.
 */
export function starsFor(level: number, hits: number, completed: boolean): number {
	if (!completed) return 0;
	const total = levelSpec(level).ringCount ?? 0;
	if (hits >= total) return 3;
	if (hits >= total - 1) return 2;
	if (hits >= Math.ceil(total * 0.6)) return 1;
	return 0;
}

