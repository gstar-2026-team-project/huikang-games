# Mutator Rules

Mutators run twice: optimistically on the client, then authoritatively on the server. They can also **replay** during rebase when other mutations arrive from the server. The rules below make replay and double-execution safe.

## 1. Use Explicit Values, Not Toggles

Replay sees the current state, not the state at the time the mutation was created. A toggle (`!current.done`) can flip the wrong way if another user changed the value in between.

```typescript
// BAD: can flip the wrong way during rebase
await ctx.table("todos").set({ itemKey: id, value: { ...todo, done: !todo.done } });

// GOOD: pass the intended value
await ctx.table("todos").set({ itemKey: id, value: { ...todo, done: true } });
```

## 2. Generate IDs Outside Mutators

Mutators run on both client and server. Generating IDs inside produces different IDs on each run, splitting the "same" mutation into two different rows.

```typescript
// BAD: different ID on client vs server
addTodo: async (ctx, { text }) => {
  const id = Math.random().toString();
  await ctx.table("todos").set({ itemKey: id, value: { text } });
},

// GOOD: generate outside, pass in
const id = crypto.randomUUID();
await store.mutate.setTodo({ id, text: "Buy milk" });
```

Same applies to `Date.now()` — pass timestamps in from the client instead of reading the clock inside the mutator.

That makes a timestamp deterministic, **not trusted**. A server
[action](actions.md) can derive `Date.now()` instead of accepting a caller's
clock, which is useful for honest-client behavior. It is not currently a hard
authorization boundary: an action writes through `ctx.mutate(...)`, and that
same schema mutator remains directly callable by clients. Do not claim that an
action-to-mutator design makes adversarial daily streaks, cooldowns, or
deadlines tamper-resistant. The platform needs a backend-enforced app-internal
mutator (or transactional action writes) before those rules can rely solely on
server-derived time.

Storage keys also have a character constraint: `itemKey`, `sortKey`, and sort
key namespaces may not contain `:` (the internal delimiter) or a null character
(`\0`). Use `/` or `-` when composing keys, for example
`` `${ctx.userId}/${dayKey}` ``. Invalid keys throw on the optimistic pass.

## 3. Read Before Writing

Don't assume what exists in storage. Read current state, then merge:

```typescript
setTodo: async (ctx, input) => {
  const existing = await ctx.table("todos").get(input.id);
  await ctx.table("todos").set({
    itemKey: input.id,
    value: {
      text: input.text ?? existing?.text ?? "",
      completed: input.completed ?? existing?.completed ?? false,
    },
  });
},
```

This makes the mutator safe as both a create and an update, and safe to replay against state modified by other mutations.

Build the new value from the row you read; never edit the read row in place. On the client that row is the cached object itself, so an edit changes local state even if the mutation then fails on the server.

## Why These Matter

All three rules protect against the same failure mode: the mutator runs more than once (client + server + replay), and each run should converge on the same logical outcome. Break any of them and your local state diverges from the server's authoritative state, surfacing as "my change disappeared" or "duplicate entries" bugs.

## 4. Validate Before the `isServer` Gate

When a mutator can validate its input from public/own-private data, do that validation **above** any `if (!ctx.isServer) return;` so the throw runs on the client's optimistic pass.

```typescript
// BAD: server-only throw silently disappears on the client
makeMove: async (ctx, input) => {
  if (!ctx.isServer) return;
  const game = await ctx.table("game").get("state");
  if (game?.currentPlayer !== ctx.userId) throw new Error("Not your turn");
  // ... rest of move logic
},

// GOOD: validation runs on both passes; bad calls reject the outer
// `await store.mutate.makeMove(...)` synchronously on the client
makeMove: async (ctx, input) => {
  const game = await ctx.table("game").get("state");
  if (game?.currentPlayer !== ctx.userId) throw new Error("Not your turn");
  if (!ctx.isServer) return;
  // ... server-only work that depends on serverOnly() data
},
```

### Why: server-side throws are silently rolled back

A `throw` inside `if (ctx.isServer) { ... }` does **not** reject the outer `await store.mutate.X(...)` promise, and it does **not** reject `.confirmed`. The SDK rolls back the optimistic mutation and resolves both promises with `undefined`. The user sees their action evaporate with no error.

To surface server-rejected mutations, either:

1. Restructure validation so it runs on the optimistic pass too (preferred — see above).
2. Repair local state in `store.onFailedMutation((info) => { ... })` — restore the draft the user typed, clear a spinner, reset a pending id. The platform already shows a toast and reports every background error for any tile that calls `Poe.setupStore()`, so do not add a second toast from `store.onBackgroundError`; reach for that hook only when you must handle the non-mutation error kinds with app-specific copy, and then pass `Poe.setupStore(config, { backgroundErrorToast: false })` so your UI replaces the platform toast instead of doubling it.

If you genuinely need to validate against server-only data (`serverOnly()` table, randomness, action results), the silent rollback is the only behavior available — accept it and repair local state in `onFailedMutation` or derive the UI from store state.

### What you can/can't read on the client

| Source | Client validation works? |
|--------|--------------------------|
| `ctx.table("name")` (public) | Yes |
| `ctx.privateOfUser(ctx.userId).table(...)` | Yes |
| `ctx.privateOfUser(otherUserId).table(...)` | Throws on client |
| `ctx.serverOnly().table(...)` | Throws on client |

So: turn order, slot/membership checks, phase gates → validate up top. Move legality (against a server-only board), randomness, action outputs → server-only.

### Worked example

```typescript
startRound: async (ctx) => {
  // Public read — works on client + server, so this throw rejects the
  // optimistic call synchronously.
  const players = (await ctx.table("players").entries().toArray()).map(([, v]) => v);
  const hasRedSpy = players.some((p) => p.team === "red" && p.role === "spymaster");
  const hasBlueSpy = players.some((p) => p.team === "blue" && p.role === "spymaster");
  if (!hasRedSpy || !hasBlueSpy) throw new Error("Both teams need a spymaster");

  // Server-only randomness happens below the gate — never runs optimistically.
  if (!ctx.isServer) return;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  await ctx.serverOnly().table("board").set({ itemKey: "state", value: layoutFor(seed) });
},
```

## 5. Return, Don't Throw, When the Goal Is Already Achieved

Rule 4's throws are for genuinely invalid actions that indicate a bug or stale UI ("not your turn", "only the host can start"). They are the wrong tool when the mutator's *desired end-state already holds* — because mutations replay. A pending mutation re-runs on every rebase (each server pull while it is unconfirmed), and the same action can race in from another client or a second device of the same user. In all of those replays, "the thing I was asked to do is already done" is normal, not an error.

Every replay throw is logged to the user's console as `"Synced State | Error rebasing mutation"` (and, if the server pass throws too, surfaces as a failed mutation). A start/init/transition mutator that throws "already started" turns routine at-least-once delivery into error spam.

```typescript
// BAD: throws on every rebase after the game started (own replay OR a
// concurrent starter) — console errors in production for a non-event.
startMatch: async (ctx, input) => {
  const match = await ctx.table("match").get("state");
  if (match?.phase !== "lobby") throw new Error("Match already started");
  // ...
},

// GOOD: idempotent at the goal level — already started means nothing to do.
startMatch: async (ctx, input) => {
  const match = await ctx.table("match").get("state");
  if (!match) {
    // Client replay against a base that predates seeding: no-op. On the
    // server the caller is always seated first, so a missing row there is a
    // real invariant violation.
    if (ctx.isServer) throw new Error("Join the lobby before starting");
    return;
  }
  if (match.phase !== "lobby") return; // already started — goal achieved
  if (match.host !== ctx.userId) throw new Error("Only the host can start"); // still a real error
  // ...
},
```

Litmus test: would a second, delayed delivery of this exact mutation be *wrong* (a real conflict the user must see), or merely *redundant*? Throw for wrong; return for redundant.
