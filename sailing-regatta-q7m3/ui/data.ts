import { getLeaderboard } from "poe-tiles-sdk/v1/client.js";
import { type PoeUserInfo, usableDisplayName } from "poe-tiles-sdk/v1/shared.js";
import type { AppReadContext } from "../client";
import { leaderboardIdFor } from "../game/course";

/** Build a stable live-query reader for one day's course. */
export function createDayReader(day: string) {
	return async (ctx: AppReadContext) => {
		const [runs, board, activeRun, prefs, profiles] = await Promise.all([
			ctx.table("runs").scan({ prefix: { itemKey: `${day}/` } }).values().toArray(),
			getLeaderboard(ctx, { leaderboardId: leaderboardIdFor(day) }),
			ctx.privateOfUser(ctx.userId).table("activeRun").get("current"),
			ctx.privateOfUser(ctx.userId).table("prefs").get("prefs"),
			ctx.table("$userInfo").scan().values().toArray(),
		]);
		const ranked = [...runs].sort((a, b) => a.timeMs - b.timeMs || a.finishedAt - b.finishedAt);
		return {
			day,
			userId: ctx.userId,
			runs: ranked,
			board,
			activeRun,
			muted: prefs?.muted ?? false,
			tutorialDone: prefs?.tutorialDone ?? false,
			profiles: Object.fromEntries(profiles.map((p) => [p.userId, p])) as Record<string, PoeUserInfo>,
		};
	};
}

export type DayData = Awaited<ReturnType<ReturnType<typeof createDayReader>>>;
export type RunRow = DayData["runs"][number];

export function playerName(profile: PoeUserInfo | undefined): string {
	return usableDisplayName(profile) || "Sailor";
}
