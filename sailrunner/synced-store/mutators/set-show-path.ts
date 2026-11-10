import type { TileMutator } from "./types";

// A personal preference: persisted, but never bumps Recents.
export const setShowPath: TileMutator<"setShowPath"> = async (ctx, input) => {
	const prefs = ctx.privateOfUser(ctx.userId).table("prefs");
	const current = await prefs.get("prefs");
	await prefs.set({ itemKey: "prefs", value: { ...current, muted: current?.muted ?? false, showPath: input.showPath } });
};
