# Sort Keys

A `sortKey` gives a table row an explicit ordering position, separate from its identity (`itemKey`). It exists to make unbounded, accumulating data that is mostly presented as one ordered list cheap to read a page at a time and cheap to sync, without ever loading the whole table into memory or shipping it all to every client.

This is the difference between a "toy" history table (fine while small, falls over once it accumulates) and a production one. If you are building anything that appends rows forever, read this before you design the schema.

## Do you actually need one?

Use a `sortKey` whenever **both** are true:

1. The table accumulates an unbounded, ever-growing number of rows (not a fixed small set), **and**
2. The rows are mostly presented as one ordered list — newest-first, chronological, or sequence position.

Pagination does not need to exist yet. Assigning sort keys during schema design keeps the data lazily loadable when the list grows; omitting them makes every row always-loaded.

A safety cap or per-user quota does not make a naturally accumulating history bounded for this decision. Those limits protect storage; sort keys protect each client's initial load and memory use.

Examples:

- A message or activity history appended in chronological order.
- A social or photo feed of user posts, normally shown newest-first.

A todo list, a per-user score row, a settings singleton, a lobby of ≤200 players — none of these need a sortKey. Their row count stays small and bounded, so a plain `scan()` over the whole table is simpler, correct, and fast. Adding a `sortKey` (and the `pullWindows` / `firstRenderBytes` tuning it unlocks) to a small table adds real complexity for zero benefit.

Rule of thumb: **if you'd be comfortable holding every row of the table in memory at once, you don't need a sortKey.**

## Identity vs. ordering: two independent axes

Every row is addressed by two independent components:

- **`itemKey`** — identity. Uniquely identifies the row within the table. This is what `get(itemKey)`, `has(itemKey)`, `delete(itemKey)`, and `set({ itemKey })` operate on.
- **`sortKey`** — ordering only. Determines where the row sorts relative to its siblings. Not part of identity. Two different rows may not share an `itemKey`, but they can carry unrelated `sortKey`s, or none.

Scans always return entries ordered by `(sortKey, itemKey)` ascending. A row written with no `sortKey` defaults to `""`, so all no-sortKey rows sort together, ahead of any row that has one.

```ts
// entries() / scan() ordering — sorted by (sortKey, itemKey):
//   { sortKey: "",       itemKey: "b" }   ← no sortKey → "" sorts first
//   { sortKey: "",       itemKey: "c" }
//   { sortKey: "msg/0",  itemKey: "..." }
//   { sortKey: "msg/1",  itemKey: "..." }
```

`EntryKey` (what `scan().entries()` and `scan().keys()` yield) is `{ sortKey?: string; itemKey: string }`. You can pass an `EntryKey` straight back into `set`/`delete` for read-modify-write loops.

## Attaching a sortKey with `.set()`

`sortKey` is a field on the `.set()` params, alongside `itemKey` and `value`:

```ts
await ctx.table("messages").set({
  sortKey,      // ordering position (see getNextSortKey below)
  itemKey,      // identity
  value,
});
```

Precedence when resolving the sortKey (see `resolveTableSetKey`):

1. An explicit `params.sortKey` wins.
2. Otherwise, if `itemKey` is itself an `EntryKey` carrying a `sortKey`, that is used.
3. Otherwise `sortKey` defaults to `""`.

So `set({ itemKey: someEntryKey, value })` preserves that entry's existing sortKey; passing an explicit `sortKey` overrides it.

### Changing a row's sortKey is just another `.set()`

Calling `.set()` for an existing `itemKey` with a **different** `sortKey` automatically re-homes the row: the client emits a tombstone at the old position and writes the new one (tombstone-on-move). You don't delete-then-recreate — one `set({ itemKey, sortKey: newSortKey, value })` moves it. Identity (`itemKey`) is preserved; only the ordering position changes.

### Validation limits

- `sortKey` and `itemKey` may not contain `:` (the internal storage-key delimiter) or a null character `\0`. Both throw at `.set()` time, on the optimistic client pass, so a bad key rejects the `await store.mutate.*` synchronously rather than silently rolling back on the server.
- Standard [key/value size limits](limitations.md) still apply; `sortKey` is excluded from the key-length limit.
- All data sharing one `sortKey` forms one atomic logical pull group. Synced-store may stream a large group through several response messages targeted below 8 MiB each, safely under the 32 MiB server-to-client ceiling; the client buffers every fragment and exposes the group only when complete. Pull byte budgets never select only part of a group. Use a distinct sort key for each independently pageable unit. See [synced-store limits](limitations.md).

## Generating sort keys: `ctx.getNextSortKey({ namespace })`

**Do not hand-roll sort keys from `Date.now()`.** Clock skew across devices produces collisions and out-of-order keys; a mutator re-running on the server or during rebase would read a different clock than the optimistic client pass. Instead, generate them inside a mutator:

```ts
const sortKey = await ctx.getNextSortKey({ namespace: "msg" });
await ctx.table("messages").set({ sortKey, itemKey: input.id, value: msg });
```

Behavior (verified across in-memory, Bun, QuickJS, and Cloudflare backends):

- **Format:** `{namespace}/{sortableNumber}`, e.g. `msg/0`, `msg/1`, … The suffix is a sortable-string encoding of a monotonic counter, so lexical order equals numeric order. The first key in a namespace has counter `0`.
- **Monotonic and unique**, even for multiple calls within one mutator (a per-transaction counter guarantees consecutive calls advance without an intervening write) and across separate mutations.
- **Safe under concurrency and offline writes.** Multiple clients (including offline ones that reconnect) writing to the same namespace converge to a consistent order. Only direct `{namespace}/{counter}` children seed the counter; nested descendants are ignored.
- **The counter never rewinds after deletion.** Delete the row at `msg/1` and the next generated key is still `msg/2`, never a reused `msg/1`. This keeps ordering stable and prevents a resurrected key from colliding with a tombstone.
- **Namespaces are independent counters.** `getNextSortKey({ namespace: "a" })` and `{ namespace: "a/thread" }` advance separately. A namespace must be non-empty and may not contain `:`. Custom direct-child keys are unsupported and can cause server rejection; custom nested descendants do not affect the parent counter.

The namespace is not just cosmetic — it's the unit that `pullWindows` targets (below). Choose one deliberately (e.g. `"msg"` for chat messages) and use it consistently in both the mutator and the schema.

### Migrating existing rows

Adding a sort key to future writes does not change rows already stored with the default empty sort key; those rows remain eager and outside the ordered history. When adopting sort keys for an existing table, run a schema/data migration or explicitly rebuild every existing row with a nonempty key. Assign keys in the intended historical order, in the namespace covered by the configured pull window.


## Scanning ordered data

All scans sort by `(sortKey, itemKey)`. On top of that:

```ts
// Latest N (newest-first): descending order, capped
table.scan({ limit: 50, reverse: true });

// Oldest N: ascending, capped
table.scan({ limit: 50 });

// Paginate forward from a known entry (its EntryKey is the cursor):
table.scan({ limit: 50, cursor: lastEntryKey });

// Range within a namespace (prefix on the sortKey):
table.scan({ prefix: { sortKey: "msg/" }, limit: 50 });

// One complete sort-key group (all rows whose sortKey is exactly "msg/042"):
table.scan({ exactSortKey: "msg/042" });

// A window centered on an anchor (e.g. jumping to a search hit): up to 5
// before the anchor, the anchor if present, then up to 45 after — ascending.
table.scan({ cursor: { sortKey, itemKey }, aroundCursor: { before: 5, after: 45 } });
```

Details:

- **`cursor`** is an `EntryKey` **or** a sentinel: `"$first"` (before every entry) / `"$last"` (after every entry). In forward mode `limit` returns entries strictly past the cursor; with `reverse` it returns entries strictly before it. Sentinels resolve symmetrically — `{ cursor: "$last", limit: 5, reverse: true }` is the last 5 in descending order.
- **`exactSortKey`** selects one complete sort-key group and lets server-side scans use the exact `(sortKey, tableName)` index range instead of scanning every row in the table. It is mutually exclusive with `prefix.sortKey`. Use `exactSortKey: ""` to select only rows with no explicit sort key; an empty prefix would match every row.
- **`reverse`** flips the returned order to descending. `{ limit: 5, reverse: true }` gives the newest 5 in descending order; the same set ascending (no manual reverse) is `{ cursor: "$last", aroundCursor: { before: 5, after: 0 } }`.
- **`aroundCursor: { before, after }`** returns a bidirectional window. Requires `cursor`; mutually exclusive with `limit`; `before`/`after` must be ≥ 0. **Client-only** — it runs in queries and `subscribeToTable`, but a **server-side** scan (inside a mutator or action) throws, because the bidirectional slice needs a full-table load that conflicts with the server's streaming scan model. If you truly need context around an anchor server-side, compose two `{ cursor, limit }` scans (one forward, one `reverse`) and merge.

### `itemKey`-prefix scans are unaffected by sort keys

`prefix.sortKey` and `prefix.itemKey` are **independent filters** on `scan({ prefix })`. Adding a `sortKey` to some or all rows in a table does **not** change what an `itemKey`-prefix scan returns:

```ts
// This keeps returning exactly the same rows whether or not those rows
// also carry a sortKey. The two prefix axes are orthogonal.
table.scan({ prefix: { itemKey: "bet-" } });
```

So a table that already partitions rows by an `itemKey` naming convention can start attaching sort keys for ordering without breaking any existing identity-prefix reads. You can also combine both axes in one scan (`prefix: { itemKey, sortKey }`) — a row must match both to be returned.

## The performance model: eager vs. lazy download

This is the reason sort keys exist, and the part most people miss.

- **Rows with no sortKey (`""`) are downloaded eagerly.** They are exempt from the pull byte-budget (they "freeload" — counted as 0 bytes) and sync to every client on every pull regardless of any `pullWindows` / `firstRenderBytes` config. Good for small, always-needed state (a game's config singleton, current status, roster).
- **Rows with a sortKey are downloaded lazily.** They are subject to the byte budget and to windowing — streamed progressively, in the order and quantity the schema's `pullWindows` / `firstRenderBytes` and the client's budget allow.

Giving a table's rows a sortKey is precisely **what makes them lazy**. That is why the feature only pays off for large, unbounded tables: on a small table you'd just be opting rows out of the eager fast-path for no reason.

**Mixing eager and lazy rows in one store is expected.** Always-needed data with the empty sort key (`sortKey: ""`) can always live alongside lazily loaded rows with nonempty sort keys. For example, keep a small config/status row eager while an unbounded message history uses `msg/...` sort keys and pull windows.

## Schema-level pull tuning

Two optional fields on `defineSchema({ ... })` control how sortKey'd data streams. Both are advanced — only configure them once a table's row count can grow unbounded.

```ts
defineSchema({
  schemaVersion: 1,
  // Load newest messages first; older ones stream in / load-more on demand.
  pullWindows: [{ namespace: "msg", direction: "descending" }],
  // Cap the initial synchronous payload so first render isn't blocked on history.
  firstRenderBytes: 5_000,
  tables: { /* ... */ },
  mutators: { /* ... */ },
});
```

### `pullWindows: PullWindow[]`

Each window is `{ namespace?, direction?, cursor?, loaded_range? }`:

- **`namespace`** — scopes the window to sortKeys matching `${namespace}/*` (range `["${namespace}/", "${namespace}/￿"]`), matching the `namespace` you pass to `getNextSortKey`. Omit for an unbounded window over all sortKeys. Required for `outward`.
- **`direction`** — `"ascending"` (oldest→newest, the default), `"descending"` (newest→oldest), or `"outward"` (stream both directions from an anchor, splitting the budget fairly).
- **`cursor`** — where streaming starts for ascending/descending. Defaults to `"$first"` (ascending) / `"$last"` (descending). Supports shorthand: `"$first"`/`"$last"` (global start/end), `"msg/$first"`/`"msg/$last"` (namespace start/end), or a literal sortKey. Omitted for `outward` (its runtime cursor comes from the anchor).

- **In practice, use one pull window per schema.** The API accepts an array, but its windows run sequentially against one shared byte budget, cannot be loaded independently, and may overlap.
- **Use one namespace for one ordered stream.** For a feed, give each post a new `feed/...` sort key and reuse that exact key for bounded associated rows such as a capped comment preview, so they occupy the same atomic lazy-loaded position. An unbounded comment history must not share the post's key; paginate it separately.

**`outward` windows need a runtime anchor.** The anchor sortKey is supplied by the platform at open time — `Poe.open({ anchorSortKey })` or `<poe-tile anchor-sort-key={...}>` — not in the schema. Use it to jump into the middle of a long history (e.g. opening a chat at a specific message from a search result) and stream context in both directions. A missing/empty anchor makes the outward window inactive for that pull. All outward windows in a schema share the one session anchor.

**Default when omitted:** `pullWindows` defaults to `[{}]` — a single unbounded window covering every sortKey. That syncs all sortKey'd data (budget permitting), which is usually what you want until a table gets large.

### `firstRenderBytes`

Targets how many bytes of non-empty-sortKey data are bundled into the first server page, so first paint doesn't block on the whole history. It defaults to 25,000 bytes and can be overridden per schema. The complete `""` group is included first and consumes zero budget; the framework then includes complete logical sort-key groups in pull-window order until the next group would exceed the target. The target is not a hard logical-group cap and a selected group may exceed it; transport fragmentation is independent and invisible to the client API. Remaining groups stream afterward.

For a cold non-creator launch, `waitForBootstrap()` resolves after that first server page is applied. It is not universally a server-readiness boundary: a compatible local cache can resolve it earlier, and creator/prepared instances can bootstrap immediately. Use `waitForServerData()` or `waitForInitialPull()` when code specifically needs server-origin data or completion of the full initial pull.

### Footgun: explicit `pullWindows` silently drops rows outside every window

Once you specify `pullWindows` explicitly, you **replace** the default `[{}]`. Any row whose sortKey falls outside every configured window's namespace **will not sync to the client** — no error, it just isn't there.

The classic mistake: a store has a `config`/status row written with a sortKey like `"config"`, plus a big `mem/…` history table. Someone adds `pullWindows: [{ namespace: "mem", direction: "descending" }]` to window the history — and the `config` row, whose sortKey `"config"` is outside the `"mem/"` namespace, stops syncing. The UI is then stuck on an empty/uninitialized state in production, with everything looking fine in tests that share client/server state.

Two ways to avoid it:

1. **Keep always-needed rows sortKey-free** (write them with no `sortKey`, so they're eager and window-exempt), and only give ordered-history rows a sortKey. This is the cleanest split.
2. Or, if an always-needed row must carry a sortKey, **add a window that covers it** — e.g. include an unbounded `{}` window or a window for its namespace alongside the history window.

When you narrow `pullWindows`, enumerate every sortKey'd row in the store and confirm each still falls inside some window.

## Client-side pagination / "load more"

Once a schema windows its history, the store exposes read state and a pull trigger for scroll-to-load UIs:

- **`store.moreDataAvailable`** — `true` when more sortKey'd data exists beyond what the last pull loaded. It only reflects truncation for a returning member, not the genesis creator: the first client created for a store is bootstrapped as its creator, and that path doesn't surface budget-exhaustion on the flag.
- **`store.moreOlderDataAvailable` / `store.moreNewerDataAvailable`** — directional variants for `outward` windows (older = smaller sortKeys, newer = larger).
- **`store.loadMore(arg?)`** — fetch more, resolving when the pull completes:
  - `loadMore()` — bump the byte budget by the default amount.
  - `loadMore(50_000)` — bump the budget by 50KB.
  - `loadMore("start")` / `loadMore("end")` — hint the active `outward` window to extend toward older / newer sortKeys on the next pull (budget unchanged).
  - `loadMore({ direction: "start", additionalBytes: 20_000 })` — combine both.

Concurrent `loadMore` calls are deduped: a second call while one is in flight returns the first call's promise and ignores its own args. Await before re-calling if you need precise control.

## Worked pattern: a chat-style message log

```ts
// schema.ts — window newest-first; keep the small "room settings" row eager.
export const chatSchema = defineSchema({
  schemaVersion: 1,
  pullWindows: [{ namespace: "msg", direction: "descending" }],
  firstRenderBytes: 8_000,
  tables: {
    // Big, append-only, ordered: every row gets a "msg/…" sortKey → lazy.
    messages: { schema: table(messageSchema) },
    // Small, always needed: NO sortKey → eager, window-exempt.
    settings: { schema: table(settingsSchema) },
  },
  mutators: { postMessage: { input: postInputSchema } },
});

// mutators/post-message.ts
export const postMessage: TileMutator<"postMessage"> = async (ctx, input) => {
  const sortKey = await ctx.getNextSortKey({ namespace: "msg" });
  await ctx.table("messages").set({
    sortKey,
    itemKey: input.id,            // stable identity generated at the call site
    value: { id: input.id, text: input.text, userId: ctx.userId, at: input.at },
  });
};

// UI: newest page first, then scroll up to load older.
const latest = await store.query((tx) =>
  tx.table("messages").scan({ limit: 50, reverse: true }).entries().toArray(),
);
if (store.moreDataAvailable) await store.loadMore();
```

The `settings` row rides the eager fast-path and is always present on first render; the `messages` history streams newest-first within the byte budget and pages in on demand — no client ever holds the entire message history in memory.
