# Data Visibility Tiers

Synced-store enforces visibility at the server API boundary via key prefixes. Every table belongs to exactly one tier — pick it before you design the schema, not after.

## The Three Tiers

- **Public** (default) — `ctx.table(name)` — synced to every user in the app instance.
- **Per-user private** — `ctx.privateOfUser(userId).table(name)` — synced only to that user. Write one copy per recipient.
- **Server-only** — `ctx.serverOnly().table(name)` — never synced to any client; only server-side mutators/actions read it. Expose derived results via actions.

## When to Reach for Non-Public Tiers

**Role-restricted state** — spymaster's color key in Spy Words, dealer's deck in a card game, judge's secret prompt. Use `privateOfUser(roleHolderId)` and write a copy per role-holder when roles are assigned.

**Server-evaluated secrets** — answer keys, RNG seeds, scoring weights, unrevealed puzzle solutions. Use `serverOnly()` and expose results through [actions](actions.md).

**Per-user private state** — draft notes, private preferences, unread markers, unshared progress. Use `privateOfUser(userId)`.

## Red Flag

If you're proposing client-side filtering, client-side encryption, or gating every read through an action just to hide data — you want `privateOfUser` or `serverOnly` instead. The platform already solves this at the API boundary.

## Which of your code players can read

The tiers above hide **data**. They do not hide **code**. Players can read
everything in the client bundle, and the client bundle is served to anyone
holding its URL without signing in. Assume the following is public:

| Your code | Shipped to players? | Why |
|---|---|---|
| Client HTML / JS / CSS | **Yes** | It is the client bundle |
| Mutator handlers | **Yes** | Mutators run optimistically in the browser, so `client-config.ts` bundles them |
| Hook handlers | **Yes** | Hooks are wired into `client-config.ts` too |
| Table names with full field schemas, and mutator/action names with their descriptions and input schemas (plus action output schemas) | **Yes** | The schema endpoint returns them (no handler source), so a field named `correctAnswerHash` or a description saying "checks the hidden answer" is player-readable |
| Action handlers | **No** | Actions belong only in `backend-config.ts`, which is packed into a separate backend artifact that no route serves. `defineClientConfig` also accepts an `actions` key; never use it. Handlers passed there never run and are bundled into the public client bundle |
| The compiled backend artifact (handler code, `backend-config.ts`) | **No** | Never served; only the schema's names and shapes are, per the row above |
| `serverOnly()` rows, other users' `privateOfUser` rows | **No** | Sync-protocol tiers |

Consequences:

- A rule you want players unable to see (an answer check, a scoring weight, a hidden win condition) belongs in an **action**, or in a mutator behind `if (ctx.isServer)` reading `serverOnly()` data. A mutator that computes the secret on both sides has already shipped it.
- A prompt you want kept out of the client belongs in an action that calls the platform model proxy.
- There is no per-app secret store. Never put an API key or credential in a mutator, hook, or client file; those are world-readable. An action in `backend-config.ts` is the only place a key is protected from players, and even then it is exposed if you publish your source with `visibility: "public"` (the default) or pass the action to `defineClientConfig`. Prefer the platform model proxy, which needs no key of your own.
- Publishing source is a separate decision from all of the above. `sourceBundle.visibility` in `.poe-tile.json` controls whether anyone can download or remix your source; the field is required whenever the `sourceBundle` block is present, and the scaffold sets it to `"public"`. Set `"owner_only"` and republish to make your source private. Deleting the block only skips uploading new source. It does **not** retract source you already published; the previous bundle and its visibility remain in effect and downloadable. This affects the source archive only; the client bundle is public regardless.

## Method Access Matrix

| Method | Client | Server |
|--------|--------|--------|
| `ctx.table(name)` | Read/write **(public rows only)** | Read/write **(public rows only)** |
| `ctx.privateOfUser(ctx.userId)` | Read/write (own only) | Read/write |
| `ctx.privateOfUser(otherUserId)` | Throws | Read/write |
| `ctx.serverOnly()` | Throws | Read/write |

`ctx.table("name")` and `ctx.privateOfUser(userId).table("name")` are **separate namespaces** — even though they share a table name in the schema, the rows live under different storage prefixes (`{table}` vs `$$pu/{userId}/{table}`). Reading or writing one never touches the other.

`privateOfUser(userId)` requires a non-empty `userId` without `/`. It also rejects ids longer than 256 UTF-16 code units; every platform-issued member id — user or agent — fits under that ceiling.

## Read your own private rows

Writing private data via `ctx.privateOfUser(ctx.userId).table(...).set(...)` is the part most people remember. The mirror — that READING your own private rows ALSO needs `privateOfUser` — bites every time.

```typescript
// In a mutator handler — server fan-out to teammates' private stores
sendTeamChat: async (ctx, input) => {
  if (!ctx.isServer) return;
  const message = { id: input.id, userId: ctx.userId, text: input.text };
  for (const allyId of [ctx.userId, allyUserId]) {
    await ctx.privateOfUser(allyId).table("teamChat").set({
      itemKey: input.id,
      value: message,
    });
  }
},

// In the UI — to see your own teamChat row, you MUST go through privateOfUser
const { data: teamChatRaw } = createLiveQuery(
  () => store,
  () => (tx) => tx.privateOfUser(tx.userId).table("teamChat").entries().toArray(),
  //          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //          NOT tx.table("teamChat") — that namespace is empty
);

// Same in a one-shot query (e.g. tests)
const view = await store.query((tx) =>
  tx.privateOfUser(tx.userId).table("teamView").get("state"),
);
```

Reading another user's private rows is rejected on the client with a thrown error; only the server can do that. So in practice, every UI read of a private table goes through `tx.privateOfUser(tx.userId)`.

## Hooks can write app private rows

System hooks (`onInit`, `onAddUsersV2`, `onRemoveUser`, `onAnonymizeUser`, `onSetTitle`, `onGrantPermission`, `onRevokePermission`, `onAddTileInstanceToRoom`, `onChangeTileParent`, `onAddChildTile`, `onChildInstancesAdded`, `onRoomMemberInstanceMovedOut`) run inside a system mutator, but app-owned public tables, server-only tables, and private tables are still app data. A hook may write `ctx.privateOfUser(otherUserId).table(...)` on the server when the write is a durable per-user projection tied directly to the hook event. Hooks still must not write reserved system tables such as `$users` or `$$system` directly. `onInit` can read the current room topology from `await ctx.table("$$system").get("room")`; `ctx.userId` identifies the initiating user for user/external-store bootstraps. Use it for deterministic bootstrap rows, such as an initial activity message (`"{name} started the group"`). Child-room `onInit` also receives `parentRoomUsers`, a **read-only snapshot** of the parent room's active roster — use it to react to the parent roster (a fresh rootGroup genesis always has an empty `parentRoomUsers`), never to admit members. Membership is platform-owned: the host seats the launcher at genesis (both users when launched from a 2-person room, i.e. a DM), and everyone else joins through the host picker/invite flows. `onAddUsersV2` runs after the `$users` rows are written, so it can read `addedBy` and use each user's optional `addedBatchUserIds` for this operation’s ordered invitation group to auto-seat users or write membership activity such as `"{name} added {usernames...}"`. For user-initiated cross-user fan-out, prefer a regular mutator or an action enqueued with `ctx.enqueueAction(...)`.

Wire every hook into both `defineBackendConfig({ hooks })` and `defineClientConfig({ hooks })`. Client hook runs are optimistic seed data for fresh prepared stores, so they must be browser-safe: use public or current-user-readable data, avoid backend imports and platform calls, and guard server-only table/private-other-user writes behind `ctx.isServer`.
