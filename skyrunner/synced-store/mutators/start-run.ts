import { daySeed, levelSeed } from "../../game/modes";
import { CURRENT_RUN_KEY, readMyRun } from "../data/index";
import { finalizeRun } from "./finalize-run";
import type { TileMutator } from "./types";

export const startRun: TileMutator<"startRun"> = async (ctx, input) => {
	const mode = input.mode ?? "free";
	// Bad requests are ignored rather than thrown: a stale client must not toast.
	if (mode === "daily" && !input.day) return;
	// Every level is open from the start.
	if (mode === "level" && !input.level) return;
	const run = await readMyRun(ctx);
	if (run?.runId === input.runId) return; // replay of this take-off
	// A flight left open (closed tab, reload) counts as flown, not undone.
	if (run?.status === "flying") {
		await finalizeRun(ctx, run, run.rings, input.startedAt, "interrupted");
	}
	// Shared courses use the seed everyone else gets, whatever the client sent.
	const seed =
		mode === "daily" && input.day
			? daySeed(input.day)
			: mode === "level" && input.level
				? levelSeed(input.level)
				: input.seed;
	await ctx
		.privateOfUser(ctx.userId)
		.table("run")
		.set({
			itemKey: CURRENT_RUN_KEY,
			value: {
				runId: input.runId,
				seed,
				rings: 0,
				status: "flying",
				startedAt: input.startedAt,
				endedAt: null,
				reason: null,
				mode,
				...(mode === "daily" ? { day: input.day } : {}),
				...(mode === "level" ? { level: input.level } : {}),
			},
		});
};
