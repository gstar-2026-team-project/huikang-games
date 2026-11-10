import type { TileMutator } from "./types";

export const checkpointRun: TileMutator<"checkpointRun"> = async (ctx, input) => {
	const runs = ctx.privateOfUser(ctx.userId).table("activeRun");
	const current = await runs.get("current");
	// Stale or out-of-order checkpoints (a late replay) change nothing.
	if (current?.runId !== input.runId || input.markIndex <= current.markIndex) {
		return;
	}
	await runs.set({
		itemKey: "current",
		value: {
			...current,
			markIndex: input.markIndex,
			x: input.x,
			y: input.y,
			heading: input.heading,
			speed: input.speed,
			splits: [...input.splits],
			trace: [...input.trace],
		},
	});
};
