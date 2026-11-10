import { CURRENT_RUN_KEY, readMyRun } from "../data/index";
import type { TileMutator } from "./types";

export const passRing: TileMutator<"passRing"> = async (ctx, input) => {
	const run = await readMyRun(ctx);
	if (!run || run.runId !== input.runId || run.status !== "flying") return;
	if (input.rings <= run.rings) return; // stale or repeated checkpoint
	await ctx
		.privateOfUser(ctx.userId)
		.table("run")
		.set({ itemKey: CURRENT_RUN_KEY, value: { ...run, rings: input.rings } });
};
