# Platform integration reference

Use these exact SDK shapes with the scaffold's pin. This reference consolidates
schema/bindings, multiplayer sections 1–5, and native results; it does not add or
remove features. Keep the active workflow's requirements.
Read a full reference or the pinned declaration only for an uncovered capability,
blocking ambiguity, or concrete type/runtime discrepancy; scope it to that symbol.

## Schema, handlers and configuration

Adapt names to the scaffold. Keep named Zod row/input validators and the existing
client-safe schema version constant. Backend-only schema values never enter the
browser; browser code imports the schema **type**. Preserve other config fields,
actions, migrations and hooks. Both configs use the **same browser-safe handlers**.

```ts
// synced-store/schema.ts
import { z } from "zod";
import { defineSchema, table } from "poe-tiles-sdk/v1/backend.js";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";
const recordRow = z.object({ text: z.string().max(500) });
const updateRecordInput = z.object({ id: z.string().min(1).max(100), text: z.string().max(500) });
export const tileSchema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: { records: { schema: table(recordRow) } },
  mutators: { updateRecord: { input: updateRecordInput } },
});
export type TileSchema = typeof tileSchema;
```

Import `InferMutatorHandlers<TileSchema>`, `InferSystemHooks<TileSchema>` and
`InferReadContext<TileSchema>` from `poe-tiles-sdk/v1/client.js` to type mutators,
hooks and shared readers. Hooks' context knows app and system tables without casts.

```ts
// client-config.ts (merge with existing config)
import { defineClientConfig } from "poe-tiles-sdk/v1/client.js";
import type { TileSchema } from "./schema";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";
import { tileMutators } from "./mutators";
import { tileHooks } from "./hooks";
export const tileClientConfig = defineClientConfig<TileSchema>({
  schemaVersion: TILE_SCHEMA_VERSION, mutators: tileMutators, hooks: tileHooks,
});
// backend-config.ts (separate file, not imported by UI)
import { defineBackendConfig } from "poe-tiles-sdk/v1/backend.js";
import { tileSchema } from "./schema";
// Import the same tileMutators and tileHooks here.
export const tileBackendConfig = defineBackendConfig({
  schema: tileSchema, mutators: tileMutators, hooks: tileHooks,
});
```

Table operation shapes (separate examples):
`await ctx.table("records").get(input.id)`;
`await ctx.table("records").set({ itemKey: input.id, value: { text: input.text } })`;
`await ctx.table("records").delete(input.id)`;
`await ctx.table("records").scan().values().toArray()`.
Keys cannot contain `:`. Zod defaults do not make output-row fields optional:
keep affected fixtures, seed rows and UI props compatible. Choose bounded/public,
per-user-private or server-only storage before designing tables; UI filtering is
not privacy. For persisted-shape changes or accumulating ordered history, use the
full [schema migrations](../../synced-store/references/schema-migrations.md),
[visibility](../../synced-store/SKILL.md) and [sort keys](../../synced-store/references/sort-keys.md) references.

## Client, membership and seats

Create `Poe` and `Poe.setupStore(clientConfig)` once in the entry point. Show loading,
await `store.waitForBootstrap()`, then render live subscribed state. Never reset
saved progress on mount/reload. Persist gameplay in synced-store; only disposable
presentation state lives in memory. Browser storage is unavailable in the iframe.
Pass the real `Poe` object to UI needing host surfaces.

- `$users` contains membership tombstones: active means `removedAt === undefined`.
  Never write system tables; retained app-owned seats are not proof of membership.
- Names/avatars come from `$userInfo`. Import `type PoeUserInfo, usableDisplayName`
  from `poe-tiles-sdk/v1/shared.js`; use `usableDisplayName(profile) || "Player"`
  for `profile: PoeUserInfo | undefined`. Profile fields and `profilePicture` are
  optional; provide fallbacks, no raw IDs. Profile action:
  `await Poe.users.openProfile({ userId })`; handle failures.
- Shared `onAddUsersV2(ctx, { users })` runs **once per batch** with every admitted
  user in admission order. Each entry's optional `addedBatchUserIds` is invitation
  context, not a `$users` field. Deterministically seat admitted users; repeated
  admission must not reset play or duplicate seats. `onAddUsers` (per user) is
  deprecated; define one or the other.
- Offline presence preserves seats/progress. `onRemoveUser(ctx, { userId })` handles
  explicit removal: repair or visibly pause play, clear obsolete turns and retain
  an authorized recovery path. Store seats/roles/phase/board/turns in app tables.

## Assignment and committing actions

```ts
const picked = await Poe.room.pickMembers({
  title: "Choose player", selection: { max: 1 },
  excludeUserIds: [currentUserId], playingUserIds: seatedUserIds,
});
const user = picked?.users[0];
if (user) await store.mutate.assignSeat({ seatId, userId: user.userId, now: Date.now() });
```

Picker values are input, not authorization. In the mutator validate `ctx.userId`
(the authenticated actor, **not** `store.userId`), membership/role, phase, expected
round and legality. Call `assertRoomMember(ctx, { userId: input.userId })` for a
chosen room member; they may not yet exist in the tile-local `$users`. Check seat
availability, write the assignment, then `notifyUsersAddedToTile(ctx, {
 targetUserIds: [input.userId], appName, reason: "assigned", previewTimestamp: input.now
})`. Both helpers import from `poe-tiles-sdk/v1/client.js`. Admission is host-owned;
preserve the seat pending join. Expected conflicts should early-return or produce
visible status, not throw background errors. Apply the same actor/round checks to
moves and restart. Reject stale/replayed actions without duplicate side effects.
Generate times/IDs at callers, pass explicit next values, and read before merging.

These attention helpers also import from `poe-tiles-sdk/v1/client.js`:

| Operation | Exact call shape and meaning |
| --- | --- |
| Next player | `await setTurn(ctx, { userIds: [nextUserId], push: { body } })`. Optional `replace` defaults to true, replacing prior turns; no timestamp property. Updates next player's turn, unread, Recents and optional push. |
| Clear turns | `await clearTurn(ctx, { all: true })` or `await clearTurn(ctx, { userIds: [userId] })`. Use the appropriate form on paused/unfinished recovery paths; completion below clears all current turns. |
| Actor's meaningful action | `` await notifyActivity(ctx, { preview: `You ${actionText}`, previewTimestamp: input.now, targetUserIds: [ctx.userId], recency: "bump" }) ``. The actor reads "You …"; other members' calls use the display name, never a bare verb phrase. Required whenever a person acted; a shared fan-out that includes the actor satisfies the bump only when its preview names no human actor. Next player's `setTurn` does not bump the actor. |

Avoid duplicate next-player unread/push. Preferences/no-ops and pointer/animation
frames are not shared activity. Subscriptions may fire optimistically and again
on confirmation: deduplicate presentation effects by event/previous state.

## Terminal commit and native results

In the **same validated mutator** as the final state transition:

```ts
await completeRound(ctx, {
  board: { leaderboardId: "current-round", players: scoresByUserId,
    bestScore: "highest", label: "Round result", unit: { singular: "point", plural: "points" } },
  participantUserIds: playerIds, outcomeText, eventId: input.eventId, now: input.now,
});
```

`completeRound` imports from `v1/client.js` (also backend). It overwrites the complete
current-round board (`Record<string, number>`, including non-winners), clears all
current turns, sends completion activity/push/containing-chat announcement, includes
the actor and deduplicates participant IDs. `outcomeText` is one string for every participant, actor included, so keep it free of a named actor ("Round over: 12–9", "Blue team wins") rather than "Aaron won"; for per-reader copy, compose `setLeaderboard(ctx, board, { mode: "overwrite" })`, `clearTurn(ctx, { all: true })`, and split `notifyActivity` calls instead (keep `push` and `postToChat` on the other-members call only). Retain sender suppression and unread
defaults. Derive participants, scores and result from validated state. Guard the
terminal transition; a reused event ID alone does not deduplicate chat or authorize
action. It does not send ordinary-move activity. For cumulative/high-score boards,
compose `setLeaderboard`/`setLeaderboardScore` (`merge`/`replace`), `clearTurn` and
`notifyActivity` instead; see full [native results](native-results.md).

```ts
import { createNativeResults } from "poe-tiles-sdk/v1/client.js";
const results = createNativeResults({
  room: Poe.room,
  restart: async (expectedRound) => {
    await (await store.mutate.restart({ expectedRound })).confirmed;
  },
  onErrorChange: (failure) => renderResultsError(failure),
});
const unsubscribe = store.subscribe(readState, (snapshot) => {
  renderGame(snapshot); // decisive in-game result first
  results.update(snapshot.finished
    ? { round: snapshot.roundId, leaderboardId: "current-round" } : null);
});
// On unmount: unsubscribe(); results.dispose();
```

One controller per mount, fed **every snapshot**, including rollback/restart and
unfinished `null`. Round IDs stay unique across rounds/reloads; the round ID does
not partition leaderboard storage. Default opening delay is 600ms; optional
`schedule(run)` returns cancellation. The controller cancels/dismisses obsolete
results, ignores stale responses, does not reopen a dismissed result on repeated
snapshots, and calls restart only for current `playAgain`. Close is not restart.
Authorize expected-round restart in the mutator. Remount can present results again.

`onErrorChange` gives `{ message, error, retry }` for open/restart/dismiss failures,
and `null` when retry starts, round changes or disposal occurs. Render `message`
as text with a Retry control using `retry`; clear both on null. Retry is one-shot,
stale retries inert; no background retry loop. `.confirmed` means processing
finished, not acceptance. Preserve SDK background error handling and render live
authoritative state; use `onFailedMutation` for app-specific pending-state recovery.
The controller only catches errors actually thrown by its callback.

`createNativeResults` needs SDK 34 (`completeRound`: 31). Production Vite imports
infer minimum versions. For development/older tooling use
`poeTile({ minSdkVersion: 34 })`, preserving a higher existing minimum.

## UI adapter

Keep shared readers stable at module scope, typed with `AppReadContext`.

| Scaffold | Binding |
| --- | --- |
| React | `useLiveQuery(store, readState)` from `poe-tiles-sdk/v1/react` returns `{ data, isLoading, error }`; data starts undefined and `error` holds what a throwing query threw. Outer loading + narrowed ready component helps async handlers. Keep hook ordering stable. |
| Preact | `useEffect(() => store.subscribe(readState, setState), [store])` returns cleanup. |
| SolidJS | `createLiveQueryResource(() => props.store, () => readState)`; use `subscribeToTable` and `onCleanup` for keyed table-diff animation. |
| Vanilla JS | One subscription in `mountApp`; update existing nodes; unsubscribe on destruction. |
| Phaser | DOM shell owns subscription/latest snapshot; dynamically import scene with `getSnapshot()` and semantic callbacks. No per-frame store mutations. |

React/Preact/Solid scaffolds include Tailwind; Vanilla/Phaser use CSS unless
Tailwind configured. Choose the game's own layout and visual identity. Full
[multiplayer recipe](multiplayer-api-recipe.md) and
[schema/bindings](../../synced-store/references/schema-and-bindings.md) remain
available.
