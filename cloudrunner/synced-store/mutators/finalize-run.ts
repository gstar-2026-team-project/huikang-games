import { notifyActivity, setLeaderboardScore } from "poe-tiles-sdk/v1/client.js";
import { DAILY_SECONDS, DAILY_TURNPOINTS, dailyDisplay, dailyScore, dayLabel, decodeDailyScore, turnpointsText } from "../../game/modes";
import { dailyBoardId, LEADERBOARD_ID, LEADERBOARD_LABEL, type RunEndReason, TURNPOINT_UNIT } from "../constants";
import { type AppMutationContext, CURRENT_RUN_KEY, readPilot } from "../data/index";
import type { RunRow } from "../schema";

/**
 * Close a flying run exactly once: mark it done, fold it into the pilot's
 * stats for its mode, post any score, and bump the pilot's own activity row.
 * The caller guarantees `run.status === "flying"`.
 */
export async function finalizeRun(
	ctx: AppMutationContext,
	run: RunRow,
	reported: number,
	endedAt: number,
	reason: RunEndReason,
	seconds?: number,
): Promise<void> {
	const daily = run.mode === "daily" && !!run.day;
	// A checkpoint may have landed after the final report; never lose turnpoints.
	let turnpoints = Math.max(reported, run.turnpoints);
	if (daily) turnpoints = Math.min(turnpoints, DAILY_TURNPOINTS);
	await ctx
		.privateOfUser(ctx.userId)
		.table("run")
		.set({ itemKey: CURRENT_RUN_KEY, value: { ...run, turnpoints, status: "done", endedAt, reason } });

	const prev = await readPilot(ctx, ctx.userId);
	await ctx.table("pilots").set({
		itemKey: ctx.userId,
		value: {
			userId: ctx.userId,
			// `best` stays the free-flight record.
			best: Math.max(prev?.best ?? 0, daily ? 0 : turnpoints),
			flights: (prev?.flights ?? 0) + 1,
			totalTurnpoints: (prev?.totalTurnpoints ?? 0) + turnpoints,
			lastTurnpoints: turnpoints,
			updatedAt: endedAt,
		},
	});

	let preview = turnpoints > 0 ? `You reached ${turnpointsText(turnpoints)}` : "You took a flight";
	if (daily && run.day) {
		if (turnpoints > 0) {
			// The daily board owns the high-score push: a new best for the day tells the others.
			// No time reported (a flight cut short): count it as the slowest.
			const score = dailyScore(turnpoints, seconds ?? DAILY_SECONDS);
			await setLeaderboardScore(ctx, {
				leaderboardId: dailyBoardId(run.day),
				userId: ctx.userId,
				score,
				bestScore: "highest",
				label: `${dayLabel(run.day)} daily task`,
				displayScore: dailyDisplay(turnpoints, decodeDailyScore(score).seconds),
			});
		}
		preview = `You reached ${turnpointsText(turnpoints)} in the ${dayLabel(run.day)} daily task`;
	} else if (turnpoints > 0) {
		await setLeaderboardScore(
			ctx,
			{
				leaderboardId: LEADERBOARD_ID,
				userId: ctx.userId,
				score: turnpoints,
				bestScore: "highest",
				label: LEADERBOARD_LABEL,
				unit: { ...TURNPOINT_UNIT },
			},
			{ notifyOnHighScore: false },
		);
	}
	await notifyActivity(ctx, { preview, previewTimestamp: endedAt, targetUserIds: [ctx.userId], recency: "bump" });
}
