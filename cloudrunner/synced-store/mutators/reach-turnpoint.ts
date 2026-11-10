import { CURRENT_RUN_KEY, readMyRun } from "../data/index";
import type { TileMutator } from "./types";

export const reachTurnpoint: TileMutator<"reachTurnpoint"> = async (ctx, input) => {
	const run = await readMyRun(ctx);
	if (!run || run.runId !== input.runId || run.status !== "flying") return;
	if (input.turnpoints <= run.turnpoints) return; // stale or repeated checkpoint
	await ctx
		.privateOfUser(ctx.userId)
		.table("run")
		.set({ itemKey: CURRENT_RUN_KEY, value: { ...run, turnpoints: input.turnpoints } });
};
