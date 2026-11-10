import { notifyActivity, setLeaderboardScore } from "poe-tiles-sdk/v1/client.js";
import { levelCourse, levelStars } from "../../game/levels";
import { DAILY_SECONDS, dailyDisplay, dailyScore, dayLabel, decodeDailyScore, LEVEL_COUNT } from "../../game/modes";
import {
	dailyBoardId,
	LEADERBOARD_ID,
	LEADERBOARD_LABEL,
	RING_UNIT,
	type RunEndReason,
} from "../constants";
import {
	type AppMutationContext,
	CURRENT_RUN_KEY,
	readLevels,
	readPilot,
} from "../data/index";
import type { RunRow } from "../schema";

export function ringsText(n: number): string {
	return `${n} ${n === 1 ? RING_UNIT.singular : RING_UNIT.plural}`;
}

const starsText = (n: number) => `${n} ${n === 1 ? "star" : "stars"}`;

/**
 * Close a flying run exactly once: mark it done, fold it into the pilot's
 * stats for its mode, post any score, and bump the pilot's own activity row.
 * The caller guarantees `run.status === "flying"`.
 */
export async function finalizeRun(
	ctx: AppMutationContext,
	run: RunRow,
	reportedRings: number,
	endedAt: number,
	reason: RunEndReason,
	targetHit = false,
	lastRingAt?: number,
): Promise<void> {
	const mode = run.mode ?? "free";
	// A checkpoint may have landed after the final report; never lose rings.
	let rings = Math.max(reportedRings, run.rings);
	if (mode === "level" && run.level) rings = Math.min(rings, levelCourse(run.level).ringCount ?? rings);
	await ctx
		.privateOfUser(ctx.userId)
		.table("run")
		.set({ itemKey: CURRENT_RUN_KEY, value: { ...run, rings, status: "done", endedAt, reason } });

	const prev = await readPilot(ctx, ctx.userId);
	await ctx.table("pilots").set({
		itemKey: ctx.userId,
		value: {
			userId: ctx.userId,
			// `best` stays the free-flight record.
			best: Math.max(prev?.best ?? 0, mode === "free" ? rings : 0),
			flights: (prev?.flights ?? 0) + 1,
			totalRings: (prev?.totalRings ?? 0) + rings,
			lastRings: rings,
			updatedAt: endedAt,
		},
	});

	let preview = rings > 0 ? `You flew through ${ringsText(rings)}` : "You took a flight";
	if (mode === "daily" && run.day) {
		if (rings > 0) {
			// The daily board owns the high-score push: a new best for the day tells the others.
			// No tie-break time (a flight cut short): count it as the slowest.
			const secs = Math.min(DAILY_SECONDS, lastRingAt ?? DAILY_SECONDS);
			await setLeaderboardScore(ctx, {
				leaderboardId: dailyBoardId(run.day),
				userId: ctx.userId,
				score: dailyScore(rings, secs),
				bestScore: "highest",
				label: `${dayLabel(run.day)} daily challenge`,
				displayScore: dailyDisplay(rings, decodeDailyScore(dailyScore(rings, secs)).seconds),
			});
		}
		preview = `You flew ${ringsText(rings)} in the ${dayLabel(run.day)} daily challenge`;
	} else if (mode === "level" && run.level) {
		const stars = levelStars(run.level, rings, reason === "complete", targetHit);
		const row = await readLevels(ctx, ctx.userId);
		const prevStars = row?.stars ?? [];
		if (stars > (prevStars[run.level - 1] ?? 0)) {
			const next = Array.from({ length: Math.max(prevStars.length, run.level) }, (_, i) => prevStars[i] ?? 0);
			next[run.level - 1] = stars;
			await ctx.table("levels").set({
				itemKey: ctx.userId,
				value: { ...row, userId: ctx.userId, stars: next.slice(0, LEVEL_COUNT), updatedAt: endedAt },
			});
		}
		preview = stars > 0 ? `You cleared level ${run.level} with ${starsText(stars)}` : `You tried level ${run.level}`;
	} else if (mode === "free" && rings > 0) {
		await setLeaderboardScore(
			ctx,
			{
				leaderboardId: LEADERBOARD_ID,
				userId: ctx.userId,
				score: rings,
				bestScore: "highest",
				label: LEADERBOARD_LABEL,
				unit: { ...RING_UNIT },
			},
			{ notifyOnHighScore: false },
		);
	}
	await notifyActivity(ctx, { preview, previewTimestamp: endedAt, targetUserIds: [ctx.userId], recency: "bump" });
}
