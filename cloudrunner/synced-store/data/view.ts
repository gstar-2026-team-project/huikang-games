import { getLeaderboard } from "poe-tiles-sdk/v1/client.js";
import { usableDisplayName } from "poe-tiles-sdk/v1/shared.js";
import { decodeDailyScore } from "../../game/modes";
import { dailyBoardId, LEADERBOARD_ID } from "../constants";
import type { PilotRow, RunRow } from "../schema";
import { type AppReadContext, readMyRun, readPilot } from "./index";

/** `score` is turnpoints; on the daily board (decoded) `seconds` is its tie-break. */
export interface BoardEntryView { userId: string; score: number; seconds?: number }

export interface StoreView {
	me: string;
	day: string;
	/** free-flight board */
	entries: BoardEntryView[];
	/** today's daily-task board */
	daily: BoardEntryView[];
	profiles: [string, { name: string; picture: string | null }][];
	pilot: PilotRow | null;
	run: RunRow | null;
}

const toEntries = (board: { entries: readonly { userId: string; score: number }[] }) =>
	board.entries.map((e) => ({ userId: e.userId, score: e.score }));

/** Everything the flight screens read from the store, for one day's task. */
export function readView(day: string) {
	return async (ctx: AppReadContext): Promise<StoreView> => {
		const free = await getLeaderboard(ctx, { leaderboardId: LEADERBOARD_ID });
		const daily = await getLeaderboard(ctx, { leaderboardId: dailyBoardId(day) });
		const infos = await ctx.table("$userInfo").scan().values().toArray();
		return {
			me: ctx.userId,
			day,
			entries: toEntries(free),
			daily: toEntries(daily).map((e) => {
				const d = decodeDailyScore(e.score);
				return { userId: e.userId, score: d.turnpoints, seconds: d.seconds };
			}),
			profiles: infos.map((info) => [
				info.userId,
				{ name: usableDisplayName(info) || "Pilot", picture: info.profilePicture || null },
			]),
			pilot: (await readPilot(ctx, ctx.userId)) ?? null,
			run: (await readMyRun(ctx)) ?? null,
		};
	};
}
