# Turn-based mutator recipe

Use this recipe for a sequential turn-based tile. Adapt the table and field names to the tile, but keep the SDK import and call placement.

## Pass or clear the turn from the mutator

Import both helpers from the client entry point. Call them after writing the new authoritative match state, in the same mutator that accepts the move. Do not wrap them in `if (ctx.isServer)`: the client pass clears or marks the caller optimistically, while the server pass performs the authoritative fan-out.

```typescript
import { clearTurn, setTurn } from "poe-tiles-sdk/v1/client.js";
import type { TileMutator } from "./types";

export const makeMove: TileMutator<"makeMove"> = async (ctx, input) => {
	const match = await ctx.table("match").get("current");
	if (!match) throw new Error("The match has not started");

	// Validate the caller and move, then derive the complete next state from
	// authoritative stored state. These names are tile-specific.
	const { nextMatch, nextPlayerId, pushBody } = applyMove({
		match,
		userId: ctx.userId,
		move: input,
	});

	await ctx.table("match").set({
		itemKey: "current",
		value: nextMatch,
	});

	if (nextMatch.status === "finished") {
		await clearTurn(ctx, { all: true });
		return;
	}

	await setTurn(ctx, {
		userIds: [nextPlayerId],
		push: { body: pushBody },
	});
};
```

`setTurn` uses replace semantics by default, so passing the next player also clears the previous holder. Use the same pattern when a start/reset mutator makes the opening player actionable. Use `clearTurn(ctx, { all: true })` for every terminal path. A context-rich push body is preferred; omit `push` to use the generic default.
