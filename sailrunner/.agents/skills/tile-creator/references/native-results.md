# Reusable native round results

`createNativeResults` and `completeRound` are shared SDK exports, not copied
scaffold files. They work with React, Preact, SolidJS, Vanilla JS, and Phaser.
Game rules, rendering, animations, and styles remain app-owned.

## Runtime requirement

Use an SDK version that exports these helpers. The current Vite plugin infers
SDK 34 for `createNativeResults` (31 for `completeRound`) from emitted imports
in production builds, preserving any higher configured minimum. For development or older build tooling, set
`minSdkVersion: 34` (or a higher existing requirement) in `poeTile({ ... })`.
The host supplies `v1/client.js` at runtime. SDK 31 has the helpers but lacks
the error `message` field; earlier hosts lack the named exports.
Deploy SDK/kernel support before publishing an app that imports them.

## Commit completion in the game mutator

```ts
import { completeRound } from "poe-tiles-sdk/v1/client.js";

// Inside the validated move mutator, after writing the terminal round state:
await completeRound(ctx, {
  board: {
    leaderboardId: "current-round",
    players: scoresByUserId, // complete board, including non-winners
    bestScore: "highest",
    label: "Round result",
  },
  participantUserIds: playerIds,
  outcomeText,
  eventId: input.eventId,
  now: input.now,
});
```

The same export exists in `v1/backend.js`. The helper overwrites this board,
clears every current turn-holder, and sends completion activity, push (with the
SDK's normal sender suppression), and a containing-chat announcement. It
includes the actor in activity recipients and deduplicates participant IDs.

**The mutator still validates membership, actor, phase and expected round.**
Derive scores and participants from game state. Call only once on the transition
to completion, in the same transaction as the final move. The helper does not
provide authorization or duplicate-completion protection; reusing a chat message
ID alone is not a guard. For cumulative/high-score boards, compose the existing
leaderboard and activity APIs instead of overwriting a complete round board.
This helper does not send activity for ordinary moves; retain those updates.

## Present results from the live subscription

```ts
import { createNativeResults } from "poe-tiles-sdk/v1/client.js";

const results = createNativeResults({
  room: Poe.room,
  restart: async (expectedRound) => {
    await (await store.mutate.restart({ expectedRound })).confirmed;
  },
  onErrorChange: (failure) => {
    // null clears the message AND retry control. Otherwise render failure.message
    // as text and wire Retry to failure.retry (one-shot; stale retries are inert).
    renderResultsError(failure);
  },
});

const unsubscribe = store.subscribe(readState, (snapshot) => {
  renderGame(snapshot); // readable in-game outcome first
  results.update(snapshot.finished
    ? { round: snapshot.roundId, leaderboardId: "current-round" }
    : null);
});

// Component/scene cleanup:
// unsubscribe(); results.dispose();
```

Create one controller per mounted tile. Feed **every** snapshot, including
rollback, shared restart and new rounds. Round IDs must remain unique across
rounds and reloads. Do not mount the controller only inside a finished-results
component. Use the same round/leaderboard pair while the completed round remains
visible; repeated snapshots do not reopen a dismissed result.

By default presentation waits 600ms. Optional `schedule(run)` returns a cancel
function; use it to coordinate with an app's own result animation. The controller
cancels obsolete work, dismisses obsolete overlays, ignores stale responses,
and calls `restart(expectedRound)` only for the current `playAgain` response.
Close never restarts. The restart mutator must authorize the actor and check
expected round and phase; `.confirmed` alone is not proof of acceptance.

`onErrorChange` receives `{ message, error, retry }` on a current open/restart/dismiss
failure, and `null` when retry begins, the round changes, or the controller is
disposed. Retry calls are one-shot. No automatic retry loop runs in the background.
Remounting a finished tile may present its result again; suppression is local
to one mount, not persisted game state.

`message` is a plain-text string for your error UI; `error` retains the original
cause for diagnostics. Render it as text, never HTML. Restart rejection must be
surfaced through the store's background-error handling and live game state; the
controller can only report errors actually thrown by your restart callback.
