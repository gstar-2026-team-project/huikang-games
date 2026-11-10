---
name: synced-store
description: "Build apps that USE synced-store for real-time multiplayer state. PROACTIVELY load when: designing a new Joiner tile's state/schema (even before any file exists), discussing how to hide, gate, or restrict visibility of data to specific users or to the server, writing schema.ts/mutators/*.ts/client-config.ts/backend-config.ts for a Joiner tile, calling store.subscribe/store.mutate, or wiring entry.tsx with setupStore."
---

# Synced-Store Reference

Real-time sync engine (like Replicache). Each app instance = one server-side SQLite DB + per-client IndexedDB copies. Mutators run optimistically on the client and authoritatively on the server. Actions run server-only (AI calls, image generation, randomness). Neither mutators nor actions can make HTTP requests: the backend runtime's `fetch` throws. Outbound work goes through `ctx.platform.call(...)` for platform services and `ctx.externalStore(...)` / `ctx.mutateExternal(...)` for other stores; neither gives general HTTP access.

- Mutators and actions are portable store code, not normal browser/Node code: mutators run on the client and then on the backend, and actions run on the backend. Backend execution happens in a special store-function runtime where ambient timer APIs such as `setTimeout` / `clearTimeout` are not available.
- Never change a row you read. `get`, `scan` and `entries` on the client return the object the local cache holds, so an in-place edit (`row.step++`, `row.cells[i].owner = id`, `row.items.push(x)`) corrupts local state even without a `set`, while the server's pass reads a fresh copy and the two diverge. Write a new value instead: `set({ itemKey, value: { ...row, step: row.step + 1 } })`. Read types mark top-level properties `readonly`; nested objects and arrays are not checked, so copy those too.
- Synced-store mutations and `externalMutations` work while offline and gracefully sync to the server. Actions and `ctx.platform.call(...)` only run on the server; client-side `ctx.platform.call(...)` in a mutator always throws. Mutator platform calls are discouraged, must be guarded with `ctx.isServer`, must be awaited, must be idempotent/read-only because optimistic-lock conflicts can retry the server mutator attempt, and should be used only for short one-off work because mutators are processed one at a time. Effects from `ctx.enqueueAction(...)` in a mutator will not happen until the mutation syncs to the server. Avoid actions when a mutator can express the behavior.
- `structuredClone` is available in mutators and actions on both the client and the server, so `structuredClone(row)` copies a row; it throws for functions, symbols and other values that cannot be cloned.

This file is a snippet index. Load the linked reference when you need detail.

Use the [schema and bindings example](references/schema-and-bindings.md) for the common typed store setup. Use documented shapes with the scaffold's SDK pin; inspect declarations only for missing capabilities, blocking ambiguity or concrete type/runtime discrepancies, scoped to the symbol involved.

Tile code runs in a sandboxed iframe without `localStorage`, `sessionStorage`, IndexedDB or cookies. The SDK owns its storage connection outside that iframe. Keep temporary presentation state in memory and durable shared/per-user state in synced-store; never depend on browser storage for rendering, result presentation or continuation.

## `synced-store/tile-schema-version.ts` — single source of truth

```ts
// Plain constant file — no Zod, no schema imports. Both client-config.ts
// and schema.ts read from here so the version can never drift between
// client and server. When you add migrations later, `schema.ts` keeps
// importing this same constant alongside the migrations registry.
export const TILE_SCHEMA_VERSION = 1;
```

See [→ schema-migrations.md](references/schema-migrations.md) for bumping the version with a migration.

> **⚠️ Once a tile is published, a backwards-incompatible schema change REQUIRES a migration — never ship one without it.** Real instances hold real data at the old shape. Bumping `TILE_SCHEMA_VERSION` without a matching `migrations` entry does not "reset" those instances gracefully — it makes every existing client clear its local data and dispose (see `onSchemaVersionMismatch` below), which reads to players as their game/room being wiped. If you are renaming/removing/retyping a field, changing an itemKey/sortKey convention, or otherwise altering the shape of already-persisted data or in-flight mutations, you are making a backwards-incompatible change: bump the version AND write the migration in the same change. If you genuinely only added a new table, a new mutator, or a new field with a default, that is backwards-compatible — do NOT bump the version. When unsure, assume it's incompatible and write the migration. Before republishing a schema change to a live tile, stop and confirm: does existing data still parse under the new schema? If not → migration required. [→ schema-migrations.md](references/schema-migrations.md)

## `schema.ts` — the contract

```ts
import { z } from "zod";
import { defineSchema, table, singletonTable, item } from "poe-tiles-sdk/v1/backend.js";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

export const tileSchema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: {
    todos: {
      schema: table(z.object({
        id: z.string(),
        text: z.string(),
        done: z.boolean(),
        updatedAt: z.number(),
      })),
      searchable: { textField: "text", timestampField: "updatedAt" },
    },
    settings: {
      schema: singletonTable(
        item("theme", z.enum(["light", "dark"])),
        item("pageSize", z.number()),
      ),
    },
  },
  mutators: {
    setTodo: {
      description: "Create or update a todo",
      input: z.object({ id: z.string(), text: z.string(), done: z.boolean().optional(), updatedAt: z.number() }),
    },
    removeTodo: { input: z.object({ id: z.string() }) },
  },
  actions: {
    suggestTodo: {
      description: "Ask an LLM for a todo suggestion",
      input: z.object({ prompt: z.string() }),
      output: z.object({ text: z.string() }),
    },
  },
});
export type TileSchema = typeof tileSchema;
```

- Homogeneous collection: `table(valueSchema)` — itemKeys are dynamic.
- Single-row record: `table(schema)` with a fixed itemKey like `"game"` (no no-key `singletonTable(schema)` form).
- Typed settings bag: `singletonTable(item(key, schema), ...)` — per-key value types [→ singleton-tables.md](references/singleton-tables.md).
- Lighter bundles (no Zod): Valibot or JSON Schema [→ schema-libraries.md](references/schema-libraries.md).
- Searchable in platform search / MCP tools [→ searchable-tables.md](references/searchable-tables.md).
- Bump `TILE_SCHEMA_VERSION` only for backwards-incompatible changes, with the migration and the pre-bump snapshot fixture in the same change — see the two callouts under `tile-schema-version.ts` above and [→ schema-migrations.md](references/schema-migrations.md).

## Mutators + shared data helpers

Keep each mutator handler in its own file under `synced-store/mutators/`.
Compose the exported mutator map in `synced-store/mutators/index.ts`.
Put read-only data loading helpers in `synced-store/data/` so query,
mutation, and action code can share them without importing write-only helpers.

`synced-store/data/todos.ts`:

```ts
import type { InferReadContext, InferSchemaTableTypes } from "poe-tiles-sdk/v1/client.js";
import type { TileSchema } from "../schema";

export type TileTableTypes = InferSchemaTableTypes<TileSchema>;
export type Todo = TileTableTypes["todos"];
export type TileReadCtx = InferReadContext<TileSchema>;

export async function readTodo(ctx: TileReadCtx, id: string): Promise<Todo | undefined> {
  return (await ctx.table("todos").get(id)) as Todo | undefined;
}
```

`synced-store/mutators/types.ts`:

```ts
import type { InferMutatorHandlers } from "poe-tiles-sdk/v1/client.js";
import type { TileSchema } from "../schema";

export type TileMutators = InferMutatorHandlers<TileSchema>;
export type TileMutator<Name extends keyof TileMutators> = TileMutators[Name];
```

`synced-store/mutators/set-todo.ts`:

```ts
import { readTodo, type Todo } from "../data/todos";
import type { TileMutator } from "./types";

// `updatedAt` is a REQUIRED input — the caller passes Date.now() at the call site.
// Reading the clock inside a mutator is not rebase-safe: the mutator re-runs on
// the server and during rebase, each seeing a different "now".
export const setTodo: TileMutator<"setTodo"> = async (ctx, input) => {
  const existing = await readTodo(ctx, input.id);
  const todo: Todo = {
    id: input.id,
    text: input.text,
    done: input.done ?? existing?.done ?? false,
    updatedAt: input.updatedAt,
  };
  await ctx.table("todos").set({ itemKey: input.id, value: todo });
};
```

`synced-store/mutators/remove-todo.ts`:

```ts
import type { TileMutator } from "./types";

export const removeTodo: TileMutator<"removeTodo"> = async (ctx, input) => {
  await ctx.table("todos").delete(input.id);
};
```

`synced-store/mutators/index.ts`:

```ts
import { removeTodo } from "./remove-todo";
import { setTodo } from "./set-todo";
import type { TileMutators } from "./types";

export const tileMutators: TileMutators = {
  setTodo,
  removeTodo,
};

export type { TileMutator, TileMutators } from "./types";
```

Read [→ mutator-rules.md](references/mutator-rules.md) before writing mutators. Key rules:
- Generate IDs + timestamps at the **call site** (not inside the mutator) — mutators run multiple times (optimistic + server + rebase).
- Explicit values, never toggles: `done: true`, NOT `done: !existing.done`.
- Read-before-write when merging — makes the mutator safe as both create and update.
- `.set()` takes `{ itemKey, value }`, not positional args.
- Private/server-only writes: `ctx.privateOfUser(userId).table(...)`, `ctx.serverOnly().table(...)` — see [data-visibility.md](references/data-visibility.md).

## `actions.ts` — server-only handlers

```ts
import { collectModelText, createModelStream, type InferActionHandlers } from "poe-tiles-sdk/v1/backend.js";
import type { TileSchema } from "./schema";

export const tileActions: InferActionHandlers<TileSchema> = {
  suggestTodo: async (ctx, input) => {
    const existing = await ctx.table("todos").scan().values().toArray(); // reads are fine
    const openModelStream = createModelStream(ctx.platform);
    const text = await collectModelText(
      openModelStream({
        model: "anthropic/claude-opus-5", // a model root, `lab/model` — the `id` of every `Poe.listModels()` entry
        prompts: [{ role: "user", text: `Suggest a todo after ${existing.length} existing todos: ${input.prompt}` }],
      }),
    );
    await ctx.mutate("setTodo", { id: crypto.randomUUID(), text, done: false, updatedAt: Date.now() });
    return { text };
  },
};
```

- Actions have read-only table access: `ctx.table(...)`, `ctx.privateOfUser(...).table(...)`, `ctx.serverOnly().table(...)`.
- To WRITE, call `ctx.mutate("mutatorName", input)` — there's no `.set()` / `.delete()` on action table handles.
- Platform API is a single `ctx.platform.call(name, input)` dispatch — prefer actions; the mutator-side caveats are at the top of this file and in [→ platform.md](references/platform.md).
- Call from UI: `await store.action.suggestTodo({ prompt })` — flushes pending mutations first, waits for server.
- Dispatch to another store instance [→ external-stores.md](references/external-stores.md).
- File uploads (`store.files.upload()` + the reserved `_requestUploadUrl` grant handler that gates them) [→ file-uploads.md](references/file-uploads.md).

## `client-config.ts`, `backend-config.ts`, wiring

```ts
// synced-store/client-config.ts — client-safe, no Zod
import { defineClientConfig } from "poe-tiles-sdk/v1/client.js";
import type { tileSchema } from "./schema"; // type-only!
import { tileMutators } from "./mutators/index";
import { tileHooks } from "./hooks";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

export const tileClientConfig = defineClientConfig<typeof tileSchema>({
  mutators: tileMutators,
  hooks: tileHooks,
  schemaVersion: TILE_SCHEMA_VERSION,
});
```

```ts
// synced-store/backend-config.ts — server-only
import { defineBackendConfig } from "poe-tiles-sdk/v1/backend.js";
import { tileSchema } from "./schema";
import { tileMutators } from "./mutators/index";
import { tileHooks } from "./hooks";
// import { tileActions } from "./actions"; // add when you introduce server-only handlers

export const tileBackendConfig = defineBackendConfig({
  schema: tileSchema,
  mutators: tileMutators,
  hooks: tileHooks,
  // actions: tileActions, // uncomment + import once actions.ts exists
});
```

```ts
// tile/src/entry.tsx — the only place that calls setupStore
import {
  applyNativeAppGestureOverrides,
  createPoe,
  PostMessageEnvironment,
} from "poe-tiles-sdk/v1/client.js";
import { tileClientConfig } from "../../synced-store/client-config";

applyNativeAppGestureOverrides();
const Poe = createPoe({ environment: new PostMessageEnvironment() });
const store = Poe.setupStore(tileClientConfig);
// render UI with `store` as a prop
```

- Keep `applyNativeAppGestureOverrides()` in every player-facing tile; remove it only when free text selection is a primary feature. This global override does not stop the iOS magnifier loupe, and no tile may show the loupe. Follow the tile-creator gesture audit and apply `suppressLongPressMagnifier(element)` to every non-scrolling surface where a finger may pause or drag, including the HUD, buttons, and menus.
- Type the client: `type TileStoreClient = InferSyncedStoreClient<TileSchema>`.
- Import paths: `poe-tiles-sdk/v1/client.js` (UI), `poe-tiles-sdk/v1/backend.js` (server).

## Reading — inside `query` / `subscribe` / mutator ctx [→ client-api-reference.md](references/client-api-reference.md)
- One-shot: `const todo = await store.query((ctx) => ctx.table("todos").get("todo-1"))`
- Get by key: `await ctx.table("todos").get("id")` — returns value or `undefined`
- Existence check: `const exists = await ctx.table("todos").has("id")`
- Mutators and data migrations: stream row-local work with `for await (const [key, value] of ctx.table("todos").scan().entries()) { ... }`. Use `.values()` or `.keys()` when the other half is unnecessary; stop early for existence checks.
- Collect arrays only when needed for a query result, an explicitly limited page, or bounded sorting/cross-row analysis: `await ctx.table("todos").scan({ limit: 50 }).entries().toArray()` — `[EntryKey, value][]`. Batching writes after an unlimited `toArray()` still retains the entire read. For storage-key changes, preserve a safe original-row snapshot or cursor strategy; see [schema migrations](references/schema-migrations.md).
- Prefix scan: `table.scan({ prefix: { sortKey: "2026-" }, limit: 50 })`
- Pagination: `table.scan({ limit: 50, cursor: lastEntryKey })`
- Reverse (latest N): `table.scan({ limit: 5, reverse: true })` — returns last 5 in **descending** order. Same entries via sentinel: `table.scan({ cursor: "$last", aroundCursor: { before: 5, after: 0 } })` — same set in **ascending** order (no manual reverse needed)
- Window around an anchor (UI rendering, e.g. show context around a search result): `table.scan({ cursor: { sortKey, itemKey }, aroundCursor: { before: 5, after: 45 } })` — returns up to 5 entries before the anchor, the anchor itself if present, then up to 45 after, ascending
- `aroundCursor` is **client-only** (queries / `subscribeToTable`). Mutators and actions calling it on the server throw with a pointer to the workaround: compose two `cursor + limit` scans manually if you really need server-side context around an anchor
- Current user inside a mutator/query: `ctx.userId` (NOT available on `store.userId`). From UI code, use the helper: `import { getCurrentUserId } from "poe-tiles-sdk/v1/client.js"; const myId = await getCurrentUserId(store);`
- **Read your own private table**: `await ctx.privateOfUser(ctx.userId).table("name").get("key")`. `ctx.table("name")` reads ONLY public data — even your own private rows aren't visible through it. Same goes for subscribes (`tx.privateOfUser(tx.userId).table(...)`)

## Writing — firing mutators from UI [→ mutator-rules.md](references/mutator-rules.md)
- Fire: `store.mutate.setTodo({ id, text, done: false, updatedAt: Date.now() })` — returns immediately, optimistic
- Await server confirmation: `const { confirmed } = await store.mutate.setTodo({ ... }); await confirmed`
- Terminal/manual inspection: `poe-tiles stores access <typeId> <instanceId>` checks the current `POE_API_KEY` user against `$users`; `poe-tiles stores schema <typeId> <instanceId>` lists mutators and generated CLI commands; `poe-tiles stores mutate <typeId> <instanceId> <mutationName> --input '<json>'` dispatches a mutator; `poe-tiles store files upload <typeId> <instanceId> <file>` uploads managed bytes and returns a `fileId` to claim. See [tile-creator CLI reference](../tile-creator/references/cli.md#stores--store-operations).
- Generate IDs/timestamps HERE (at the call site), pass as input: `id: await store.makeUniqueId()`, `updatedAt: Date.now()`
- **Dedupe keys** (`pendingMutationDedupeKey`, the second `store.mutate.*` argument) [→ client-api-reference.md](references/client-api-reference.md#pendingmutationdedupekey--collapse-repeated-pending-mutations). Of the mutations with the same key still queued to push, only the first and the latest are sent; the ones in between are dropped. Every call still applies optimistically and its `confirmed` still resolves.
  - **Use a dedupe key when a mutation only needs to run once per batch, so its first and last positions are enough.** That covers setters where the latest value wins (drafts, selected tool, cursor, hover, passive position) and idempotent catch-up mutations (a periodic `tick`/`sync`/`refresh` that recomputes state from `now`). Without a key, a client that is offline or behind replays every queued copy on reconnect. A tick fired every 30 s from a client that was offline for a day runs thousands of times on the server, drained in pushes of at most 400 mutations, where a key would run it twice.
  - Do NOT use it for append/send/event/counter/toggle mutations, or when a later mutation depends on an intermediate same-key write reaching the server: the dropped calls are not sent (one dropped after a timed-out push may already have run once), and their optimistic effects are rolled back.

  ```ts
  const POSITION_MUTATION_OPTIONS = {
    pendingMutationDedupeKey: "player-position",
  } as const;

  void store.mutate.updatePosition(
    { x, y, updatedAt: Date.now() },
    POSITION_MUTATION_OPTIONS,
  );

  // Idempotent catch-up: a backlog of ticks collapses to the first and latest.
  void store.mutate.tick({ now: Date.now() }, { pendingMutationDedupeKey: "tick" });
  ```

- See the mutator examples above for handler-side rules (explicit values not toggles, read-before-write, etc.)

## Sort keys — ordering unbounded, accumulating tables [→ sort-keys.md](references/sort-keys.md)

Sort keys are an opt-in ordering field that lets synced-store data be lazy-loaded. Developers assign the row order, then pull windows control which ordered data loads first.

### When to use

Add a nonempty `sortKey` when a table can accumulate unbounded data that is mostly presented as one ordered list, such as chat, activity, or social or photo feeds.

### When not to use

Keep small or bounded tables sort-key-free. Safety quotas do not make naturally accumulating history bounded.

### Default

Data has the empty sort key (`sortKey: ""`) and is always loaded. Nonempty sort keys make unbounded rows eligible for lazy loading; both kinds can coexist in one store.

- In practice, use one pull window per schema. The API accepts an array, but its windows run sequentially against one shared byte budget and cannot be loaded independently.
- Use one namespace for one ordered stream. For a feed, give each post a new `feed/...` sort key and reuse that exact key for bounded associated rows such as a capped comment preview, so they occupy the same atomic lazy-loaded position. An unbounded comment history must not share the post's key; paginate it separately.

See [sort-keys.md](references/sort-keys.md) for generation, pagination, pull windows, and examples.

## Subscribing — reactive UI [→ ui-patterns.md](references/ui-patterns.md)
- React/Preact: `const unsub = store.subscribe((ctx) => ctx.table("todos").entries().toArray(), (entries) => setTodos(entries.map(([, v]) => v)))`
- SolidJS (change diffs): `store.subscribeToTable("todos", (entries, changes) => { /* changes.added|modified|removed */ })`
- Solid + `reconcile()` to preserve DOM nodes across updates (see `docs/solidjs-best-practices.md`)
- React hook with loading state: `const { data, isLoading } = useLiveQuery(store, (ctx) => ctx.table("todos").entries().toArray())` from `poe-tiles-sdk/v1/react`
- Subscribe to a key prefix: `store.subscribe((ctx) => ctx.table("users").scan({ prefix: { itemKey: "alice" } }).entries().toArray(), (entries) => {})`
- Subscription queries re-run only when an exact key or scan prefix read through `ctx` changes. Values captured outside `ctx` are not tracked; after changing one that affects the query, call `await subscription.refresh()` to re-run the query and replace its dependencies.
- `store.subscribe()` and `store.subscribeToTable()` return a callable `SubscriptionControl`: call it to unsubscribe, or call its `refresh(): Promise<void>` method to refresh the result and tracked dependencies.
- Treat subscriptions for local actions as firing twice: optimistic local mutation, then authoritative server confirmation/rebase. Any subscription-driven animation, sound, toast, or derived side effect must de-dupe by event id, version, timestamp, or previous-state comparison.
- Animations via subscribeToTable change diffs: see `docs/synced-store-animation-guide.md`

## Mutator context [→ mutator-rules.md](references/mutator-rules.md) + [server-forking.md](references/server-forking.md)
- `ctx.table(name)` — public
- `ctx.privateOfUser(userId).table(name)` — per-user private (throws on client if `userId !== ctx.userId`)
- `ctx.serverOnly().table(name)` — server-only (throws on client; guard writes with `if (ctx.isServer)`)
- `ctx.isServer` — branch for pending indicators (`isPending: !ctx.isServer`) or server-only writes. Avoid otherwise
- `ctx.enqueueAction("name", input)` — call UNCONDITIONALLY; no-op on client, runs on server after commit.
- Skip optimistic entirely when outcome depends on unreadable data: `if (!ctx.isServer) return`
- Sending notifications from a mutator: `await notifyActivity(ctx, input)` — updates the manager sidebar (preview / unread bump), optionally enqueues an OS push, and can optionally append one app-owned announcement to the containing chat via `postToChat`.
- **Release gate: every meaningful accepted user action that changes tile state or advances play bumps the activity for the actor.** Put the activity in the same mutator as the state change; when gameplay state is otherwise local, invoke a small activity mutator once at the semantic boundary rather than on every pointer frame. Make the caller an activity recipient and resolve their activity to `recency: "bump"`. Reuse a fan-out call that includes the actor only when its preview names no human actor. When a person acted, send other members the third-person copy ("Aaron stole chickens") and add an actor-only `notifyActivity` with first-person copy ("You stole chickens"), `targetUserIds: [ctx.userId]`, `recency: "bump"`, and no `unread` or `push`. `setTurn` aimed at the next player does not bump the actor. Skip rejected/no-op actions and transient pointer/hover/draft updates. Also skip per-user preferences visible only to the acting user — mute, volume, haptics, theme, and reduced motion — even though they are accepted actions that write state: they change how the tile presents itself to one person rather than what happened inside it, so persist the preference and return without notifying. Shared settings that affect other players or play — house rules, difficulty, round length, board size, and similar room-wide configuration — still bump.

  ```ts
  await notifyActivity(ctx, {
    preview: string,           // sidebar preview text (e.g. last message)
    previewTimestamp: number,  // bumps the space in the recents list
    unread: "increment",       // optional; uses the default simple unread
                               // policy and bumps each non-caller recipient's
                               // app-owned unread count. Omit for a
                               // preview/sortKey refresh only.
    unreadToCaller: true,      // optional; system-attributed receipt that
                               // should also increment the caller. Requires
                               // unread: "increment" and caller targeting.

    // Optional. Omit → fan out to every active member.
    // Client pass is a no-op unless ctx.userId is in this list (or omitted);
    // the server's authoritative pass does the real fan-out.
    targetUserIds?: string[],

    // Optional. If present, every activity recipient EXCEPT the caller
    // gets an OS push (default sender-suppression). Use `pushToCaller: true`
    // to include the caller (e.g. system-attributed pushes); throws if the
    // caller isn't in the activity recipient set.
    push?: {
      title: string,           // notification title (sender / app name)
      body: string,            // notification body (preview / message text)
      pushToCaller?: boolean,  // default false — don't push your own action
    },

    // Optional. Appends one announcement row to the chat room resolved from
    // this store's pinned $$system/room. No caller-provided chat id. Chat
    // ignores messageId for row identity, uses its next msg/... sortKey, and
    // derives a separate chat-owned itemKey from that sortKey.
    postToChat?: {
      messageId: string,
      text: string,
      timestamp: number,
    },
  });
  ```

### Validation order: throw BEFORE the `isServer` gate

When a mutator validates its input (turn checks, slot conflicts, phase gates), put the `throw` **above** any `if (!ctx.isServer) return;` so it runs on the client's optimistic pass. Otherwise the optimistic mutation succeeds locally and the server-side rejection is silent (see "Server throws don't reject `confirmed`" below). Validate using public/own-private state up top; only gate writes that touch `serverOnly()` or other users' `privateOfUser` tables.

```typescript
makeMove: async (ctx, input) => {
  // CHEAP CHECKS FIRST — they run on both client (optimistic) and server.
  // A bad call rejects the outer `await store.mutate.makeMove(...)` synchronously.
  const game = await ctx.table("game").get("state");
  if (game?.status !== "playing") throw new Error("Game is not in play");
  if (game.currentPlayer !== ctx.userId) throw new Error("Not your turn");

  // SERVER-ONLY work below this line. The board lives in serverOnly(), so we
  // can't validate the move further on the client — accept the optimistic
  // pass as a no-op and let the server do the real work.
  if (!ctx.isServer) return;
  const board = await ctx.serverOnly().table("board").get("state");
  // ... apply move, advance turn, etc.
},
```

Worked example — a `startRound` mutator that validates role coverage with public state before doing any server-only randomness:

```typescript
startRound: async (ctx) => {
  const phase = await ctx.table("game").get("phase");
  if (phase !== "setup") throw new Error(`Cannot start in phase ${phase}`);

  // Public state — readable on client + server, so this throw rejects the
  // optimistic call synchronously when roles aren't filled.
  const players = (await ctx.table("players").entries().toArray()).map(([, v]) => v);
  const hasRedSpy = players.some((p) => p.team === "red" && p.role === "spymaster");
  const hasBlueSpy = players.some((p) => p.team === "blue" && p.role === "spymaster");
  if (!hasRedSpy || !hasBlueSpy) throw new Error("Both teams need a spymaster");

  // Server-only work below — randomness, hidden board placement, etc.
  if (!ctx.isServer) return;
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
  await ctx.serverOnly().table("board").set({ itemKey: "state", value: layoutFor(seed) });
  await ctx.table("game").set({ itemKey: "phase", value: "playing" });
},
```

## Actions — more detail [→ actions.md](references/actions.md) + [platform.md](references/platform.md)
- Handler shape and basic wiring shown in `actions.ts` example above.
- Stream bot responses, MCP tool exposure, multi-step actions — see `actions.md`.

## Inter-app communication [→ external-stores.md](references/external-stores.md)

Read this reference when you want different apps to communicate with each other or trigger mutations on each other.

## System hooks — react to membership / parenting / permission changes
Declare hooks in a client-safe module and wire them into **both** `defineClientConfig({ hooks })` and `defineBackendConfig({ hooks })`. Backend hooks run on the server within the same atomic transaction as the system mutator that fired them. Client hooks run optimistically for fresh creator launches before server data arrives, then the server-authoritative data replaces that overlay. Receive a `MutationContext` — treat hooks like mutators (read + write tables, follow rebase-safe rules). If a hook has server-only side effects, split the deterministic writes into a shared helper and keep the server-only tail backend-local, or guard that tail with `if (ctx.isServer)`. `onInit` is supplied by `poe-tiles-kernel` for new child-room launches and root-group genesis. Read the current room topology from `await ctx.table("$$system").get("room")`; `ctx.userId` identifies the initiating user for user/external-store bootstraps, while `ctx.isSystem` indicates the hook is running in trusted system scope. The input carries a read-only snapshot of the parent room's users for child rooms.

```ts
import type { InferSystemHooks } from "poe-tiles-sdk/v1/client.js";
import type { TileSchema } from "./schema";

export const tileHooks = {
  onInit: async (ctx, { parentRoomUsers }) => {
    const room = await ctx.table("$$system").get("room");
    if (room?.type === "rootGroup") {
      // Seed app-owned rows for a newly started group here.
      // A fresh rootGroup genesis always has an empty parentRoomUsers.
    }
  },
  onAddUsersV2: async (ctx, { users }) => {
    for (const { userId } of users) {
      await ctx.table("scores").set({ itemKey: userId, value: { userId, score: 0 } });
    }
  },
  onRemoveUser: async (ctx, { userId }) => { /* cleanup */ },
  onAnonymizeUser: async (ctx, { userId }) => { /* scrub app references */ },
  onSetTitle: async (ctx, { userId, title }) => { /* title is string | null — null when the custom title is cleared/reset to the default; handle both */ },
  onGrantPermission: async (ctx, { userId, permission }) => { /* e.g. log audit row */ },
  onRevokePermission: async (ctx, { userId, permission }) => { /* e.g. tear down role-specific state */ },
  onChildInstancesAdded: async (ctx, { instances }) => { /* e.g. index child rows */ },
  onRoomMemberInstanceMovedOut: async (ctx, { storeTypeId, instanceId, toRoom }) => { /* e.g. record departure */ },
} satisfies InferSystemHooks<TileSchema>;
```

- `onInit(ctx, { parentRoomUsers })` — new root-group or child-room instance initialized. Read `await ctx.table("$$system").get("room")` for the current room topology, and use `ctx.userId` for the initiating user when the bootstrap came from a user/external store; use `ctx.isSystem`, not `ctx.source.type === "system"`, to detect trusted system scope. `parentRoomUsers` is a **read-only snapshot** of the active parent room roster (`PoeUserInfo[]`) for child rooms and empty for root groups — useful to detect a fresh rootGroup genesis or to react to the parent roster, never a way to admit members. Apps may write their own tables on both passes. Do **not** write `$users` directly, and do not try to pull parent-room users into the instance: membership is platform-owned. The host seats the launcher at genesis (and both users when the tile is launched from a 2-person room, i.e. a DM); anyone else joins through the host picker/invite flows.
- Use `onInit` for deterministic one-time bootstrap, not membership. It is a good place to seed app-owned rows such as an initial activity or transcript message (`"{name} started the group"`).
- `onAddUsersV2(ctx, { users })` — users joined the instance, one call per batch (a genesis roster arrives whole), in admission order. Use it to auto-seat users or append membership activity. Read `$users[userId].addedBy` and `$userInfo` for attribution. Each entry's optional `addedBatchUserIds` is the ordered invitation group for its operation; it is not stored on membership rows, and one call can write one grouped announcement. Retain any history needed in your own message metadata.
- `onAddUsers` is deprecated. Use `onAddUsersV2`; a tile that defines both fails to load.
- `onRemoveUser(ctx, { userId })` — user removed. The platform clears that member's turn marker for you, before this hook runs. Other members' turns and app-owned seats, pause/restart rules, and scores stay app-controlled. Losing connectivity does not remove membership or clear a turn.
- `onAnonymizeUser(ctx, { userId })` — user hard-deleted/anonymized
- `onSetTitle(ctx, { userId, title })` — title changed; `title` is `string | null` — it is `null` when the custom title is cleared/reset to the default, so handle the null (reset) case rather than interpolating `null`
- `onGrantPermission(ctx, { userId, permission })` — permission granted
- `onRevokePermission(ctx, { userId, permission })` — permission revoked
- `onAddTileInstanceToRoom(ctx, { storeTypeId, instanceId })` — an app instance was registered as a member of this room (fires on the room store after a new `$room_member_instances` row is written; suppressed on idempotent re-registers)
- `onChangeTileParent(ctx, { previousParent, parent })` — this tile instance gained, lost, or changed its parent rootGroup
- `onAddChildTile(ctx, { typeId, instanceId, room })` — a rootGroup gained one net-new child tile row
- `onChildInstancesAdded(ctx, { instances })` — a rootGroup gained one or more net-new child tile rows
- `onRoomMemberInstanceMovedOut(ctx, { storeTypeId, instanceId, toRoom, ... })` — a member app instance is removed from this room

### Hook constraints
- **Client hook mirrors are the default.** Every backend hook should have a client-config entry so fresh prepared stores can run the same hook optimistically before server results arrive. Hooks must be browser-safe: deterministic, no backend imports, no platform calls on the client, and no server-only table reads/writes unless guarded with `if (ctx.isServer)`. A hook whose only useful work is server-only should still be represented by a client-safe no-op or shared partial helper, so future optimistic hook inputs do not silently do nothing.
- **Hooks can write app tables across visibility tiers.** Hooks run inside system mutators, but app public tables, server-only tables, and app private tables (including `ctx.privateOfUser(otherUserId)`) are app data, not reserved system tables. They still must not write reserved system tables such as `$users` or `$$system` directly — membership is platform-owned (the host seats users at launch; pickers/invites admit the rest), so hooks never add members. Use cross-user private writes sparingly for durable per-user projections tied directly to the hook event; regular mutators or actions are still clearer for user-initiated fan-out.
- **Hooks are schema-aware.** `defineBackendConfig({ schema, hooks })` infers app tables and actions. For shared client/backend hooks, annotate the map with `InferSystemHooks<typeof schema>`; no context casts are needed.

## Typing helpers extracted from a schema
The exported types `InferMutatorHandlers<Schema>`, `InferSchemaTableTypes<Schema>`, etc. cover the common cases. For helpers, prefer the schema-level context aliases:

```ts
import type {
  InferActionContext,
  InferMutationContext,
  InferReadContext,
} from "poe-tiles-sdk/v1/client.js";
import type { TileSchema } from "./schema";

export type TileReadCtx = InferReadContext<TileSchema>;
export type TileMutationCtx = InferMutationContext<TileSchema>;
export type TileActionCtx = InferActionContext<TileSchema>;
```

- `InferReadContext<Schema>` is the best default for shared data-loading helpers. It is a read-only context and accepts query, mutation, and action ctx values.
- `InferMutationContext<Schema>` is for helpers that write or enqueue actions.
- `InferActionContext<Schema>` is for helpers that need action-only fields such as `ctx.mutate`.

One situation still needs special care:

> **Caveat — `InferSchemaTableTypes` and singleton tables.** For tables defined with `singletonTable(item(key, schema), ...)`, `InferSchemaTableTypes<Schema>["myTable"]` returns the `SingletonTableBrand & {state: T}` bag, not the per-key value union. Reader-side `ctx.table("myTable").get("key")` correctly narrows to the inner item, so runtime calls work — but `type T = TileTableTypes["myTable"]` looks like it works (no error at the extraction step) and then blows up downstream because none of your fields are on the bag type. Derive the singleton item type from the Zod schema instead — `type Theme = z.infer<typeof themeSchema>`, defining `themeSchema` next to the `singletonTable(...)` call.

**Share typed hooks between the client and backend.** Keep the shared module browser-safe:

```ts
import type { InferSystemHooks } from "poe-tiles-sdk/v1/client.js";
import type { TileSchema } from "./schema";

export const hooks: InferSystemHooks<TileSchema> = {
  onAddUsersV2: async (ctx, { users }) => {
    for (const { userId } of users) await onUserJoin(ctx, userId);
  },
};
// Pass hooks to defineClientConfig<TileSchema> and defineBackendConfig.
```

Casting through `InferSystemHooks` keeps the hooks schema-aware on both sides;
do not widen them to `any` to silence a mismatch — fix the schema type instead.

## Data visibility — pick a tier before writing schema [→ data-visibility.md](references/data-visibility.md)
- Public (default): everyone in the instance sees it
- `privateOfUser(userId)`: only that user — write one copy per recipient when roles are assigned
- `serverOnly()`: never syncs to clients — expose derived results via actions
- Red flag: if you're designing client-side filtering or action-gating to hide data, you picked the wrong tier
- The tiers hide *data*, not *code*. Mutator and hook code ships to every player in the client bundle; only action code stays on the server. Put logic, prompts, or keys that must stay hidden in an action, or behind `ctx.isServer` reading `serverOnly()` data — see "Which of your code players can read" in data-visibility.md

## System tables — read-only, platform-populated [→ getting-user-info-of-members.md](references/getting-user-info-of-members.md)
Apps can READ but NOT WRITE these `$`-prefixed tables. The platform populates them.
- `$users` — membership roster. ItemKey = userId. Use `ctx.table("$users").entries().toArray()`, filter `!u.removedAt` for current members.
- `$userInfo` — profile data (`displayName`, `username`, `profilePicture`). ItemKey = userId.
- Optimistic first-mount system rows (`$$system.room`, `$users`, `$userInfo`) carry `_pendingSync: true` until the first server pull replaces them. Use it when UI needs to distinguish a locally seeded member from one fully admitted by the platform.
- `$$system:createdBy` — `{storeTypeId, instanceId}` of the app instance that originally spawned this one (e.g. via `apps.openChild`). First-writer-wins; absent for root apps and instances first reached via cross-store dispatch. Read with `await ctx.table("$$system").get("createdBy")`.

  **Encouraged: surface the current user's avatar + display name somewhere in the UI** (header, sidebar, "playing as ..." chip). It anchors the user inside the app instance — without it, multi-user apps feel ambiguous about identity, especially across device switches.

  **For multi-player tiles, also render the avatars of co-players and opponents** where the action is — at the table, on the board, beside each move, score row, and turn indicator — not just the current user. Seeing real faces is what makes a session feel like playing *with people* rather than against software, and it's a core part of what makes social games rewarding. Enumerate members from `$users`, look each up in `$userInfo`, and design for a missing `profilePicture` (initials fallback). Full recipe → [getting-user-info-of-members.md](references/getting-user-info-of-members.md#rendering-co-player-avatars).

  ```ts
  // Current user (avatar + name in the header) — recommended for every app
  const me = await ctx.table("$userInfo").get(ctx.userId);
  // me?.profilePicture, me?.displayName, me?.username

  // Another user (rendering an avatar next to their move/message)
  const other = await ctx.table("$userInfo").get(otherUserId);

  // Anywhere with ctx — same data, ergonomic helper:
  import { getUserInfo } from "poe-tiles-sdk/v1/client.js";
  const info = await getUserInfo(ctx, userId);
  ```

## Client lifecycle [→ client-api-reference.md](references/client-api-reference.md)

Routine persistence and sync run in the background. Do not add saving indicators, sync badges, or "progress saved" messages by default.

- Wait for authoritative data: `await store.waitForBootstrap()` (none of these are required — queries/mutations work immediately)
- Sortable unique id: `const id = await store.makeUniqueId()` — for use as itemKey or input to `store.mutate.*`
- Pending mutations: `store.getPendingCount()`, `store.onPendingMutationsChanged(fn)`
- Connection status: `store.connectionStatus`, `store.onConnectionStatusChange(fn)`, `store.isOnline`
- Error hooks: `store.onBackgroundError(fn)` for async sync errors, `store.onFailedMutation(fn)` for mutation-only failures, `store.onDisconnected(fn)`, `store.onSchemaVersionMismatch(fn)`, `store.onLibraryVersionMismatch(fn)`, `store.onDisposed(fn)` — kick / auth-failure codes arrive via `onDisconnected`
- Background-error toast: the SDK auto-shows a generic `BackgroundError:` toast and fires a `reportError` event for every background error — except `no_access_to_this_store`, which gets a blocking overlay and neither toast nor report — all with zero app code. There is **no per-error opt-out** — you cannot mark a specific expected error as suppressible. So keep *expected* errors out of the throw/background-error path entirely (see the "Don't throw for expected error cases" gotcha).
- Teardown: `store.dispose()` — closes WebSocket, not reversible

## Gotchas that bite everyone
- **Subscriptions fire twice per mutation** — once when the optimistic write lands locally, again when the server-confirmed result rebases. Callbacks must be idempotent: don't `mutate` / trigger sounds or animations / push to an array / increment a counter from inside a subscribe callback without dedup. 
- **`store.userId` does NOT exist** — read `ctx.userId` inside a subscribe/query/mutator callback, or in UI code call `getCurrentUserId(store)` (from `poe-tiles-sdk/v1/client.js`)
- **`ctx.table(name)` does NOT see your own private rows** — even reading your own data needs `ctx.privateOfUser(ctx.userId).table(name)`. The same applies to subscribes (`tx.privateOfUser(tx.userId).table(...)`)
- **Server-only throws are silently rolled back** — a `throw` inside `if (ctx.isServer) { ... }` does NOT reject the outer `await store.mutate.X(...)` or its `.confirmed` promise. The client's optimistic mutation just disappears and the user sees nothing. Validate with public/own-private data BEFORE the `isServer` gate so the throw runs on the optimistic pass and rejects synchronously. The platform already toasts and reports every background error (see "Background-error toast" above), so use `store.onFailedMutation(...)` to repair local state after a rollback, and reach for `store.onBackgroundError(...)` only when you replace the platform toast with app-specific handling. See "Validation order" above
- **Don't throw for expected error cases — early-return, or write the error to the store.** A throw in a mutator that survives to the server becomes a `failed_mutation` background error, which the SDK surfaces as a generic `BackgroundError:` toast AND fires a `reportError` event. There is no per-error opt-out — you **cannot** selectively suppress the toast for a single expected error. So route expected failures away from `throw` entirely:
    - **Benign / idempotent / redundant-replay** ("already started", "already joined", "already claimed", or an outcome that depends on unreadable server-only data) → **early `return`**. Pending mutations replay on every rebase and can race the same action from another client/device, so these replays are normal, not errors; a throw here also logs `"Synced State | Error rebasing mutation"` to the user's console on every rebase.
    - **An expected failure the UI must react to** (seat taken, hand folded, quota hit, validation the user should see) → **don't throw; write an error/status row to the store** and let clients subscribe, infer, and render it. This is the multi-user-correct channel: every client sees the state, not just the one caller who awaited `store.mutate.X(...)`. Throwing would only reach that caller (and only via `.confirmed`/`onBackgroundError`) and would spuriously toast.
    - Throw only for genuinely invalid actions that indicate a bug, never for a state the app is expected to hit in normal use. [→ mutator-rules.md](references/mutator-rules.md) rule 5
- **Hooks can write app private tables for any user** - system hooks may update app-owned public, server-only, and private rows, including `ctx.privateOfUser(otherUserId).table(...)`. They still cannot write reserved system tables such as `$users` or `$$system` directly. `onInit` can seed app rows for new root groups by reading `$$system.room`; it cannot add members — `parentRoomUsers` is a read-only snapshot and membership is platform-owned.
- **`.set()` takes `{ itemKey, value }`**, not positional args
- **Generate IDs + `Date.now()` outside mutators**, pass as input — mutators run on client + server + rebase
- **Use explicit values, not toggles** — rebase sees current state, so `!current.done` can flip the wrong way
- **Read-before-write when merging fields** — makes the mutator safe as both create and update, and safe to replay
- **`ctx.enqueueAction` needs no `isServer` guard** — it's already a client no-op
- **Type-only schema import on the client** — `client.ts`, `client-config.ts`, data helpers, mutator files, and any other file that ends up in the iframe bundle must `import type { tileSchema }`, never `import { tileSchema }`. **Pulling the schema in as a value drags `poe-tiles-sdk/v1/backend.js` into the frontend, which requires `node:async_hooks` (via the recorder package) and the build fails with `Module "node:async_hooks" has been externalized for browser compatibility`. The frontend module count typically jumps 10× when this happens.** If you need a runtime constant in both schema and UI, put it in a separate `synced-store/constants.ts` (no zod, no SDK imports) and import from there.
- **Share pure logic** — extract anything used by both mutators and UI into a shared module

## Constraints & limits [→ limitations.md](references/limitations.md)
- Size limits, JSON-only data types, kick codes, last-writer-wins, optimistic-lock retries
- Read the [live-data byte quota](references/limitations.md#live-data-quota)
  before designing a table that accumulates. It bounds total store data,
  including always-loaded rows; there is no separate row-count limit.
  Apps should still bound data growth.
- Per-write limits are enforced on the client AND the server: keys up to 1,786
  UTF-8 bytes of `tableName:itemKey`, values up to 1 MiB of `JSON.stringify`
  output. A whole push frame can contain multiple writes and is capped at 5 MiB,
  so split large payloads across keys and pushes rather than storing one big
  value.
- Server execution, memory, server load examples, and performance tips
  [→ architecture-scaling-and-performance.md](references/architecture-scaling-and-performance.md)
