import { readMyRun } from "../data/index";
import { finalizeRun } from "./finalize-run";
import type { TileMutator } from "./types";

export const finishRun: TileMutator<"finishRun"> = async (ctx, input) => {
	const run = await readMyRun(ctx);
	// Already finished, superseded, or never started: nothing to do.
	if (!run || run.runId !== input.runId || run.status !== "flying") return;
	await finalizeRun(ctx, run, input.turnpoints, input.endedAt, input.reason, input.seconds);
};
