import type { TileMutator } from "./types";

export const abandonRun: TileMutator<"abandonRun"> = async (ctx, input) => {
	const runs = ctx.privateOfUser(ctx.userId).table("activeRun");
	if ((await runs.get("current"))?.runId !== input.runId) return;
	await runs.delete("current");
};
