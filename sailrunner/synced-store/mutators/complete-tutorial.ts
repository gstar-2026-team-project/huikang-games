import type { TileMutator } from "./types";

// Personal progress only other players never see, so it does not bump Recents.
export const completeTutorial: TileMutator<"completeTutorial"> = async (ctx) => {
	const prefs = ctx.privateOfUser(ctx.userId).table("prefs");
	const current = await prefs.get("prefs");
	if (current?.tutorialDone) return;
	await prefs.set({ itemKey: "prefs", value: { ...current, muted: current?.muted ?? false, tutorialDone: true } });
};
