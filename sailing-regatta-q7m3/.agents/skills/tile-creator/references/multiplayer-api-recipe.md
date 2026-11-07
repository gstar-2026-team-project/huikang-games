# Compact multiplayer API recipe

Use this shared path for React, Preact, SolidJS, Vanilla JS, and Phaser tiles.
The schema, mutators, hooks, and host APIs are framework-independent;
only the UI subscription adapter changes.

Use these documented shapes with the scaffold's SDK pin. Inspect declarations
only for a missing capability, blocking ambiguity or concrete type/runtime
discrepancy. Preserve the active workflow's feature requirements.
For new schemas, use the [schema and bindings example](../../synced-store/references/schema-and-bindings.md).

Sections: [client](#1-create-one-client), [membership](#2-model-people-and-seats),
[assignment](#3-add-or-assign-a-player), [turns and results](#4-commit-a-turn),
[UI binding](#5-bind-the-shared-reader-to-the-scaffold).

## 1. Create one client

In the tile entry point, create `Poe` once, call `Poe.setupStore(clientConfig)`
once, show a loading state while `store.waitForBootstrap()` resolves, and pass
`store` into the UI. Pass the real `Poe` object too when the UI opens host
surfaces such as `Poe.room.pickMembers()` or `Poe.users.openProfile()`.

Keep app state in synced-store. Use component or scene state only for disposable
presentation details such as hover, animation progress, and an open menu.
The tile iframe cannot use browser storage (`localStorage`,
`sessionStorage`, IndexedDB or cookies); synced-store owns durable storage
outside the iframe. Never reset saved progress when mounting the UI.

## 2. Model people and seats

- Read active membership from `$users`, filtering for `removedAt === undefined`
  because removed members retain tombstone rows. App-owned seats may outlive
  membership; do not count retained seats as active members. Never write system
  tables.
- Read names and avatars from `$userInfo`; never display a raw user ID.
- Store seats, teams, roles, turn order, phase, and board state in app-owned
  tables.
- Auto-seat newly admitted members with deterministic `onAddUsersV2` logic,
  wired into both `client-config.ts` and `backend-config.ts`.
- `onAddUsersV2(ctx, { users })` runs once per batch with every member it
  admitted, in admission order; a genesis roster arrives as one call. Each
  entry has `userId` and optional `addedBatchUserIds`, the invitation context
  for the operation, which is not stored on `$users`. Repeated admission must
  not reset the round or duplicate seats. The older `onAddUsers` (one call per
  user) is deprecated; a tile defines one or the other, never both.
- Ordinary offline presence does not remove membership or free a seat.
  `onRemoveUser(ctx, { userId })` must repair or pause unfinished play and
  clear obsolete turns, with an authorized recovery path.
- Decide public, per-user-private, and server-only visibility before writing the
  schema. Do not hide public data with UI filtering.

Keep the SDK's optional profile fields rather than redeclaring them as required:

```ts
import { type PoeUserInfo, usableDisplayName } from "poe-tiles-sdk/v1/shared.js";

function playerLabel(profile: PoeUserInfo | undefined) {
  return usableDisplayName(profile) || "Player";
}
```

Render an avatar fallback when `profile?.profilePicture` is absent. For shared
hooks, use `InferSystemHooks<AppSchema>` from `poe-tiles-sdk/v1/client.js`, as in
the scaffold; its `ctx` knows both app and system tables without casts.

## 3. Add or assign a player

Open the host picker from a visible in-tile button or empty-seat button:

```ts
const picked = await Poe.room.pickMembers({
  title: "Choose player",
  selection: { max: 1 },
  excludeUserIds: [currentUserId],
  playingUserIds: seatedUserIds,
});
const user = picked?.users[0];
if (user) {
  await store.mutate.assignSeat({
    seatId,
    userId: user.userId,
    now: Date.now(),
  });
}
```

Treat the picker result as UI input. In `assignSeat`, call
`assertRoomMember(ctx, { userId: input.userId })`, re-check that the seat is
available, write the assignment, and call `notifyUsersAddedToTile` when the user
was assigned or added. Expected conflicts such as a seat already being taken
should early-return or write visible status; do not throw a background error.

Also validate the authenticated actor, role and expected round before assignment.
A canonical room member may not yet exist in the instance-local `$users` mirror;
do not discard a valid picker choice solely because they have not opened it.
Import these helpers from `poe-tiles-sdk/v1/client.js`:

```ts
await notifyUsersAddedToTile(ctx, {
  targetUserIds: [input.userId],
  appName,
  reason: "assigned",
  previewTimestamp: input.now,
});
```

That call notifies the selected participant; membership admission remains
host-owned. Preserve the assignment while waiting for them to join.

## 4. Commit a turn

Put validation and the authoritative state transition in one mutator. Generate
IDs and timestamps at the UI call site, pass explicit next values rather than
toggle instructions, and read before merging a row.

After an accepted move:

- Call `setTurn(ctx, { userIds: [nextUserId], push: { body } })` for the next
  player. It already updates their turn marker, unread count, Recents order, and
  optional push.
- Finish a round with `completeRound` below; it clears all turn markers.
- Every meaningful accepted shared action needs the actor's Recents bump:
  add the actor-only call below with first-person copy. Reuse a shared
  `notifyActivity` fan-out that includes the actor only when its preview names
  no human actor. `setTurn` for the next player does not bump the actor.
  Do not duplicate the next player's unread/push merely for discoverability.
- Emit activity at semantic boundaries, never for every pointer or animation
  frame.

Subscriptions may fire for the optimistic write and again after confirmation.
Render from the latest snapshot and deduplicate sounds, animation, and toasts by
event ID or previous state.

Import `notifyActivity`, `setTurn` and `completeRound`
from `poe-tiles-sdk/v1/client.js`. For an actor-only update, write the preview
in the first person; other members get the display name in their own call:

```ts
await notifyActivity(ctx, {
  preview: `You ${actionText}`, previewTimestamp: input.now,
  targetUserIds: [ctx.userId], recency: "bump",
});
```

On the single accepted terminal transition, call the SDK completion helper in
the same mutator as the final move:

```ts
await completeRound(ctx, {
  board: {
    leaderboardId, players: scoresByUserId, bestScore: "highest",
    label, unit: { singular: "point", plural: "points" },
  },
  participantUserIds: participantIds,
  outcomeText, eventId: input.eventId, now: input.now,
});
```

This overwrites the complete current-round board, clears turns, and sends one
completion activity/push/chat fan-out including the actor. Derive outcome, scores
and participants from validated state. Retain the SDK's sender suppression and
unread defaults. Guard the terminal transition: reusing a message ID alone does
not deduplicate chat. `players` is a complete `Record<string, number>`, including
non-winners. `outcomeText` is one string for every participant, actor included, so keep it free of a named actor ("Round over: 12–9", "Blue team wins") rather than "Aaron won"; for per-reader copy, compose `setLeaderboard(ctx, board, { mode: "overwrite" })`, `clearTurn(ctx, { all: true })`, and split `notifyActivity` calls instead (keep `push` and `postToChat` on the other-members call only). For cumulative boards, compose `setLeaderboard`/`setLeaderboardScore`
with `merge` or `replace`, `clearTurn`, and `notifyActivity` instead.

Use [`createNativeResults`](native-results.md) for native presentation rather
than reimplementing its lifecycle. `createNativeResults` requires SDK 34;
`completeRound` requires SDK 31. Production Vite builds infer these minima
from their imports. Set `poeTile({ minSdkVersion: 34 })` when using both helpers
for development or older build tooling; keep any higher existing requirement.
The controller consumes every live finished-round snapshot (or `null` while
unfinished), handles scheduling, shared-restart dismissal, stale responses,
and explicit retries. Render a readable in-game outcome before updating it;
clear error UI on `onErrorChange(null)` and dispose on unmount.
The game owns authorization, terminal guards, and expected-round restart.
Round IDs tag overlays; they do not partition leaderboard storage.

## 5. Bind the shared reader to the scaffold

Keep reusable readers at module scope and type them with `AppReadContext`.

| Scaffold | Adapter |
| --- | --- |
| React | `useLiveQuery(store, readState)`; keep the reader reference stable. |
| Preact | `useEffect(() => store.subscribe(readState, setState), [store])`; returning the unsubscribe function handles cleanup. |
| SolidJS | `createLiveQueryResource(() => props.store, () => readState)` for query-shaped state. Use `subscribeToTable` plus `onCleanup` when table diffs drive keyed animation. |
| Vanilla JS | Subscribe once in `mountApp`, update existing DOM nodes from each snapshot, and retain the unsubscribe function if the mount can be destroyed. |
| Phaser | Let the DOM shell own subscriptions and the latest snapshot. Dynamically import the Phaser scene, pass `getSnapshot()` and semantic callbacks into it, and render snapshot changes into scene objects. Never mutate synced-store from `update()` or another per-frame loop. |

React's adapter imports from `poe-tiles-sdk/v1/react` and returns
`{ data, isLoading, error }`; `error` holds what a throwing query threw. Data is
undefined while loading; keep bootstrap/loading
in an outer component and pass required, narrowed data into a ready view when
async handlers would otherwise lose that narrowing. Keep hook ordering stable.
Profile actions use `await Poe.users.openProfile({ userId })`; handle failures.

A mutation's `.confirmed` means processing finished, not proof the action was
accepted. Render authoritative subscribed state. Preserve SDK error handling;
use `onFailedMutation` when app-specific pending state needs repair, rather
than creating a duplicate background-error toast.

React, Preact, and SolidJS scaffolds include Tailwind. Vanilla JS and Phaser use
plain CSS unless Tailwind is explicitly configured.
