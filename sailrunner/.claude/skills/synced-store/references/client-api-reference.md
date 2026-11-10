# SyncedStoreClient API Reference

Full reference for the store client returned by `Poe.setupStore(...)`. For the typed wrapper, see `InferSyncedStoreClient<Schema>` in [api-patterns.md](api-patterns.md).

## Typed Client

```typescript
import type { InferSyncedStoreClient } from "poe-tiles-sdk/v1/client.js";
import type { TodoSchema } from "./schema";

export type TodoStoreClient = InferSyncedStoreClient<TodoSchema>;
// Gives you typed: store.mutate.setTodo, store.subscribe, store.action.generateWithAI, etc.
```

## Reading Data

### `query(fn)` — One-time read

```typescript
const todo = await store.query((ctx) => ctx.table("todos").get("todo-1"));
```

### `subscribe(queryFn, callback)` — Reactive updates

The callback fires once with the current result, then whenever an exact key or
scan prefix read through `ctx` changes. Reads from values captured outside
`ctx` are not storage dependencies. After changing a captured value that affects
the query, call `subscription.refresh()` to re-run the query and replace its
tracked dependencies.

The return value is a `SubscriptionControl`: call it as a function to
unsubscribe, or call `refresh(): Promise<void>` to refresh the result and its
dependencies.

```typescript
let selectedListId = "inbox";
const subscription = store.subscribe(
  (ctx) => ctx.table("todos").scan({ prefix: { itemKey: `${selectedListId}/` } }).values().toArray(),
  (todos) => renderTodoList(todos),
);

selectedListId = "today";
await subscription.refresh();
subscription(); // unsubscribe during cleanup
```

### Scanning table rows

**Signature:** `table.scan(options?: ScanOptions): ScanResult<T>`

Available on table handles such as `ctx.table("todos")` in queries,
subscriptions, mutators, actions, and migrations. `T` is the table's row value
type. Rows are ordered by `(sortKey, itemKey)`; an omitted sort key is treated
as `""`.

All options are optional:

| Option | Type and behavior |
| --- | --- |
| `prefix` | `{ sortKey?: string; itemKey?: string }`. Match the supplied key prefixes; when both are supplied, both must match. |
| `exactSortKey` | `string`. Match one complete sort key; `""` matches only rows with an empty sort key. Cannot be combined with `prefix.sortKey`. |
| `cursor` | An `EntryKey` (`{ itemKey: string; sortKey?: string }`), `"$first"`, or `"$last"`. Start strictly past this position in the scan direction, or use it as the anchor for `aroundCursor`. |
| `limit` | `number`. Return at most this many rows. Without it, there is no result-count bound unless `aroundCursor` is used. Cannot be combined with `aroundCursor`. |
| `reverse` | `boolean`, default `false`. Return rows in descending `(sortKey, itemKey)` order. |
| `aroundCursor` | `{ before: number; after: number }`. Return up to `before` rows before the cursor, the cursor row if present, and up to `after` rows after it. Requires `cursor`; both counts must be non-negative. Client-only: server-side scans reject this option. |

`scan()` returns an async iterator immediately; do not await the call itself.
Choose the view you need:

| Result view | Each iteration yields |
| --- | --- |
| `scan` itself or `scan.values()` | A row value of type `T` |
| `scan.entries()` | An `[EntryKey, T]` pair |
| `scan.keys()` | An `EntryKey` |

Consume a view with `for await`. On the server, iteration reads bounded pages.
Every view also has `.toArray()`, which returns a promise for an array of all
**remaining** results and retains them in memory. Use it for explicitly limited
pages or bounded collections. For streaming row updates, see the
[migration example](architecture-scaling-and-performance.md#store-size-and-row-operations).

```typescript
const scan = ctx.table("todos").scan({ limit: 50 });
const rows = await scan.entries().toArray(); // Array<[EntryKey, Todo]>
```

For ordering and pagination examples, see
[scanning ordered data](sort-keys.md#scanning-ordered-data).

## Writing Data

### `mutate` — Optimistic mutations

```typescript
const { id, confirmed } = await store.mutate.setTodo({ id: "abc", text: "Buy milk" });
await confirmed; // optionally wait for server
```

The result may also include `identity: { clientId, id }` (`MutationIdentity`, exported by `poe-tiles-sdk/v1/client.js`). This identifies the originating mutation within its store. `confirmed` means the mutation was processed, including rejection; it does not prove that the requested data was accepted.

#### `pendingMutationDedupeKey` — collapse repeated pending mutations

Pass `{ pendingMutationDedupeKey }` as the second argument to collapse a run of the same mutation that is waiting to be pushed:

```typescript
await store.mutate.setPosition(
  { playerId, x, y },
  { pendingMutationDedupeKey: `player-position:${playerId}` },
);
```

**Use a dedupe key when a mutation only needs to run once per batch, so its first and last positions are enough.** Two kinds of mutation fit:

- **Last-value-wins setters**, where intermediate values do not matter: cursor, hover, selection, passive position, drafts.
- **Idempotent catch-up mutations** that recompute state from their input, such as a periodic `tick`, `sync`, or `refresh` that takes `now`. Running the latest one does everything the skipped ones would have done.

What happens to same-key mutations:

- **Every call applies optimistically.** The UI sees each value as it is made.
- **Only the first and the latest queued mutations are sent.** When a third same-key mutation joins the push queue, the ones between the first and the latest are dropped. This happens whenever mutations queue up: offline, while an earlier push is in flight, or when pending mutations are restored from local storage after a reload. With two or fewer queued, nothing is dropped.
- **A mutation in an in-flight push is not dropped.** If that push fails or times out before it is confirmed, its mutations rejoin the queue and can be dropped there, even though the server may already have run them.
- **A dropped mutation is not sent again.** One dropped before it was ever sent never runs on the server; one dropped after a failed push may already have run once. Either way its `confirmed` still resolves, and its optimistic writes are rolled back. This is why a dedupe key belongs only on mutations whose effect does not depend on how many copies run.
- **Keys are compared per store, and only against each other.** Mutations without a key, or with a different key, stay in place and in order between the kept ones.
- Keys are at most 256 UTF-8 bytes (see [limitations](limitations.md)).

Without a key, every queued copy reaches the server and runs. A client that falls behind (offline, a slow connection, a backgrounded tab) replays all of them in order when it reconnects. The backlog drains in consecutive pushes of at most 400 mutations each, or fewer when the push byte budget fills first. For a mutation fired on a timer, a key is the difference between two runs and thousands.

Do not use a dedupe key for mutations where each call is a distinct event the server must observe: append, send, counter, toggle, purchase. Also do not use it when a later pending mutation depends on an intermediate same-key write having happened.

### `action` — Server-side actions

Waits for pending mutations to flush first, then calls the server.

```typescript
const result = await store.action.generateWithAI({ id: "abc", prompt: "dinner ideas" });
```

## Connection & State

| Property / Method | Returns |
|-------------------|---------|
| `state` | `'initializing'` \| `'ended'` |
| `connectionStatus` | `'connecting'` \| `'connected'` \| `'disconnected'` |
| `isOnline` | `boolean` |
| `isBootstrapped` | `boolean` (authoritative data ready to render) |
| `hasServerData` | `boolean` (first server-origin data event arrived this session) |
| `isEnded()` | `boolean` |
| `endReason` | `'kicked'` \| `'auth_failed'` \| `'application'` \| `null` |

## Waiting for Data

None of these are required — queries and mutations work immediately.

| Method | Resolves when |
|--------|--------------|
| `waitForLocalData()` | Device storage loaded |
| `waitForServerData()` | First server-origin data event arrives (which may precede pull completion) |
| `waitForInitialPull()` | Initial server pull is fully applied |
| `waitForBootstrap()` | Authoritative data is ready to render (either source) |

## Manual Refresh

`await store.pullOrThrow()` requests fresh server data and resolves after it
commits and reaches the client. It rejects on host/server failure, disposal, or
a 30-second deadline that includes offline time. Shared background sync
continues after the deadline. `store.pull()` remains best effort; its resolution
does not establish a successful refresh. Queries still include optimistic
mutations, so a verified pull does not prove that a pending edit was accepted.

A local-read store connection in one iframe allows at most 1,000
outstanding verified pull requests. Requests awaiting a host reply and successful
replies waiting for local pagination both count; requests from other iframes do
not. An excess request rejects immediately, before forwarding to the host.
Capacity is released when a reply is delivered or rejected, 30 seconds after
the request's first dispatch, or when the local reader is retired or disposed.
Replaying the same request does not count twice or restart its deadline.

Required use of `pullOrThrow()` or the named `VerifiedPullUnsupportedError`
export from `poe-tiles-sdk/v1/client.js` requires
`poeTile({ minSdkVersion: 46 })`. An older host's unverified acknowledgment
rejects with that error. Optional method detection can protect a call on an
older SDK, but cannot protect a missing static named import.

## IDs

```typescript
const ordinal = await store.getClientOrdinal(); // Sequential: 0, 1, 2...
const id = await store.makeUniqueId();          // Sortable: "5-61"
```

## Pending Mutations

Use these APIs when tile behavior depends on server confirmation. Routine sync happens in the background and does not need a visible status indicator.

```typescript
const pending = await store.getPendingMutations();
const count = store.getPendingCount();
await store.waitForSync(); // Wait for all pending to confirm
```

`store.onPendingMutationsChanged(fn)` subscribes to pending-queue changes when tile logic needs them.

## Subscriptions

```typescript
store.subscribeToConnectionStatus((status) => { /* ... */ });
store.onOnlineChanged((isOnline) => { /* ... */ });
store.subscribeToTable("todos", (entries, changes, ctx) => {
  // ctx.userId — current user ID
  // First callback: all entries appear in changes.added (compared against empty)
  // Subsequent: changes.added, changes.modified, changes.removed are deltas
});
store.subscribeToScanEntries("user:", (entries, changes) => { /* ... */ });
```

`subscribe()` and `subscribeToTable()` return a `SubscriptionControl`. Calling
it unsubscribes; `await subscription.refresh()` re-runs the query and replaces
its tracked storage dependencies. Lifecycle and event subscription methods
return plain unsubscribe functions.

## Error & Lifecycle Events

```typescript
store.onFailedMutation((info) => {
  console.error(`${info.mutation.name} failed:`, info.error.message);
});
store.onBackgroundError((error) => {
  const message =
    error.kind === "failed_mutation" ? error.info.error.message : error.message;
  showToast(message);
});
store.onKicked((reason) => { /* duplicate clientId or admin action */ });
store.onAuthFailed((reason) => { /* expired token */ });
store.onDisposed(() => { /* cleanup */ });
```

`onFailedMutation` callbacks may include the same optional `info.identity`. Register the listener before starting a write and buffer early callbacks until the mutation result supplies its identity. Compare both fields within the originating store/session. A new `mutate` call, even with identical input, has a different identity; transport replay keeps the original identity. Older runtimes can omit this metadata, so a missing identity leaves the failure uncorrelated. Neither an error's absence nor identity matching proves authoritative acceptance.

## Store diagnostics

`getDiagnostics()` returns the authoritative live-data usage after the caller
passes the store's normal authorization policy:

```typescript
const diagnostics = await store.getDiagnostics();
// {
//   liveDataSize: number,
//   maxLiveDataSize: number,
//   unit: "logical_size_units"
// }
```

The unit is UTF-8 bytes, following the formula documented in
[limitations.md](limitations.md#live-data-quota); it is not SQLite
file size. A legacy store awaiting the platform backfill
rejects with `live_data_size_not_initialized` rather than returning an inexact
number; retry after the backfill reaches that store.

## Cleanup

```typescript
store.dispose(); // Closes WebSocket, clears timers. Not reversible.
```
