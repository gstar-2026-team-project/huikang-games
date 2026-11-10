# Client API

The `poe-tiles-sdk/v1/client.js` module is the client-side JavaScript interface for apps running inside Joiner tile frames. It provides store initialization, data access, and bot interaction — all from your app's frontend code.

::: info Docs describe the latest SDK
This reference tracks the most recently published `poe-tiles-sdk` tarball. If a documented method doesn't exist in your app (TypeScript error, or `undefined` at runtime), your app's SDK pin is older than the docs — see [Upgrading an existing app's SDK](cli.md#upgrading-the-sdk-in-an-existing-app). Recently introduced APIs carry an *Added &lt;date&gt;* note so you can tell at a glance.
:::

```typescript
import { createPoe, PostMessageEnvironment, registerPoeTileElement } from "poe-tiles-sdk/v1/client.js";
```

## Native round results helpers

Added September 2026; requires SDK/kernel 31 or later.
`createNativeResults({ room, restart, onErrorChange, schedule? })` returns
`{ update(finishedRoundOrNull), dispose() }` and coordinates native result
presentation without owning game rules or styles. `completeRound(ctx, input)`
commits a full current-round board, clears turns, and sends completion effects
from an already-validated mutator. It is exported by both client and backend.
See [native results](native-results.md) for the API, runtime requirement, and
subscription/mutator examples. Applications can still use the lower-level APIs
below for custom behavior.

## Client APIs

- [`createNativeResults()`](#native-round-results-helpers) — Coordinate the native result lifecycle from live round snapshots
- [`completeRound()`](#native-round-results-helpers) — Commit round leaderboard, turn and notification effects in a mutator

- [`Poe.setupStore()`](#poe-setupstore) — Initialize a synced store
- [`Poe.store`](#poe-store) — Access the SyncedStoreClient after setup
- [AI model calls live in an action, not here](#ai-model-calls-live-in-an-action-not-here)
- [`Poe.listModels()`](#poe-listmodels) — List available Poe models
- [`Poe.getPoeBotAccess()`](#poe-getpoebotaccess) — Whether the user can make Poe-backed bot/agent calls
- [`Poe.requestPoeBotAccess()`](#poe-requestpoebotaccess-input) — Same check, but the platform prompts the user to fix a blocked verdict (inline Poe-account linking)
- [`Poe.getBundleAssetUrl()`](#poe-getbundleasseturl-path) — Get a blob URL for a bundled asset
- [`Poe.tiles.list()`](#poe-tiles-list) — List all published apps
- [`Poe.tiles.get()`](#poe-tiles-get-typeid) — Fetch one published app by typeId
- [`Poe.tiles.search()`](#poe-tiles-search-query-limit) — Search the public app catalog
- [`Poe.tiles.preload()`](#poe-tiles-preload-typeid-instanceid) — Preload an app's bundle for instant loading
- [`Poe.tiles.syncStatus()`](#poe-tiles-syncstatus-typeid-instanceid) — Creation-lifecycle sync status of an instance on this device (subscribable)
- [`Poe.open()`](#poe-open-typeid-instanceid-openprops-anchorsortkey-placement-viewwidth) — Navigate to a different app (or open it in split view alongside the caller)
- [`Poe.showTileLauncher()`](#poe-showtilelauncher) — Ask the host to show the standard tile launcher
- [`Poe.users.openProfile()`](#poe-users-openprofile-userid-username) — Open a user's profile UI in the host
- [`Poe.room.openInvitePicker()`](#poe-room-openinvitepicker) — Open the host Add members invite surface for the calling app instance
- [`Poe.room.openChat()`](#poe-room-openchat) — Reveal the containing room's chat in the host-native surface
- [`Poe.room.pickMembers()`](#poe-room-pickmembers) — Pick room members, optionally adding contacts to the room first
- [`Poe.room.tileEnd()`](#poe-room-tileend-input) — Show the host end-of-tile UI and optionally replay
- [`Poe.room.setShareLeaderboardId()`](#poe-room-setshareleaderboardid-leaderboardid) — Make current-page share links point at a tile-owned leaderboard
- [`Poe.room.dismissTileEnd()`](#poe-room-dismisstileend-opts) — Programmatically dismiss this client's tile-end overlay (shared-instance team games)
- [`Poe.agents.create()`](#poe-agents-create-agentid-name-model-tools-room) — Create an agent owned by the calling user, optionally adding it to a room
- [`Poe.agents.delete()`](#poe-agents-delete-agentid) — Delete one of your agents outright (irreversible)
- [`Poe.agents.addToRoom()` / `Poe.agents.removeFromRoom()`](#poe-agents-addtoroom-agentid-typeid-instanceid-poe-agents-removefromroom-agentid-typeid-instanceid) — Add/remove an existing agent as a room member
- [`Poe.agents.listTools()`](#poe-agents-listtools) — List the first-party agent system-tool catalog
- [`Poe.agents.listTemplates()`](#poe-agents-listtemplates) — List the first-party agent-template catalog
- [`Poe.agents.listMine()`](#poe-agents-listmine) — List your own live agents
- [`Poe.track()`](#poe-track-event-properties) — Send a privacy-filtered analytics event
- [`Poe.openExternalUrl()`](#poe-openexternalurl-url) — Open a web link via the host (platform links navigate in place; other links need user confirmation)
- [`Poe.openSettings()`](#poe-opensettings-section) — Ask the host to open its Settings page
- [`<poe-tile>`](#poe-tile-custom-element) — Embed a child app inline
- [`Poe.getOpenProps()`](#poe-getopenprops) — Read data passed by a parent app
- [`Poe.consumeEntryContext()`](#poe-consumeentrycontext) — Read how the user reached the tile (push/banner/badge/direct) + the notification's entry context
- [`Poe.parent`](#poe-parent) — Parent store identity (for child apps)
- [`Poe.topOrigin`](#poe-toporigin) — Origin of the top (host) document, for building absolute URLs from sandboxed iframes
- [`Poe.interfaceLanguages`](#poe-interfacelanguages) — The host's interface languages, preferred over `navigator.languages` when localizing a tile
- [`Poe.haptics`](#poe-haptics) — Trigger cross-platform haptic feedback
- [`Poe.motion.claim()`](#device-motion) — Tell the host this tile uses device motion as input, so shake-to-report stands down
- [`resumeAudioContext()`](#resumeaudiocontext) — Recover Web Audio after browser or iOS system-audio interruptions
- [`createVerticalScrollBounceMount()`](#createverticalscrollbouncemount) — Create a root render target with native vertical pull bounce
- [`installVerticalScrollBounce()`](#installverticalscrollbounce) — Add native vertical pull bounce to a custom scroll area
- [`isIosApp()`](#isiosapp) — Detect the iOS app WebView, including app iframes
- [`isAndroidApp()`](#isandroidapp) — Detect the Android app WebView, including app iframes
- [`notifyActivity()`](#notifyactivity) — Notify the manager of activity (preview, unread)
- [`setTurn()` / `clearTurn()`](#setturn-clearturn) — Declare whose turn it is (the "Your Turn" indicator)
- [`notifyInProgress()`](#notifyinprogress) — Report long-running work (the Recents-row spinner)
- [`assertRoomMember()`](#assertroommember) — Server-side validation that a user is still in the caller's room
- [`notifyUsersAddedToTile()`](#notifyusersaddedtotile) — Standard room-aware "added/assigned to this tile" notification
- [`addInstanceToRoom()`](#addinstancetoroom) — Register an app instance as a member of a flat room
- [`getCurrentUserId()`](#getcurrentuserid) — Read the current user's userId from a store (UI/effect helper)

::: warning Poe Employee Note
Currently the platform injects an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap) into the app's `index.html` at serve time, which is what makes `import { createPoe } from "poe-tiles-sdk/v1/client.js"` work without a bundler. In the future we'll probably want creators to include a script tag instead (e.g. `<script src="https://poe.com/v1/poe-tiles-sdk.js"></script>`) so the mechanism is more explicit and doesn't require server-side HTML rewriting.
:::

## Background

Apps run inside sandboxed iframes. To ensure apps load even when offline, app bundles are not fetched over HTTP at runtime. Instead, the top document caches all bundle assets and serves them to the iframe via `postMessage`. This is why APIs like [`Poe.getBundleAssetUrl()`](#poe-getbundleasseturl-path) exist — they request assets from the top document's cache and return blob URLs, rather than making network requests.

## Initialization

Every app must explicitly create a Poe instance before using any APIs. This happens once, in your app's **entry file** — `tile/src/entry.ts` (or `entry.tsx`) in the official templates, whose header comment reads "the only file that imports poe-tiles-sdk":

```javascript
import { createPoe, PostMessageEnvironment, registerPoeTileElement } from "poe-tiles-sdk/v1/client.js";

const environment = new PostMessageEnvironment();
const Poe = createPoe({ environment });

// Only needed if your app uses <poe-tile> to embed other apps
registerPoeTileElement(environment);
```

`createPoe()` returns the Poe API object and automatically registers it as the module-level singleton, so code-split chunks can access it. Pass `{ singleton: false }` to disable this (useful in tests).

### Reaching `Poe` from the rest of your app

Every `Poe.*` example in this reference assumes a `Poe` in scope. `Poe` is **not** a global variable — nothing outside the entry file gets one implicitly. Keep the entry file the only module that imports the SDK, and hand what you need to the rest of your app:

- **Pass the whole object** when a module uses several APIs.
- **Pass one capability** when it uses one — give a board component `Poe.haptics` rather than all of `Poe`. Narrower to stub in tests.

Types come from the same entry point, so a receiving module can be typed without importing any runtime SDK code:

```typescript
import type { PoeAPI } from "poe-tiles-sdk/v1/client.js";

// The whole API…
function createBoard(poe: PoeAPI) {
  poe.haptics.impact("light");
}

// …or a single capability.
function createScoreboard(haptics: PoeAPI["haptics"]) {
  haptics.notification("success");
}
```

How you thread it through is your framework's business — a function argument, a component prop, a context or store object, or a module-level variable you assign at startup. The templates already do exactly this with the synced store (`createApp(appRoot, store)` in the plain-JS template, `<App store={store} />` in the component ones); extend that same call with whatever else the app needs:

```javascript
// entry file
const Poe = createPoe({ environment });
const store = Poe.setupStore(myClientConfig);

createApp(appRoot, store, Poe.haptics); // or <App store={store} haptics={Poe.haptics} />
```

For a module that genuinely cannot be handed the instance — a lazily imported chunk, say — call `getPoeInstance()` from `poe-tiles-sdk/v1/client.js`. It returns the singleton that `createPoe()` registered, and throws if `createPoe()` hasn't run yet. Prefer passing the value explicitly where you can; it keeps the dependency visible and the module testable.

## Core APIs

### `Poe.setupStore()`

Initialize a synced store inside your app.

```javascript
async function addTodo(ctx, input) {
  await ctx
    .table("todos")
    .set({ itemKey: input.id, value: { text: input.text, done: false } });
}

const store = Poe.setupStore({ mutators: { addTodo }, schemaVersion: 1 });
await store.waitForBootstrap();
// render UI
```

`await store.waitForBootstrap()` before rendering UI. It resolves as soon as authoritative data is ready from *either* local cache or first server pull, so offline-capable launches (cached instance, or a fresh instance declared via `Poe.tiles.prepareNewInstances`) unblock immediately. Don't wait for a server milestone here — doing so stalls offline launches and brand-new prepared instances that have no server state to fetch. Reserve `waitForServerData()` for the first server-origin data event, or `waitForInitialPull()` for the point when the full initial pull has been applied, in specialized tests and Node-side scripts.

Store background errors have a built-in notice with contextual guidance, the visible diagnostic, **Copy error**, and **Dismiss notification**. Copying does not retry a change or reload the tile. If clipboard access is unavailable, select the diagnostic to copy it manually. Check the tile before repeating a failed action. Apps that provide their own background-error UI can disable the generic notice with `backgroundErrorToast: false` in the setup options; reporting and background-error listeners still run.

### `Poe.store`

A [`SyncedStoreClient`](../../synced-store/references/client-api-reference.md) reference. Available after calling `setupStore()`.

### AI model calls live in an action, not here

There is no client-side model API. A tile reaches a model only from a
synced-store **action** — see [`createModelStream` / `createImageGenerator`](backend-api.md#calling-a-model-from-an-action).
That is not a detour: it keeps your prompts out of the shipped client bundle,
lets every player in a room see the same result, and means a tile can never hold
or forward a Poe credential.

What stays on the client is deciding *whether* and *which*:
[`Poe.listModels()`](#poe-listmodels) to pick a model and
[`Poe.requestPoeBotAccess()`](#poe-requestpoebotaccess-input) to make sure the user
can pay for the call — then dispatch your action.

```javascript
const model = pickModel(await Poe.listModels());
if (!(await Poe.requestPoeBotAccess()).canUse) return;
const { text } = await Poe.store.action.askModel({ model, prompt });
```

### `Poe.listModels()`

List all available Poe models. Returns an array of `Model` objects with metadata like `id`, `description`, `owned_by`, `architecture`, `pricing`, and `context_window`.

```javascript
const models = await Poe.listModels();
console.log(models.map(m => m.id)); // ["anthropic/claude-opus-5", "openai/gpt-5.6-sol", ...] — model roots, `lab/model`
```

Use this to discover a model to pass to your model-calling action, or to build a model picker UI. `id` is the model's identity, its root (`lab/model`, e.g. `anthropic/claude-opus-5`); the same value also rides as `root`, an open field on the current `Model` type, so in TypeScript narrow it (`typeof m.root === "string"`) rather than assigning it straight to a `string`. Pass the id to `createModelStream` / `createImageGenerator`, match models on `id` or on `owned_by` (the lab), and never parse the id into segments to decide the lab. Each model appears once, however many providers serve it.

The array order is the product's current model ranking (the first entry is Poe's default model), not a stable contract: it changes as the ranking changes. Sort client-side if your tile needs a fixed order.

### `Poe.getPoeBotAccess()`

Check whether the current user can make Poe-backed bot/agent calls right now, and if not, why. Returns a discriminated union — `{ canUse: true }` or `{ canUse: false; reason }` — so `reason` is present exactly when access is blocked. Only the verdict, never the user's Poe API key.

```javascript
const access = await Poe.getPoeBotAccess();
if (!access.canUse) {
  // access.reason is one of:
  //   "poe_link_required"            — no Poe account linked
  //   "poe_relink_required"          — the link expired; reconnect
  //   "poe_pay_with_points_required" — linked, but Poe points aren't enabled
  //   "poe_bot_backend_unavailable"  — Poe-backed bots are unavailable here
  // Guide the user to fix it (e.g. open settings) instead of letting the call fail.
}
```

Poe-backed bot/agent calls need a usable Poe account. Use this to gate those features up front — and surface the specific `reason` — instead of letting the call fail server-side. For the version that also prompts the user to fix a blocked verdict, use `Poe.requestPoeBotAccess()` below.

### `Poe.requestPoeBotAccess(input?)`

*Added 2026-07-22 — [upgrade your SDK](cli.md#upgrading-the-sdk-in-an-existing-app) if your pin predates this. The `message` option was added later the same day.*

Like `getPoeBotAccess()`, but when access is blocked the **platform prompts the user to fix it** — a host-owned modal with the reason-specific copy and inline Poe-account linking. Pasting an API key completes without leaving your tile (the promise resolves `{ canUse: true }`, so you can continue the bot call in the same gesture); the "Sign in to Poe" path is a full-page redirect that returns to the current page, so re-run your preflight on mount. Dismissal resolves `{ canUse: false, reason }`.

The prompt's body names your tile ("Word Duel needs a linked Poe account to use AI."). Pass `input.message` — one short sentence on why your tile wants bot access — and the prompt also shows it as a quote attributed to your tile:

```javascript
async function askAi(model, prompt) {
  const access = await Poe.requestPoeBotAccess({
    message: "The AI opponent uses Poe to pick its moves.",
  });
  if (!access.canUse) return null; // user declined — keep the feature visible, disabled

  // The model round itself runs in an action — see backend-api.md.
  const { text } = await Poe.store.action.askModel({ model, prompt });
  return text;
}
```

`message` is plain text, at most 200 characters (newlines and control characters collapse to spaces); a longer message rejects. It appears only for the link/reconnect prompts — the "enable points" and "AI unavailable" variants stay fully platform-worded. The platform title and connect controls are never replaced.

Prefer this over hand-rolling a "link your Poe account" prompt. Use `getPoeBotAccess()` when you only want to *silently* adapt UI (e.g. render a hint) without ever popping the platform modal.

If you skip the preflight, the model round inside your action fails server-side with an unlinked-account error instead — which reads as a cryptic failure to the player. Preflight, then dispatch.

### `Poe.getBundleAssetUrl(path)`

Get a URL for a static file from the app's bundle. Returns a blob URL that works both online and offline — the asset is fetched via the parent frame's cache, so it's available even when there's no network connection.

This is how apps reference uploaded assets (images, JSON data, additional JS modules, etc.) in a way that works inside the sandboxed iframe environment.

```javascript
// Load an image from the bundle
const url = await Poe.getBundleAssetUrl("assets/hero.png");
document.querySelector("img").src = url;

// Fetch a JSON data file from the bundle
const url = await Poe.getBundleAssetUrl("data/levels.json");
const levels = await fetch(url).then(r => r.json());

// Load a JS file from the bundle
const url = await Poe.getBundleAssetUrl("my-module.js");
const code = await fetch(url).then(r => r.text());
```

**Path formats:** Bare paths (`assets/hero.png`), leading slash (`/assets/hero.png`), and relative paths (`./assets/hero.png`) all work.

**Caching:** Repeated calls for the same path return the same blob URL without refetching.

**Fetching bytes and media:** `fetch()` and media elements (`<audio>`, `<video>`) accept this `blob:` URL. They do not accept the `data:` URL that a Vite `?url` import inlines: the tile frame's CSP `connect-src` and `media-src` allow `blob:` but not `data:`, so that fetch or playback fails in production. See [assets.md](./assets.md#static-asset--import-imgsvgurl).

### `Poe.tiles.list()`

List published apps with cursor pagination. Returns `{ tiles, nextCursor? }`, where `tiles` is an array of `Tile` objects with `id`, `handle`, `creator_id`, `creator_handle`, `created_at`, and `updated_at`.

```javascript
const page1 = await Poe.tiles.list({ limit: 20 });
console.log(page1.tiles.map(a => a.handle));

if (page1.nextCursor) {
  const page2 = await Poe.tiles.list({ cursor: page1.nextCursor, limit: 20 });
  console.log(page2.tiles.map(a => a.handle));
}
```

Use this to discover available apps or build an app directory UI.

**Parameters:**
- `limit` — max hits, 1..200 (defaults to 20 server-side)
- `cursor` — opaque cursor from the previous page
- `creatorHandle` — restrict results to a single creator

### `Poe.tiles.get({ typeId })`

Fetch one published app by typeId. Use this when you already have a persisted app reference and need display metadata; it avoids loading the full catalog.

```javascript
const app = await Poe.tiles.get({ typeId: "todo-list" });
console.log(app.handle);
```

**Parameters:**
- `typeId` — app type ID (`Tile.id`)

**Caching:** Each `typeId` is cached persistently in the host with a 5-minute stale time — cached tiles stay readable offline.

### `Poe.tiles.getByHandle({ creatorHandle, tileHandle })`

Resolve one published app by creator handle + app handle (detail-quality payload including `long_description` and `media`). Same caching and reactive affordances as `Poe.tiles.get`.

### Reactive reads: `Poe.query(ref)`

Cacheable reads (`Poe.tiles.get`, `Poe.tiles.getByHandle`, `Poe.tiles.list`) also expose `.query(input)` and `.key(input)` for reactive UI. Build a ref, then subscribe: the cached value arrives immediately (even offline), followed by a fresh snapshot when the host revalidates.

```javascript
const ref = Poe.tiles.get.query({ typeId: "todo-list" });
const unsubscribe = Poe.query(ref).subscribe((snapshot) => {
  render(snapshot.data, {
    isStale: snapshot.isStale,
    isRevalidating: snapshot.isRevalidating,
    error: snapshot.error,
  });
});
```

The controller also offers `read()` (one snapshot, never fetches), `watch()` (`for await` sugar over the same stream), and `refetch()` (force a network fetch). SolidJS apps can use `createPoeQuery` from `poe-tiles-sdk/v1/solid` instead of hand-wiring `subscribe`.

Per-call cache overrides ride the second argument of the imperative call: `Poe.tiles.get({ typeId }, { cache: { behavior: "cache-only" } })`. Behaviors: `stale-while-revalidate` (default), `cache-first`, `network-only`, `cache-only` (throws on a cache miss instead of fetching).

### `Poe.tiles.search({ query, limit? })`

Full-text search the public app catalog by handle / creator handle. Returns full `Tile` records — same shape as `Poe.tiles.list()` — so you can render avatars and descriptions without a second round-trip.

```javascript
const matches = await Poe.tiles.search({ query: "chess", limit: 10 });
console.log(matches.map((a) => a.handle));
```

**Parameters:**
- `query` — search string (1..500 chars after trim)
- `limit` — max hits, 1..50 (defaults to 20 server-side)

**Caching:** Each `(query, limit)` pair is cached in the host for 5 minutes, so debounced retypes of the same query are served from memory.

### `Poe.tiles.preload({ typeId, instanceId? })`

Preload an app's bundle so that a subsequent `<poe-tile type-id="...">` loads instantly. The top document fetches all bundle files and caches the self-contained HTML template in IndexedDB.

```javascript
// Preload an app you know the user is likely to open
await Poe.tiles.preload({ typeId: "my-game" });

// Preload with an instance ID (reserved for future use)
await Poe.tiles.preload({ typeId: "my-chat", instanceId: "room-42" });
```

### `Poe.tiles.syncStatus({ typeId, instanceId })`

Creation-lifecycle sync status of one tile instance **as known on this device**. Pure local read — never a network request — so it works offline and for instances that are not currently rendered.

Returns `{ status }` with one of three values (monotonic per device):

- `"unknown"` — no local record of the instance on this device. It may still exist server-side; a local client cannot know.
- `"local-only"` — created locally (e.g. offline via `Poe.tiles.prepareNewInstances` or an optimistic first mutation) but the server has not yet confirmed the instance exists. **This is normal offline operation that reconciles automatically on reconnect — never render it as an error.** Keep routine sync in the background; do not add a sync hint or badge by default.
- `"server-confirmed"` — the server has confirmed the instance (at least one server-verified commit landed on this device).

Pending mutations *after* creation do not change the status — this API tracks creation lifecycle only, not "are all my edits flushed" (use `store.getPendingMutations()` / `store.onPendingMutationsChanged` for that).

```javascript
const { status } = await Poe.tiles.syncStatus({
  typeId: "my-game",
  instanceId: "match-42",
});
```

When tile behavior depends on instance confirmation, subscribe through `Poe.query(Poe.tiles.syncStatus.query({ typeId, instanceId }))` (same reactive contract as `Poe.tiles.get.query`).

Snapshots stream as the status changes; consecutive snapshots may repeat a status, so compare `snapshot.data.status` before reacting. The direct call always recomputes from local storage, so it is never stale.

### `Poe.open({ typeId, instanceId, openProps?, anchorSortKey?, placement?, viewWidth? })`

Navigate the root app to a different app. This is how a sub-app requests the platform to switch to another app at the top level (as opposed to embedding it inline with `<poe-tile>`).

To open a store that has **never existed before**, first declare its genesis with [`Poe.tiles.prepareNewInstances`](#poe-tiles-preparenewinstances-instances) and await it — there is no `isNew` parameter on `Poe.open`.

```javascript
// Open another app, passing data via openProps
await Poe.open({
  typeId: "my-game",
  instanceId: "lobby-123",
  openProps: { inviteCode: "abc123" },
});

// Open a large synced-store app around a known sortKey.
await Poe.open({
  typeId: "chat",
  instanceId: "room-42",
  anchorSortKey: "msg/042",
  openProps: {
    openedSearchResult: {
      itemKey: "message-042",
      tableName: "messages",
      sortKey: "msg/042",
    },
  },
});

// Open the target alongside the caller in a split layout on desktop. On
// mobile, this falls through to a normal forward navigation, so the same
// call works on every form factor without branching in app code.
await Poe.open({
  typeId: "my-canvas",
  instanceId: "canvas-for-chat-42",
  placement: "splitView",
  viewWidth: "260px", // caller's pane width; opened app fills the remainder
});
```

The opened app reads the data via `Poe.getOpenProps()`. By default `Poe.open()` replaces the current view (the root app navigates to the target). Pass `placement: "splitView"` to ask the root to render the target alongside the caller; on roots that do not support split view, or on narrow viewports where there is no room for two panes, the hint is ignored and the call behaves like a normal navigation.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `typeId` | string | Yes | The app type ID to open |
| `instanceId` | string | Yes | Instance ID for the app's store |
| `openProps` | JSONValue | No | JSON-serializable data passed to the opened app (readable via `Poe.getOpenProps()`) |
| `anchorSortKey` | string | No | Sort key used by outward pull windows in the opened app. Use it with app-specific `openProps` when you need both store-level anchoring and UI-level context/highlighting. |
| `placement` | `"current" \| "splitView"` | No | `"current"` (default) replaces the root view. `"splitView"` opens the target alongside the caller on roots that support a split layout (e.g. the manager's two-column layout on desktop and tablets); phones in any orientation and other narrow / unsupported form factors ignore the hint and behave like `"current"`. |
| `splitViewFallback` | `"navigate" \| "none"` | No | What happens when a `"splitView"` placement cannot be honored (narrow viewport, nothing in the main pane to sit beside, a user-pinned side pane). `"navigate"` (default) falls back to a plain forward navigation — right for a user gesture, which should still land somewhere. `"none"` drops the open instead — the only safe choice for an open no user gesture caused (e.g. auto-docking a companion view when new data arrives), which must never yank the user off the surface they are looking at. The host also remembers when the user closes a `"none"`-opened pane and drops later automatic opens from the same caller until they deliberately reopen it or revisit the surface. Only meaningful with `placement: "splitView"`. |
| `paneWidth` | string | No | Width of the OPENED pane for automatic (`splitViewFallback: "none"`) opens, which dock as a fixed-width sidecar rather than a flex split. `px` lengths only (e.g. `"840px"` to fit two phone-width frames); other values fall back to the host's default sidecar width, and the host clamps against the viewport. Ignored for gesture splitView opens — size those with `viewWidth`. |
| `simulate` | boolean | No | With `placement: "splitView"` + `splitViewFallback: "none"`: ask the host to dock a MULTIPLAYER SIMULATION of `typeId` (side-by-side simulated players, created or reused by the host) instead of mounting `instanceId` — the useful companion for a tile that cannot be played alone. Creator-only: the host's server refuses simulations of tiles the caller did not author. |
| `contentKey` | string | No | With `placement: "splitView"` + `splitViewFallback: "none"`: an opaque identity for the CONTENT this automatic open shows (e.g. the id of the event that produced it). When a repeat open carries the SAME key as the pane the host already docked, the host may skip its refresh work and leave the running pane untouched — so re-sending your newest request after a remount doesn't blank a pane that is already current — while a new key still refreshes. Compared only, never rendered; the host drops oversized keys (≤128 chars) and then always refreshes. |
| `viewWidth` | string | No | CSS length in `px` or `%` controlling the *caller's* pane in the split layout (e.g. `"260px"`, `"30%"`). Other units (`rem`, `em`, `vw`, `calc(...)`, etc.) are rejected to keep the host-side parser tight; invalid values silently fall back to the default split. The opened app's pane takes the remaining space. Only meaningful with `placement: "splitView"`. Useful when the caller is a fixed-width picker/sidebar and wants the opened app to take the rest of the screen. |
| `room` | tagged union | No | Flat-room mode for the opened app. One of: `{ kind: "self" }` (opened app owns its own roster, standalone); `{ kind: "inherit" }` (opened app joins the caller's room — DEFAULT when omitted); `{ kind: "explicit", storeTypeId, instanceId }` (opened app joins an explicit room). See [`<poe-tile>` Attributes](#attributes) for the equivalent HTML form. |


Inside an iframe, the app reads its actual rendered size with `window.innerWidth` / `window.innerHeight` (and `ResizeObserver` for changes) — the `viewWidth` value is a hint for the host layout, not something the opened app needs to read directly.

### `Poe.tiles.prepareNewInstances({ instances })`

Declare `$bootstrapStore` genesis for one or more freshly-minted stores. **Await it BEFORE rendering the store (`<poe-tile>`) or `Poe.open`-ing it.** It only writes to durable per-instance client metadata (no network round-trip); the genesis actually runs when one of the stores is opened.

`instances` is an array of `BootstrapStoreSpec` entries for the whole gesture (the target plus any room/helper siblings). Each spec names `typeId`, `instanceId`, `room` (`self`, `rootGroup`, or `memberOf`, optional `parent`), an optimistic `PoeUserInfo[]` roster, and optional `roomMemberInstances`.

**Opening ANY one instance in the group creates ALL of them.** The opened store's session carries the persisted specs; the server resolves + validates the whole group's rosters and fans out `$bootstrapStore` genesis to every sibling (self-healing until all are pinned). You only need to open one.

Mint a fresh `instanceId` for each genesis. If an id can already name a store — you derive it from other values, or you prepare the same id again on a later open — pass `ensureExists: true`. The store still opens offline, but not as its creator: `store.isCreator` is false and `makeUniqueId()` waits for the first pull, so a second device never reuses the creator's unique-id namespace. Genesis still runs if the store is really new.

#### Creating a new room with seeded membership

Use `prepareNewInstances` to create a new instance in a NEW room whose membership is seeded from specs you supply — the "rematch" pattern. Mint a new instanceId yourself, declare the genesis, then open the instance with `room: { kind: "self" }` when it owns its own room. Build a `BootstrapStoreSpec` from your own `$users` / `$userInfo` tables (available offline):

```javascript
// Rematch: same players, fresh game, fresh room.
const roster = await Poe.store.query(async (tx) => {
  const members = await tx.table("$users").scan().values().toArray();
  const userInfo = new Map(
    (await tx.table("$userInfo").scan().values().toArray()).map((info) => [
      info.userId,
      info,
    ]),
  );
  return members
    // Drop removed members, and drop agent members (`agent_*`): the server
    // resolves every seeded id through the central user directory, which
    // agents are not in, so a listed agent is dropped from the new room. Re-add
    // agents through the normal flow once the rematch opens.
    .filter((m) => m.removedAt === undefined && !m.userId.startsWith("agent_"))
    .map((m) => userInfo.get(m.userId))
    .filter((info) => info !== undefined);
});
// Use the portable `generateUUID()` helper, not `crypto.randomUUID()` — the
// latter is unavailable on non-secure LAN / dev origins (common for local and
// mobile testing) and would throw before `Poe.open()` runs.
const newInstanceId = generateUUID();
const selfRef = { typeId: MY_TYPE_ID, instanceId: newInstanceId };
// 1. Declare genesis (writes durable client metadata only).
await Poe.tiles.prepareNewInstances({
  instances: [
    {
      ...selfRef,
      room: { type: "self" },
      users: roster,
      roomMemberInstances: [selfRef],
    },
  ],
});
// 2. Open the tile — this drives the genesis for the whole group.
await Poe.open({
  typeId: MY_TYPE_ID,
  instanceId: newInstanceId,
  room: { kind: "self" },
  openProps: { rematch: { players: roster.map((user) => user.userId) } },
});
```

Semantics and rules:

- Every fresh store opened by the gesture needs a matching spec in `instances`. If you create a separate chat/room store plus an app store, include both: the room spec usually uses `room: { type: "self" }`, and the app spec uses `room: { type: "memberOf", room: roomRef }`.
- The caller must be included in each spec's `users`, and every listed user must already be an active member of the caller's room or the parent room. This is a same-membership primitive, not an invite primitive — to add NEW people afterward, use `Poe.room.pickMembers()`.
- Validation happens server-side when the request arrives. The server re-resolves profile data from the canonical user source, validates membership, and drops invalid seed entries into the rejected-bootstrap table instead of trusting client-supplied display data.
- **Works offline**: the seed survives reloads and long offline sessions. The kernel stores pending bootstrap specs in durable local metadata and replays creator context for the browser that created the instance until the server has applied the bootstrap.
- **Discovery is app-level.** Seeding gives users *access*; it does not put the new room in their sidebar. Announce it from a mutator (e.g. `notifyActivity` / `setTurn`) after opening, and pass the roster's display data via `openProps` so your UI can render players before the first sync.

#### Auto-replace semantics for `placement: "splitView"`

The split-view (right) pane has an owner. A subsequent `placement: "splitView"` call replaces it only when:

- the pane is empty, or
- the current pane was opened by a previous `placement: "splitView"` call (center-owned).

A pane the user opened manually from the host's UI (e.g. a "pin to side" menu) is treated as user-pinned and is preserved — the new call falls back to a plain forward navigation in the caller's pane and the user-pinned side is left alone. A plain `Poe.open()` (default `placement: "current"`) likewise leaves a user-pinned side pane intact.

### `Poe.showTileLauncher()`

Ask the host manager to render the standard tile launcher. The host owns catalog browsing/search UI, mints the selected tile instance and child room ids, dispatches `recieveTileStarted` on the calling store, then opens the selected tile. Cancel resolves `null`.

```typescript
const result = await Poe.showTileLauncher();
if (result) {
  console.log("Started", result.tileTypeId, result.tileInstanceId);
}
```

The calling app must call `Poe.setupStore()` before using this API — the call resolves your store to identify the caller, and throws without one.

Implement a store mutator named `recieveTileStarted` (spelling intentional) to persist the launch in your app:

```typescript
type TileLauncherStartedInput = {
  itemKey: string;
  tileTypeId: string;
  tileInstanceId: string;
  room: { storeTypeId: string; instanceId: string };
  parentRoom?: { storeTypeId: string; instanceId: string };
  timestamp: number;
};
```

For chat-style launchers, use `room` as the newly-created child room and validate `parentRoom` against the current store before writing any launch rows.

### `Poe.users.openProfile({ userId, username? })`

Ask the host to open a user's profile UI, for example from "Forwarded from Alice" attribution in a chat message.

```javascript
await Poe.users.openProfile({
  userId: "u123",
  username: "alice",
});
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userId` | string | Yes | Stable user ID for the profile to open |
| `username` | string | No | Optional, tolerated hint only — the host resolves the profile from `userId`. The call never rejects on a missing `username`. Whether another user's profile can be opened is gated by the host's `viewOtherProfiles` capability (check `Poe.capabilities` before offering the affordance); the host drops an open it can't route. |

For an account you know only by its public handle (no user id — e.g. a model
lab from the model catalog's `owner.handle`), pass `{ handle }` instead; the
host navigates to its handle-resolving profile route:

```javascript
await Poe.users.openProfile({ handle: "anthropic" });
```

Prefer the `userId` form whenever you hold an id (roster rows, `$userInfo`):
handles are renameable, and the host resolves an id to the account's *current*
handle at open time.

This is a UI navigation request only. It does not grant access to private profile data or bypass host-side permissions.

### `Poe.room.openInvitePicker()`

Ask the host to open its Add members invite surface for the calling app instance. Takes no parameters — the host resolves the caller's identity from the trusted RPC context (the app cannot forge it). The host resolves the caller's canonical room, lets the user add contacts to that room, and keeps share/copy invite links targeted at the calling tile instance.

```javascript
await Poe.room.openInvitePicker();
```

The call resolves after the host accepts the request to show the surface; it does not return selected contacts, added members, or copied-link status. Calling from the root app is rejected — the root app owns the invite UI directly and does not need an RPC hop.

The Add members surface also leads with the host's "Who can join?" setting, where each member chooses who can join the session without an invite: their network, their contacts, or only invited people. It shows only where a change can succeed (not in a DM, a feedback thread, or a multiplayer sandbox). The `Poe.room.pickMembers()` picker shows the same setting (see below). There is no separate API for it, and the app cannot read its value.

### `Poe.room.openChat()`

Ask the host to reveal the chat for the calling tile's containing room. The method takes no parameters: the host derives the calling tile from trusted RPC context, resolves its canonical room, and opens chat in the layout-native surface (an accessory pane on wide manager layouts or a sheet on compact layouts). If that room chat is already visible, the request is a no-op that preserves its mounted state and scroll position. Calls from a tile that is not inside a chat room are ignored.

```javascript
await Poe.room.openChat();
```

Calling from the root app is rejected because the root already owns the chat surface.

### `Poe.room.pickMembers()`

Open the host's room member picker and return the selected room members. Existing room members are just selected. Child rooms show active parent-room users in a separate **People in parent room** section as existing room members unless the child has a live local `$users` row for that user (someone who left the child room stays pickable — the platform re-admits them on access). Contacts are shown by default; pass `addFromContacts: false` to restrict the picker to existing room members. Selecting a contact adds them to the room before returning them. If the calling app is in a `dm-*` room, selecting contacts moves the app to a 1:1 DM or a new group room as needed instead of adding people to the frozen DM membership.

```typescript
const result = await Poe.room.pickMembers({
  title: "Choose player",
  selection: { max: 1 },
  // `excludeUserIds` hides rows entirely — e.g. drop the current user, since a
  // "Sit here" affordance already covers seating yourself.
  excludeUserIds: [currentUserId].filter(Boolean),
  // Already-seated players stay visible but render as "Playing" and are not
  // selectable. Pass them as `playingUserIds`, NOT `excludeUserIds` — excluded
  // rows are filtered out before the "Playing" marker is applied, so seats put
  // in `excludeUserIds` would be hidden instead of shown as taken.
  playingUserIds: [game.whiteUserId, game.blackUserId].filter(Boolean),
});

const user = result?.users[0];
if (user) {
  await store.mutate.assignSeat({
    seatId: "black",
    userId: user.userId,
    notify: "default",
    now: Date.now(),
  });
}
```

Use `excludeUserIds` to hide users the app does not want selectable. Use `playingUserIds` to keep a room member visible but mark them as already `Playing`; those rows are not selectable. Contacts and the share/copy invite-link footer are both shown by default. Above the link, the picker shows the host's "Who can join?" setting for the session (the same one `Poe.room.openInvitePicker()` shows), so a player choosing opponents can also let their network or contacts join without an invite. Pass `addFromContacts: false` to restrict selection to existing room members, or `shareLink: false` to hide the link footer and the "Who can join?" setting.

The result is `null` when the user cancels. Otherwise it includes the resolved room ref plus user snapshots:

```typescript
type RoomPickMembersResult = {
  room: { storeTypeId: string; instanceId: string };
  users: Array<{
    userId: string;
    username: string;
    displayName: string;
    profilePicture: string;
    source: "existingRoomMember" | "addedContact";
    addedToRoom: boolean;
  }>;
};
```

Treat the result as UI input, not authority. Mutators that write app state for a picked user should call `assertRoomMember(ctx, { userId })` on the server-authoritative pass before committing the assignment.

### `Poe.room.tileEnd(input)`

Ask the host to show the standard end-of-tile UI for a persisted leaderboard. The host derives the calling tile instance from trusted RPC context, subscribes to `getLeaderboard(ctx, { leaderboardId })` in that instance's synced store, and hydrates profiles. Ranked entries render first; every other active human room member is appended without a score in room join order, while agents are excluded. Optimistic mutator writes appear immediately and confirmed updates remain live while the sheet is open.

Because the end sheet opens immediately, a game must not call `tileEnd()` in the same moment it detects a terminal result. First keep the playfield visible long enough to finish the decisive animation and explain why the player won or lost, then leave a readable beat before calling this API. See [game UX best practices](./game-ux-best-practices.md) for the terminal-reveal sequence.

Persist scores and presentation from a tile-defined mutator with `setLeaderboard(...)` or `setLeaderboardScore(...)`; `tileEnd()` carries only the board id plus optional actions/round behavior. Use the same `leaderboardId` for writes, `getLeaderboard(...)` reads, and this call. If your page shows a persistent leaderboard without opening tile-end, call [`Poe.room.setShareLeaderboardId()`](#poe-room-setshareleaderboardid-leaderboardid) instead.

Leaderboard scores are numeric: `setLeaderboard` accepts `players: Record<string, number>` or `everyone: number`, never `"WON"`, `"LOST"`, or `"TIE"`. Choose your tile's numeric scoring rules explicitly; the SDK does not convert outcomes into scores. To show an outcome label, use `setLeaderboardScore` with a numeric `score` and a separate `displayScore` (for example, `{ userId, score: 1, displayScore: "Won" }`). For a current-round result that can decrease, use `mode: "replace"`; the default `"merge"` keeps each user's best score.

```typescript
const result = await Poe.room.tileEnd({ leaderboardId: "default" });
if (result.playAgain) {
  await store.mutate.startRound({});
}
```

```typescript
await store.mutate.finishRun({
  score: finalScore,
});

await Poe.room.tileEnd({
  leaderboardId: "daily",
});
```

```typescript
type RoomTileEndInput = {
  leaderboardId: string;
  round?: string;
  dismissable?: boolean;
  actions?: {
    nudge?: boolean;
    playAgain?: boolean;
    review?: { label: string };
  };
};

type RoomTileEndResult = {
  // `true` only when `outcome === "playAgain"` (kept for back-compat).
  playAgain: boolean;
  // How the end UI settled:
  //  - "playAgain"  — user tapped Play Again
  //  - "review"     — user tapped your `actions.review` button (see below)
  //  - "closed"     — user dismissed otherwise (picked another tile, navigated away)
  //  - "dismissed"  — superseded programmatically via Poe.room.dismissTileEnd()
  outcome: "playAgain" | "review" | "closed" | "dismissed";
};
```

`dismissable` defaults to `true`: the overlay shows an on-frame close button (and
Escape dismisses) so the player can return to the tile. Pass `dismissable: false`
for a **terminal** tile-end where nothing behind the overlay is actionable — e.g. a
score-chase run that is already over — so a stray close can't strand the player on
a dead post-run screen. The overlay's own actions (Play Again, Try Next) and the
host chrome's back button remain the exits; programmatic closes and
`dismissTileEnd()` are unaffected.

`bestScore`, `label`, `unit`, and optional per-entry `displayScore` / `markdown`
come from the persisted leaderboard row. Labels are limited to 40 characters;
each unit form is limited to 20 characters. When provided, the label and both
unit forms must contain a non-whitespace character; blank or whitespace-only
values are rejected at the tile-end API boundary.

Each entry may also carry a `markdown` string (≤ 2048 chars), passed to
`setLeaderboardScore(ctx, { …, markdown })`. The host renders it — sanitized
(raw HTML stripped, then run through DOMPurify, images dropped), with single
newlines as line breaks — as a **detail column to the right** of that player's
name/score, so tall content (e.g. a Wordle-style attempt grid) uses horizontal
space instead of stacking below and inflating the row. It is display-only and
never affects ranking. Keep it compact and presentational (it is not a document
surface), and never put secrets or user-identifying URLs in it (it is shown to
every room member).

When a row has `markdown`, its `displayScore` moves under the player's name (on
the left). `displayScore` may be **multi-line** (rendered as stacked lines), so
you can show a primary score plus a secondary line — e.g. a guess count over a
streak:

```typescript
await setLeaderboardScore(ctx, {
  leaderboardId: "daily",
  userId: ctx.userId,
  score: guessCount,
  bestScore: "lowest",
  displayScore: `${guessCount}/6\n🔥 Streak ${streak}`, // stacked under the name
  markdown: "🟩⬜⬜🟨⬜\n🟩🟩⬜⬜⬜\n🟩🟩🟩🟩🟩", // grid, to the right
});
```

### Where a board is stored: `sortKey`

Board rows are stored **always-loaded** by default, which means every board your
app writes is delivered on every pull. That is what makes `getLeaderboard(ctx,
{ leaderboardId })` safe to call from any surface at any time, so most apps
should leave it alone.

Pass a `sortKey` only when you deliberately want boards **paged in** — a store
with many boards, or boards large enough that shipping them all on every pull is
the wrong trade — and add a `pullWindows` entry to your schema that covers the
keys you pick:

```typescript
await setLeaderboardScore(ctx, {
  leaderboardId: `season-${seasonId}`,
  sortKey: `boards/${seasonId}`, // paged in by a "boards" pull window
  userId: ctx.userId,
  score,
});
```

Two rules if you do. Keep the `sortKey` **stable per board** — it is the row's
storage position, so changing it moves the row and every write would re-key it.
And make sure any board a surface can open is inside a window that reaches it:
a board outside the delivered window reads as an **empty board**, not as
"still loading", and synced-store does not backfill a row that fell past the
window's byte budget on a later pull. Only *windowed* reads are sortKey-sensitive
this way — `getLeaderboard(...)` from a mounted store. Share links are not: the
invite page reads the board by exact `(table, id)` identity, so a link minted
with `Poe.room.setShareLeaderboardId` resolves a paged board fine. If you are not
sure you need this, you do not — omit `sortKey`.

`actions.playAgain: false` hides the Play again button for tiles with no
meaningful replay (a daily puzzle, a one-shot). `actions.review` adds a
tile-owned review button (label required, ≤ 40 chars — e.g. "Watch replay",
"View board"). When the user taps it the overlay closes and the promise
resolves with `outcome: "review"`; show your own review surface (the final
board, a step-through replay) with an in-tile way back, and call
`Poe.room.tileEnd()` again with the same leaderboard id when the user is done so
they return to the end screen:

```typescript
const result = await Poe.room.tileEnd({
	leaderboardId: "replay-scores",
  actions: { review: { label: "Watch replay" } },
});
if (result.outcome === "playAgain") startNewRound();
else if (result.outcome === "review") openReplay(); // re-call tileEnd() on close
```

`actions.nudge: true` shows a Nudge control for each active human member who
has no score on this board. A member can nudge the same person once every 24
hours per existing board. Before the first score creates a board, all
not-yet-created boards share one 24-hour limit for each sender and target. This
prevents fabricated board IDs from bypassing the cooldown. Only enable this for
a board that is still meaningfully playable: the platform intentionally does
not know whether an app-owned board is current, archived, or evergreen. The
option defaults to `false`.

The optional `round` is an app-owned id for this terminal round (e.g. the run's
start timestamp or a round id from your synced store). Pass it so a later
`Poe.room.dismissTileEnd({ supersedesRound })` can target exactly this overlay.
Keep it short — `round` (and `supersedesRound`) are rejected at ingestion if they
exceed 256 characters, so don't pass a serialized game state as the id.

When the user chooses another tile from the end UI, the host creates the rematch on the device after local synced-store hydration has supplied the exact roster and room refs: it reads cached/external `$$system.room`, `$users`, and `$userInfo`, mints a fresh room and instance, seeds the new room with the human players from the round, then opens the selected tile, unmounts the current tile, and resolves `{ playAgain: false }`. No server round-trip is needed for the end overlay or rematch creation itself, so the seeded room is durable across reloads and reconnects when the device is offline after creation. Agent players are not carried into the rematch room — a new round adds its own agents. If the current tile is already in a child room, the new room is a sibling; otherwise the current room becomes the parent. Choosing Play Again resolves `{ playAgain: true }` without navigating.
For score payloads, the host displays scored active humans' names and profile pictures ranked by the leaderboard settings, followed by unscored active humans as blank rows in room join order. `{ everyone: score }` is shown as a team score for all active players.

### `Poe.room.setShareLeaderboardId(leaderboardId)`

Tell the host which tile-owned leaderboard should be used when the user copies or shares the current page's invite link. The host derives the calling tile instance from trusted RPC context, so tiles pass only the leaderboard id. The manager applies the setting only while that tile instance is the visible current page; route changes clear it.

Use this for pages that show a persistent leaderboard but do not open the tile-end overlay:

```typescript
await store.mutate.submitScore({ score });
await Poe.room.setShareLeaderboardId("daily");
```

```typescript
Poe.room.setShareLeaderboardId(leaderboardId: string): Promise<void>;
```

`leaderboardId` is app-owned, bounded, and should match the id you use with `setLeaderboard(ctx, ...)`, `setLeaderboardScore(ctx, ...)`, or `getLeaderboard(ctx, ...)`. Use `"default"` for the default board.

### `Poe.room.dismissTileEnd(opts?)`

Programmatically dismiss **this client's** active tile-end overlay (instead of waiting for the user to tap). The calling tile instance is derived from trusted RPC context; you can only dismiss your own instance's overlay. The pending `Poe.room.tileEnd()` promise on this client resolves with `outcome: "dismissed"`.

This is the building block for a **shared-instance team game** where everyone plays one persistent instance: when one player advances the shared round, every other client clears its now-stale overlay on its own. It is per-client — the "everyone's screen clears" effect comes from each client calling this in reaction to shared synced-store state, not from a broadcast.

```typescript
type RoomDismissTileEndInput = {
  // Dismiss ONLY if the active overlay's `round` equals this (so a delayed
  // call can't close a newer overlay). Omit to dismiss the active overlay
  // unconditionally (simple single-round apps).
  supersedesRound?: string;
};

Poe.room.dismissTileEnd(opts?: RoomDismissTileEndInput): Promise<void>;
```

Resolves once the host handles the dismiss (no-op if no matching overlay is showing); rejects if no host supports dismissal or if called from the root app.

Typical shared-game pattern — tag the round on `tileEnd`, then dismiss when your synced state shows a new round is live:

```typescript
// Install the dismiss watcher BEFORE awaiting tileEnd: the await blocks until
// this client's overlay settles, so a watcher registered AFTER it resolves is
// too late — there is no overlay left to dismiss. When the shared round advances
// (a peer started the next round), dismiss our now-stale overlay; tear the
// watcher down in `finally` once tileEnd has settled.
const unsubscribe = store.subscribe(
  (tx) => tx.table("game").get("game"),
  (game) => {
    if (game?.round === finishedRoundId) return;
    void Poe.room.dismissTileEnd({ supersedesRound: finishedRoundId });
  },
);
try {
  // Every client reports the team result tagged with the finished round id.
  const result = await Poe.room.tileEnd({ leaderboardId: "team", round: finishedRoundId });
  if (result.outcome === "playAgain") restartIfStillCurrent(finishedRoundId); // generation-guarded
  // outcome "dismissed" / "closed" → another client drove it, or the user left; do nothing.
} finally {
  unsubscribe();
}
```

Make the restart **generation-guarded / idempotent** (restart only if the just-finished round is still current) — when several players tap Play Again at once, the platform does not serialize the restarts.

### `Poe.agents.create({ agentId, name, model, tools?, room? })`

Create a new agent owned by the calling user. You mint the agent's `agentId` (an `agent_<uuid>`) and pass it as the **idempotency key**; the trusted host runs the whole creation server-side in one round-trip: it claims the per-creator-unique `name` in the caller's agents registry, initializes the agent's store with the given `model` and `tools`, and — when you pass a `room` — adds the new agent to that room in the same call.

```typescript
// Use the portable `generateUUID()` helper, not `crypto.randomUUID()` — the
// latter is unavailable on non-secure LAN / dev origins (common for local and
// mobile testing).
const agentId = `agent_${generateUUID()}`;
const result = await Poe.agents.create({
  agentId, // client-minted idempotency key — reuse it across retries
  name: "Code Reviewer",
  model: "anthropic/claude-sonnet-4-6",
  tools: ["read_file"], // restricts the agent to these system tools (order ignored)
  room: { typeId: "chat", instanceId: roomId }, // optional: create + add in one call
});
```

`agentId`, `name`, and `model` are required (`name`/`model` are trimmed by the host); `name` is unique among the calling user's agents (case-insensitive). `tools` is the system-tool allow-list — an **explicit grant list** (deny-by-default): the agent may use exactly the tools named, and omitting it (or passing `[]`) gives the agent **no system tools** (the default for auto-created agents; grant tools later via a config edit). Tool order doesn't matter — it's treated as a set. `room` is optional; when supplied you must be a live member of that room (direct-message rooms are refused), and the room is validated before the agent is created so a bad room never leaves an orphaned agent.

`modelParams` is optional: the agent's **default model params** for `model` as `paramId → value` (for example `{ output_effort: "high" }` or `{ thinking_visibility: true }`), stored on the agent and applied to every run on that model over the catalog defaults (a stored value overrides its default), so a default that later moves in the catalog still moves for any param the agent never touched. Only ids the platform honors are accepted (`web_search` is not storable), and a stored value that later stops matching the model's options falls back to the catalog default instead of failing the run. The params belong to the agent's model: changing the model through the edit flow clears them unless the same edit supplies new ones. Omitted or `{}` means catalog defaults.

**The `agentId` is the idempotency key.** Mint it once per logical create intent and **reuse it across retries** (don't generate a fresh id on retry, or you lose idempotency). Calling `create` again with the same `agentId` returns your existing agent and **ignores the rest of the payload** — `reused` is `true` when the existing agent was returned and `false` when a fresh one was minted; the optional `room` add still applies on reuse. So a retry (or a double-submit) safely resolves to the same agent. Config changes go through the edit flow, never `create`. The promise rejects only on a *real* conflict — a **new** `agentId` whose `name` is already taken by a different agent — or when `modelParams` carries an id the platform does not honor or a value out of range, or when the room is invalid or initialization fails.

The returned `agentId` echoes the id you minted (an `agent_…` id usable as a room member id), and `addedToRoom` reports whether the optional `room` add succeeded. Agents join rooms through the membership APIs (below); apps never mount or read the agent's own store.

### `Poe.agents.delete({ agentId })`

Delete one of your agents outright. The trusted host runs the whole cascade server-side: it removes the agent from **every** room it belongs to, releases its name back to your registry, purges its conversation history, and finally destroys the agent's own store (its config and memory). Creator-only.

**This is irreversible.** There is no undo and no tombstone to restore from — confirm with the user before calling it.

```typescript
const result = await Poe.agents.delete({ agentId });
if (result.failedRooms.length > 0 || result.cleanupErrors.length > 0) {
  // Not a failure — the delete is INCOMPLETE. Call it again to finish; every
  // step is idempotent, so a retry re-attempts only what is left.
  showRetryPrompt(result);
}
```

**The promise resolving does not mean the agent is gone.** The whole cascade is idempotent and retryable, so a partial run reports what it finished instead of throwing:

- `roomsRemoved` — rooms the agent's membership was removed from this call.
- `failedRooms` — rooms whose removal failed. Non-empty means the agent is mid-delete: its name is not released and it can no longer be used, but it is not deleted either.
- `registryReleased` — whether the name claim was tombstoned.
- `agentStoreDestroyed` — whether the agent's own store is gone. This is the **last** step and only runs when everything before it succeeded.
- `cleanupErrors` — one message per step that did not complete.

Check those fields and re-call `delete` with the same `agentId` to finish an incomplete delete. The promise **rejects** only when the request itself failed — you are not the agent's creator, or the `agentId` is malformed. Deleting an already-deleted agent is a no-op.

### `Poe.agents.addToRoom({ agentId, typeId, instanceId })` / `Poe.agents.removeFromRoom({ agentId, typeId, instanceId })`

Add or remove an existing agent as a member of a room. Use `addToRoom` to bring one of your agents into a room you're a live member of; use `removeFromRoom` to take it out. Both resolve once the membership change is committed.

```typescript
await Poe.agents.addToRoom({ agentId, typeId: "chat", instanceId: roomId });
await Poe.agents.removeFromRoom({ agentId, typeId: "chat", instanceId: roomId });
```

`addToRoom` requires that you are the agent's creator **and** a live member of the room; `removeFromRoom` is creator-only.

### `Poe.agents.listTools()`

List the first-party agent system-tool catalog — the `{ id, displayName, description }` metadata for every built-in system tool an agent can be granted. Use it to render tool ids and display names in your own agent-building UI without hardcoding the list.

```typescript
const tools = await Poe.agents.listTools();
// e.g. [{ id: "calculator", displayName: "Calculator", description: "Evaluates arithmetic expressions." }]

// The ids are exactly what `Poe.agents.create({ tools })` accepts:
await Poe.agents.create({
  name: "Mathbot",
  model: "anthropic/claude-sonnet-4-6",
  tools: tools.map((tool) => tool.id),
});
```

Read-only public metadata — it takes no arguments, requires no permissions, and returns the same catalog for everyone.

### `Poe.agents.listTemplates()`

List the first-party agent-template catalog — the preset agent configurations (name, model, and tool grant) that pre-fill the agent-create form. Use it to render a template picker in your own agent-building UI without hardcoding the presets.

```typescript
const templates = await Poe.agents.listTemplates();
// e.g. [{
//   id: "math-helper",
//   displayName: "Math Helper",
//   description: "Works through arithmetic step by step using a calculator tool.",
//   iconEmoji: "🧮",
//   config: { suggestedName: "Math Helper", model: "anthropic/claude-sonnet-4-6", tools: ["calculator"] },
// }]

// A template's `config` is exactly what `Poe.agents.create` accepts — instantiation is a copy:
const template = templates.find((t) => t.id === "math-helper");
if (template) {
  await Poe.agents.create({
    name: template.config.suggestedName,
    model: template.config.model,
    // `config.tools` is `readonly string[]`; spread into a mutable copy for the create input.
    tools: [...template.config.tools],
  });
}
```

Read-only public metadata — it takes no arguments, requires no permissions, and returns the same catalog for everyone. Picking a template only pre-fills the create form; there is no live template↔agent link after creation.

### `Poe.agents.listMine()`

List **your own** live agents — the `{ agentId, name, model }` metadata for every agent you have created. Use it to render a picker of the caller's agents, or to resolve one of your agents by name to its `agentId` so you can add it to a room with `Poe.agents.addToRoom`.

```typescript
const mine = await Poe.agents.listMine();
// e.g. [{ agentId: "agent_ab12…", name: "Math Helper", model: "anthropic/claude-sonnet-4-6" }]

// Resolve a name to an agentId (case-insensitive), then add it to a room:
const match = mine.find((a) => a.name.trim().toLowerCase() === "math helper");
if (match) {
  await Poe.agents.addToRoom({ agentId: match.agentId, typeId: "chat", instanceId: roomId });
}
```

Caller-scoped: it lists **only your own** agents (listing your own is not a permission escalation), so there is no way to enumerate or add another user's agents by a guessed name — always add by the opaque `agentId`.

### `Poe.track(event, properties?)`

Send a fire-and-forget analytics event through the host-owned analytics pipeline.

```javascript
Poe.track("tile_opened", { tileType: "chat" });
Poe.track("space_invite_sent", { channel: "share-link" });
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `event` | string | Yes | Event name matching `/^[a-z0-9_$-]+$/i`, up to 128 characters |
| `properties` | object | No | JSON-serializable property bag, up to 100 top-level keys and 32 KB serialized |

`Poe.track()` returns immediately and does not report whether an event was forwarded. The SDK, host kernel, and first-party relay all validate the envelope; invalid events, reserved keys, PII-looking keys, oversized payloads, anonymous users, or disabled analytics are silently dropped.

### `Poe.openExternalUrl({ url })`

Ask the host to open a web link. This is the only way an app can open a link outside itself — the iframe sandbox has no `allow-popups`, so `window.open` and `target="_blank"` are blocked before the host can see them.

```javascript
await Poe.openExternalUrl({ url: "https://example.com/rules" });
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | Yes | An http(s) URL, up to 8192 characters |

The host decides how the link opens. A link back into the platform itself (same origin as the host and matching a real platform page — for example an invite link shared in chat) navigates in place, like any other in-app navigation, with no confirmation. Any other link shows the user a confirmation with the destination host before anything opens; the user can decline. When the user confirms, the link opens in a new tab on the web, or in the platform in-app browser inside the mobile apps. The returned promise resolves when the request is accepted (not when the user confirms or navigation happens) and rejects for invalid URLs (non-http(s) schemes, over-length).

### `Poe.openBugReport({ debugId })`

Opens the host’s editable bug-report form with the debug ID and host-stamped tile/instance IDs. It does **not** submit feedback; the user reviews and sends the report. Keep original diagnostics in durable storage under that ID, and show product-owned error copy in the UI.

`debugId` must be 1–256 ASCII letters, digits, or `_./:-` characters. Use `Poe.has("openBugReport")` during rollout; on older hosts, tell the user to include the ID in **Report a bug** from the account menu. Calls reject for invalid input, a host that cannot open the form within 30 seconds, or a non-browser environment.

### `Poe.openSettings({ section? })`

Ask the host to navigate to its Settings page. Fire-and-forget; the promise resolves once the request is accepted.

```javascript
await Poe.openSettings({ section: "poe-account" });
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `section` | `"poe-account"` | No | Hint for which settings sub-section to focus. The host may ignore it. |

Pair this with [`Poe.getPoeBotAccess()`](#poe-getpoebotaccess): when the user can't use bots, send them to `{ section: "poe-account" }` to connect / reconnect / enable Poe points.

### `<poe-tile>` Custom Element

```html
<poe-tile type-id="my-game" instance-id="lobby-123"></poe-tile>
```

A custom HTML element that renders a child app inline. This is how one app embeds and renders another app inside itself.

The child app runs in a sandboxed iframe within the element's shadow DOM. The embedded app calls `Poe.setupStore()` normally — it doesn't know it's embedded.

A `<poe-tile>` cannot embed a first-party Poe tile, such as chat, an agent console or Creator. The mount fails with "can only be opened by the root app; use Poe.open". Open those tiles with [`Poe.open()`](#poe-open-typeid-instanceid-openprops-anchorsortkey-placement-viewwidth), for example with `placement: "splitView"` to show one beside your app.

To use `<poe-tile>`, register it in your entry file:

```javascript
import { registerPoeTileElement } from "poe-tiles-sdk/v1/client.js";
registerPoeTileElement(environment);
```

#### Attributes

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| `type-id` | string | Yes | The app type ID to embed (max 128 characters) |
| `instance-id` | string | Yes | Full instance ID for the child app's store. Callers construct this themselves, typically as `${parentInstanceId}-${childHandle}`. The same instance ID reconnects to the same store data. (max 256 characters) |
| `open-props` | string (JSON) | No | JSON-serializable data to pass to the child app at open time (max 10 MB). The child reads it via `Poe.getOpenProps()`. |
| `room` | `"self" \| "inherit" \| "explicit"` | No | Flat-room mode. `"inherit"` (default when omitted) — child joins the DOM-parent's room. `"self"` — child owns its own `$users` roster (standalone). `"explicit"` — child joins the room identified by paired `room-type-id` + `room-instance-id` attrs. |
| `room-type-id` | string | When `room="explicit"` | Store type ID of the explicit room (max 5,000 characters). |
| `room-instance-id` | string | When `room="explicit"` | Store instance ID of the explicit room (max 5,000 characters). |
| `opener-store-type-id` | string | No | *Logical* parent identity (type ID half) when this `<poe-tile>` is mounted by the root app on behalf of a `Poe.open` call. Lets `room="inherit"` resolve against the opener's `$$system:room` instead of the DOM-parent's (manager). Honored only by the root app — untrusted iframes stamping this on their own embedded `<poe-tile>` have no effect. (max 5,000 characters) |
| `opener-store-instance-id` | string | No | Pairs with `opener-store-type-id`. (max 5,000 characters) |
| `focus-on-mount` | boolean attribute | No | Focus the child iframe as soon as it mounts (including remounts and reloads), so keyboard-driven content receives key events without the user first clicking inside it. Set it only on the primary tile in view. It never steals focus from a focused text entry or from another `<poe-tile>`, nor — when the host document is itself framed inside another page and does not currently hold focus — from an ancestor document (a nested tile's content waits for the user's first click into it); a host-hidden tile defers the focus until it is revealed. When parent chrome that took focus (an overlay, a results sheet) closes and control returns to the still-mounted tile, call the element's `focusChild()` method to hand keyboard focus back — same opt-in and never-steal guards as the mount pass. |

To mount a `<poe-tile>` with an `instance-id` that has **never existed before**, first call [`Poe.tiles.prepareNewInstances`](#poe-tiles-preparenewinstances-instances) to declare its genesis, then render the element. There is no `is-new` attribute: the kernel reads the prepared spec from durable client metadata when the store mounts, treats it as a fresh creator (skips the IndexedDB probe and the server-`clientOrdinal` wait), and pins it via `$bootstrapStore`.

#### Visibility

**`document.visibilityState` is not enough.** The platform keeps your iframe mounted while it draws its own chrome over you — the room chat sheet opening on top of a running game, the results leaderboard your own `Poe.room.tileEnd()` call summons, a modal, an app switcher. Nothing in the DOM changes: `document.visibilityState` stays `"visible"`, your iframe keeps its size, and no focus event arrives. Every timer, animation frame, and scored countdown keeps running behind the cover unless you pause it.

`isPoeTileForeground()` is the answer to "is my app actually on screen". It is false when either the host covers you OR the browser page is hidden:

```javascript
import {
  isPoeTileForeground,
  subscribePoeTileForegroundState,
} from "poe-tiles-sdk/v1/client.js";

if (isPoeTileForeground()) startCountdown();

const unsubscribe = subscribePoeTileForegroundState((foreground) => {
  if (foreground) resumeCountdown();
  else pauseCountdown();
});
```

`subscribePoeTileForegroundState` fires on transitions only — read `isPoeTileForeground()` for the current value — and returns an unsubscribe function.

The listener also receives a `detail` object if you want to know *why* the app went dark. Most apps ignore it and just pause:

```javascript
subscribePoeTileForegroundState((foreground, { reason }) => {
  if (foreground) return resume();          // reason: "visible"
  if (reason === "covered") return pauseButStayWarm();
  teardown();                               // reason: "backgrounded"
});
```

`"covered"` is platform chrome drawn over your still-running iframe; `"backgrounded"` is the browser's own page visibility, which also throttles your timers and stops `requestAnimationFrame`. The listener does not re-fire when only the reason changes (covered, then also backgrounded) — the boolean is the contract.

**Any timed, scored, or animated app should pause on this.** A timer that keeps counting behind chat is a wrong score, not just wasted CPU.

Being covered does not change your app's standing with the platform: presence keeps ticking (other players still see you here) and your store keeps syncing. It only tells you nobody is looking.

`isPoeTileHostVisible()` / `subscribePoeTileHostVisibility()` are the narrower pair — host cover only, ignoring browser page visibility. Use them for "has the user actually seen this content" bookkeeping where a backgrounded tab is handled separately; prefer the foreground pair for anything you want to pause.

If your app itself hosts a child `<poe-tile>` and covers it with your own chrome, tell the child:

```javascript
import {
  setChildPoeTileHostCovered,
  setChildPoeTileHostVisible,
} from "poe-tiles-sdk/v1/client.js";

// Your chrome is drawn OVER the child, but the user is still "in" it.
setChildPoeTileHostCovered(childPoeTileElement, true);
setChildPoeTileHostCovered(childPoeTileElement, false);

// The child is no longer the surface the user is on at all.
setChildPoeTileHostVisible(childPoeTileElement, false);
setChildPoeTileHostVisible(childPoeTileElement, true);
```

Both reach the child as the same `isPoeTileForeground() === false`. Prefer `setChildPoeTileHostCovered` when the user is still in that child: `hostVisible: false` additionally tells the platform the child is no longer attended, which pauses its presence heartbeat and foreground store pulls.

Foreground-only work — animation loops, physics, polling, audio, WebGL rendering — should gate its scheduling on the same signal:

```javascript
let foreground = isPoeTileForeground();
let raf = 0;

const unsubscribe = subscribePoeTileForegroundState((next) => {
  foreground = next;
  if (foreground) scheduleRenderLoop();
});

function scheduleRenderLoop() {
  if (raf !== 0 || !foreground) return;
  raf = requestAnimationFrame(renderLoop);
}

function renderLoop() {
  raf = 0;
  if (!foreground) return;
  // Do foreground-only work.
  scheduleRenderLoop();
}

scheduleRenderLoop();
```

#### Usage

```html
<!-- Vanilla HTML -->
<poe-tile type-id="chat" instance-id="parent-123-my-chat-1"></poe-tile>

<!-- With open props (HTML attribute) -->
<poe-tile type-id="chat" instance-id="parent-123-my-chat-1" open-props='{"theme":"dark"}'></poe-tile>
```

```jsx
// React — construct instance-id from parent's instanceId + child handle
<poe-tile
  type-id={selectedApp.typeId}
  instance-id={`${instanceId}-${selectedApp.id}`}
  style={{ display: "block", flex: "1", minHeight: "0" }}
/>
```

```javascript
// Programmatic — set openProps via JS property (overrides attribute)
const el = document.createElement("poe-tile");
el.setAttribute("type-id", "chat");
el.setAttribute("instance-id", "parent-123-my-chat-1");
el.openProps = { theme: "dark", userId: "abc" };
document.body.appendChild(el);
```

#### TypeScript JSX Support

To use `<poe-tile>` in TypeScript React projects, add a type declaration:

```typescript
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "poe-tile": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "type-id": string;
          "instance-id": string;
          "open-props"?: string;
        },
        HTMLElement
      >;
    }
  }
}
```

#### How It Works

1. On mount, the element calls `apps.openChild` via `postMessage` to the top-level document (with optional `openProps`)
2. The host registers the instance, injects session config and openProps into the HTML template
3. A blob URL is created from the HTML and loaded in a sandboxed iframe (`allow-scripts allow-forms`)
4. The child app communicates with the platform via `window.top.postMessage` using a nonce for routing
5. On unmount, the iframe is removed and the blob URL is revoked

### `Poe.getOpenProps()`

Read JSON data passed by the parent app when this app was opened via `<poe-tile>`. Returns `null` if no props were passed or if this is a top-level app.

```javascript
const props = Poe.getOpenProps();
if (props) {
  console.log(props.theme); // "dark"
}
```

Open props are **read-once at startup** — they are baked into the HTML when the iframe is created and are not reactive. For reactive parent-child communication, use Synced Store.

### `Poe.consumeEntryContext()`

Read the **entry context** for this mount — how the user got here, and the small creator-defined payload attached to the notification they tapped. Like `getOpenProps()`, it is available synchronously before your tile code runs.

```typescript
type EntryContext =
  | { source: "direct" }
  | {
      source: "push" | "banner" | "badge";
      notification: {
        context: JSONValue;   // what a sender attached via notifyActivity's push.context
        senderId?: string;    // the responsible user (absent for system notifications)
        sentAtMs: number;     // when the notification was enqueued
      };
    };

const entry = Poe.consumeEntryContext();
if (entry.source !== "direct") {
  // context is creator-defined JSON — narrow it defensively before use
  const context = entry.notification.context;
  if (
    context !== null &&
    typeof context === "object" &&
    !Array.isArray(context) &&
    context.kind === "challenge"
  ) {
    // …opened from a challenge push — decide whether to show the overlay
  }
}
```

- **`source`** — `"push"` (tapped an OS notification), `"banner"` (tapped the in-app foreground notification banner), `"badge"` (tapped a badged in-app row / app-icon badge), or `"direct"` (a normal open, with no notification provenance). `push` and `banner` resolve the *exact* notification tapped; `badge` resolves the newest unconsumed notification for the tile. Branch on `source !== "direct"` when you only care that the user arrived from a notification.
- **`notification.context`** — the exact JSON a sender passed to [`notifyActivity`'s `push.context`](#notifyactivity). This is a **stale-able hint, not authoritative state**: by the time the recipient opens the tile the challenge may already be beaten, the turn already played, the message already read. **Always re-derive display state from your store** and use the context only to decide *what to surface*.
- **Consumed at most once per notification-originated mount.** The first call returns the notification and fires a host acknowledgement; later calls in the same mount — and every normal open — return `{ source: "direct" }`. Read it once at startup and thread the result into your tile.
- **Route-mounted tile only.** A DOM-nested [`tiles.openChild`](#poe-tile-custom-element) child always reads `{ source: "direct" }`; if a child needs the context, the parent forwards what it needs via `openProps`.
- **Per-device, at-least-once.** Consumption is tracked per device (so opening on your phone doesn't consume it on your tablet), and a crash between read and acknowledgement re-delivers on the next mount — a rare duplicate overlay is acceptable, so keep the reaction idempotent.

**When to attach context, and when to show nothing.** Attach `push.context` when tapping the notification should land the user somewhere more specific than the tile's default screen — a challenge overlay, a game-over recap, first-turn framing, or a scroll to the referenced entity. Keep the payload tiny (an id plus a `kind` discriminator) and validate against your store on arrival: show the overlay only if the challenge still stands, scroll only if the message is in loaded history, otherwise fall through to a normal open. Do **not** attach context (or show any special UI) for routine, low-signal events — an ordinary turn on move 23, a daily nudge — where a plain open is exactly right; a mistimed overlay is worse than none.


### `Poe.parent`

The parent store's identity, available for child apps opened via `<poe-tile>` or `Poe.open()`. Returns `null` for root apps (apps not opened as children of another app).

```typescript
type ParentStoreInfo = {
  storeTypeId: string;
  instanceId: string;
};

Poe.parent; // { storeTypeId: "my-parent-app", instanceId: "room-42" } or null
```

Use this to pass the parent's store identity as input to mutators that dispatch [external mutations](../../synced-store/references/external-stores.md) to the parent store:

```javascript
// In the child app's UI code (client-only):
await store.mutate.notifyParent({
  parentTypeId: Poe.parent.storeTypeId,
  parentInstanceId: Poe.parent.instanceId,
  message: "task completed",
});

// In the mutator (runs on both client and server):
notifyParent: async (ctx, input) => {
  ctx.mutateExternal({
    storeTypeId: input.parentTypeId,
    instanceId: input.parentInstanceId,
    mutationName: "receiveChildNotification",
    input: input.message,
  });
},
```

This pattern works because the parent identity flows as regular mutation input — the server doesn't need to know about parent/child app relationships.

### `Poe.topOrigin`

Origin of the top (host) document — e.g. `"https://poe.com"` in production, `"http://localhost:5105"` in dev. Apps read it to build absolute URLs that resolve against the host instead of the sandboxed iframe.

```typescript
Poe.topOrigin; // "https://poe.com" or undefined
```

Joiner tiles run inside a sandboxed blob-URL iframe. Inside that iframe, `window.location.origin` is the string `"null"` (sandboxed) or an app-hosting subdomain — neither routes to the host's UI. The platform therefore injects the top document's origin into the iframe via `<div id="poe-config" data-top-origin="...">`, which `PostMessageEnvironment` reads and exposes here.

Returns `undefined` on older hosts that don't inject the attribute; apps should fall back to path-only URLs in that case so they degrade gracefully.

```typescript
// Build a shareable invite URL.
const path = `/invites/${encodeURIComponent(code)}`;
const shareUrl = Poe.topOrigin ? `${Poe.topOrigin}${path}` : path;
await navigator.clipboard.writeText(shareUrl);
```

For top-document apps (trusted apps not running in an iframe) that construct a `PostMessageEnvironment` manually, pass `topOrigin: window.location.origin` in the constructor options.

### `Poe.interfaceLanguages`

The host's interface language preferences, as BCP 47 tags with the most preferred first (e.g. `["fr"]`). Apps that localize their own UI should prefer this over `navigator.languages`.

```typescript
const languages = Poe.interfaceLanguages ?? navigator.languages;
```

A host can let the viewer pick an interface language (Poe's Language setting) and keep that choice where a sandboxed tile cannot read it, so `navigator.languages` inside the iframe would still report the browser's own languages. The platform injects the host's list into the iframe via `<div id="poe-config" data-interface-languages="...">` when the tile mounts. A change takes effect on the next mount; the host reloads after the viewer changes it.

Returns `undefined` when the host supplies no list (no choice made, or an older host); fall back to `navigator.languages`, as above.

### `Poe.capabilities`

Resolved host surface capabilities — a flag map describing which surfaces the host enables. Always a full object: any flag the host did not restrict (or the whole config when the host imposes no restrictions) reads as enabled, so `Poe.capabilities.<flag>` is safe to read without a null check.

```typescript
Poe.capabilities; // { agents: true, ownChats: true, ... }
```

Most apps do not need this — it exists for first-party host surfaces that hide their own affordances when the host runs in a restricted mode (for example a host that disables agent/AI affordances). The host bakes the set into the iframe via `<div id="poe-config" data-capabilities="...">`, which `PostMessageEnvironment` reads and `createPoe` resolves against the all-enabled default. It is UI defense-in-depth only — the server is always the authority on what an app may actually do.

### `Poe.haptics`

Trigger cross-platform hardware haptic feedback. Fire-and-forget — calls return immediately and the device buzzes on platforms that have hardware support. Modeled on Apple's `UIFeedbackGenerator` taxonomy because it's the richest target the platform mapping has to satisfy.

```typescript
// Discrete tactile feedback for a user action.
Poe.haptics.impact("light" | "soft" | "medium" | "rigid" | "heavy");

// Outcome feedback for a completed operation.
Poe.haptics.notification("success" | "warning" | "error");

// A small tap each time the selected value changes (slider tick, picker wheel).
Poe.haptics.selection();
```

Safe to call from any context — no `isPoeNativeBridgeAvailable()` gate needed. Platforms with no haptic-capable path silently no-op.

#### Platform support

| Platform | What plays |
| --- | --- |
| iOS app | `UIImpactFeedbackGenerator` / `UINotificationFeedbackGenerator` / `UISelectionFeedbackGenerator` via a JS-bridge call. Best fidelity. |
| Android app and mobile web (same code path) | `navigator.vibrate` with a fixed duration per style. The Android app's WebView is Chromium and supports the Vibration API directly, so the feel is identical between in-app and mobile web on the same device. |
| iOS Safari 17.4+ (mobile web) | A single subtle tap, via the `<input switch>` label-click trick. **All styles collapse to the same tick on this path** — see "Limitations" below. |
| Desktop browsers, older iOS Safari | Silent no-op. |

#### Usage

```typescript
// In a button handler:
function onTapAttack() {
  Poe.haptics.impact("medium");
  // …apply game-state change
}

// On a successful save:
async function onSave() {
  await persist();
  Poe.haptics.notification("success");
}

// While dragging a value slider:
function onSliderTick() {
  Poe.haptics.selection();
}
```

Haptics calls are fire-and-forget by design — there's no `await` and no return value to check. Don't gate UI on a successful haptic; let it be a finishing touch on top of whatever the user did.

#### Limitations

- **No custom patterns.** The API is intentionally semantic-only. iOS doesn't expose arbitrary haptic patterns to web code, so a raw-pattern API would silently degrade on half your users. The semantic taxonomy maps cleanly to every platform that has any haptic support.
- **iOS Safari is one-intensity.** On iOS mobile web, every style fires the same subtle tap — `impact("heavy")` and `selection()` feel identical.
- **iOS Safari < 17.4 is silent.** No fallback exists short of audio cues you'd implement yourself. Same answer applies to desktop browsers.
- **User can disable haptics.** All platforms respect the user's system-level haptics setting — the call still resolves, but the device stays still. Don't treat haptic feedback as a reliable signal that the user noticed the action.

### Device motion

Tilt and shake are web input: a tile listens to `deviceorientation` and `devicemotion` itself, and the host delegates the sensor permissions to every tile frame. The recipe (request from a tap, judge the readings, fall back to touch, say so once), and the controls model (Touch default, Tilt opt-in, calibration) are in the shared [device motion reference](../../poe-tiles-cli/references/device-motion.md); read it before designing input for a tilt or shake game. The SDK adds two things once the tile is integrated:

```typescript
// In the same code path that subscribes to motion events:
let releaseMotion: (() => void) | null = null;
function enableTilt() {
  if (releaseMotion) return; // already on: one claim per subscription
  window.addEventListener("deviceorientation", onTilt);
  if (Poe.has("motion.claim")) releaseMotion = Poe.motion.claim();
}
// Where the tile stops listening (menu, game over):
function disableTilt() {
  window.removeEventListener("deviceorientation", onTilt);
  releaseMotion?.();
  releaseMotion = null;
}
```

- **`Poe.motion.claim()`** tells the host this tile is using device motion as game input and returns a disposer. While a claim is held and the tile is on screen, the Joiner apps' shake-to-report gesture stands down, because a flick or tilt mechanic cannot be told from a shake; without it the bug-report sheet opens mid-game. Call it whatever the permission outcome (a denied player can still retry), but not when the events do not exist at all (`typeof DeviceMotionEvent === "undefined"` is terminal, and shake-to-report should stay armed), in the code path that subscribes, and release it where the tile unsubscribes. Leaving the tile releases automatically within a few seconds; host chrome covering a tile the player opened directly releases at once (a tile nested inside another tile releases on leaving only). Players still reach "Report a bug" from the sidebar and the You page. Gate the call with `Poe.has("motion.claim")` while the host rolls out.
- **Persist the controls choice** in a `privateOfUser` table. That row is scoped to the instance and the player: reopening the same instance on any device restores the preference, and a new instance starts on Touch. There is no cross-instance per-user memory, and browser storage is blocked in the sandbox.

## Synced Store Helpers

Convenience helpers for common store operations — notifying the sidebar of activity. These wrap `ctx.mutateExternal()` so you don't need to know the manager's store type ID or mutation names.

Import from the client SDK:

```typescript
import {
  notifyActivity,
  notifyInProgress,
  setTurn,
  clearTurn,
  addInstanceToRoom,
} from "poe-tiles-sdk/v1/client.js";
import {
  assertRoomMember,
  notifyUsersAddedToTile,
} from "poe-tiles-sdk/v1/shared.js";
```

### `notifyActivity()`

Notify the manager of activity in this app instance. Five independent dials — `preview` (sidebar text), `recency` (whether the space also moves to the top of the recents list), `unread: "increment"` (app-owned unread count → numeric badge in the sidebar and contribution to the RECENTS-header total), `push` (OS-level push notification), and `postToChat` (append one announcement row to the containing chat room). Recency defaults by attention: a call carrying `push`, `unread: "increment"`, or `postToChat` (a new transcript item) bumps the space to the top; a passive preview-only call refreshes the row in place without reordering (matching mainstream messenger behavior, where only new items and badge-worthy events reorder the list). Leave `unread` omitted in both the schema and client config to use the standard SDK behavior. Do not add `expectNoUnread()` merely because the tile currently sends no notifications — it asserts the tile never badges anyone and cannot actually suppress a badge if it does. Pick the right activity combination and target it precisely with `targetUserIds`. See [When to notify, and at what level](#when-to-notify-and-at-what-level) below.

```typescript
await notifyActivity(ctx, {
  preview: input.text.slice(0, 200),
  previewTimestamp: Date.now(),
  unread: "increment",
  // Mobile push composes "<tile>: <room/opponent>" when `title` is omitted.
  // Desktop notifications from creator tiles use the catalog identity.
  push: {
    body: input.text.slice(0, 200),
  },
});
```

**Parameters:**

| Field | Type | Description |
|-------|------|-------------|
| `preview` | `string` | Preview text for the sidebar (e.g., last message). Self-contained — no sender prefix is added, so name who acted: "You …" in the actor's own call, "{displayName} …" for everyone else, never a bare verb phrase. |
| `previewTimestamp` | `number` | Timestamp of the activity (content metadata). The recents row's *visible* time label advances only on bumping activity, so the times users see always match the ordering they see — a `"preserve"` refresh updates the preview text without restamping the row's time. |
| `recency` | `"bump" \| "preserve"` (optional) | Whether this activity moves the space to the top of the recents list (`"bump"`) or refreshes the row's preview in place — position and visible time label unchanged (`"preserve"`). Defaults by attention: `"bump"` when the call carries `push`, `unread: "increment"`, or `postToChat` (a new transcript item in the containing chat), `"preserve"` otherwise. Override with `"bump"` for a badge-less event that is still a new item users would call "the latest thing that happened here" (e.g. a system announcement whose unread is handled elsewhere), or `"preserve"` for a badge-worthy event that only mutates an existing item (e.g. a reaction push). |
| `unread` | `"increment"` (optional) | Increments each non-caller recipient's app-owned unread count by 1, lights up the per-space numeric badge, and contributes to the RECENTS-header total. Works with the default simple unread policy, or with an explicit `simpleUnread({ clearOn: "active" })`; omit it for preview updates that should not grow the badge. Not policy-aware: it badges recipients regardless of the declared unread policy (which is why the deprecated `noUnread()` cannot suppress it). |
| `unreadToCaller` | `boolean` (optional, default `false`) | Opts the caller into `unread: "increment"` for a system-attributed receipt delivered back to that user (for example, an agent finishing work the user started). Requires `unread: "increment"` and requires the caller to be in the activity recipient set. |
| `targetUserIds` | `string[]` (optional) | Specific users to notify. Omit to notify all active members. On the client, also controls whether the optimistic pass runs — see Behavior. |
| `push` | `{ title?, body, kind?, pushToCaller? }` (optional) | When present, enqueues a push notification. Defaults to "every activity recipient *except* the caller" — see Push Notifications below. |
| `push.title` | `string` (optional) | Mobile notification title override. Omit it to have the manager compose `"<tile>: <room/opponent>"` at delivery (matching the recipient's recents-row title), the same as a `setTurn` push. Desktop honors title overrides only for trusted platform sources; `kind: "message"` alerts from those sources lead with the sender's display name instead. Ordinary creator tiles ignore this override on desktop. |
| `push.body` | `string` | Notification body (typically preview / message text). |
| `push.kind` | `"message" \| "reaction" \| "nudge" \| "invitation"` (optional) | Presentation intent for desktop notifications. Sender-based names and photos are restricted to trusted platform sources, such as chat and the built-in Creator: `message` uses the sender's identity with separate conversation context; the other kinds use the tile/conversation title and may show the participant photo. Ordinary creator tiles use their catalog name and image regardless of kind, falling back to a room or generic tile title when metadata is unavailable; sender, title, and context-image overrides cannot change that identity. Omit for general activity alerts. This changes presentation only, not recipients, unread counts, or click context. Unrecognized values render as general activity alerts. |
| `push.pushToCaller` | `boolean` (optional, default `false`) | Opt the caller into the push subset. Use only when the activity is not user-attributable to the caller (e.g. a system event the caller happened to trigger, like a horse-race result). Throws if `true` and the caller is not in the activity recipient set. |
| `push.context` | `JSONValue` (optional) | A small creator-defined **entry context** the recipient's tile reads at launch (via [`Poe.consumeEntryContext()`](#poe-consumeentrycontext)) when they open the tile by tapping this notification. Size-capped at 4 KB serialized and validated at ingestion. A stale-able **hint**, not authoritative data — see [Entry context](#poe-consumeentrycontext). Must not contain secrets: only an opaque id transits the push vendor, but the payload is delivered to the recipient's devices and retained until TTL/cap cleanup. |
| `postToChat` | `{ messageId, text, timestamp }` (optional) | Also appends one app-owned announcement message to the chat room that contains this app. The destination is resolved server-side from the source store's pinned `$$system/room`; callers cannot provide a chat id. If there is no containing chat room, `notifyActivity()` logs a warning and skips only the chat append. Chat validates `messageId` for API compatibility, but ignores it for row identity, uses its next `msg/...` sortKey, and derives a separate chat-owned itemKey from that sortKey. |

**Behavior:**

- **Client**: dispatches to the current user's manager only if `ctx.userId` is in `targetUserIds` (or `targetUserIds` is omitted); otherwise the client-side pass is a no-op and only the server's authoritative fan-out lands. This prevents a wrong-sidebar-state flash when `targetUserIds` excludes the caller (e.g. a "Your turn" notification sent to a single non-caller).
- **Server**: dispatches to each user in `targetUserIds`, or all active members if omitted. Users not in the app's `$users` table are filtered out.
- **Chat posting**: when `postToChat` is present, the server declares a sibling mutation to the containing chat room after the manager/unread declarations. If the app is not running inside a chat room, the helper logs a warning and skips that sibling mutation. The chat receiver writes the announcement row only; it does not call back into the manager, so one `notifyActivity()` call stays one manager activity.

**Actor-bump invariant:** every meaningful accepted user action that changes tile state or advances play must move this tile to the top of the actor's Recents. Emit the activity from the mutator that commits the action. When gameplay state is otherwise local, invoke a small activity mutator once at the semantic boundary (start/restart, completed stroke or drag, submitted choice), not on every pointer frame. When a person acted, send a separate actor-only activity with first-person copy ("You …"); only a shared fan-out whose preview names no human actor may include `ctx.userId` with `recency: "bump"` instead. The actor-only call uses `targetUserIds: [ctx.userId]` and `recency: "bump"`, and goes out without unread or push. Sender suppression keeps the actor from receiving their own push, but it does not make a preview-only activity bump: the explicit recency is still required. `setTurn` for the next player does not bump the actor; it only bumps newly marked turn-holders. Do not emit activity for rejected/no-op actions or transient input such as pointer movement, hover, or unsaved typing. Also skip per-user preferences visible only to the acting user — mute, volume, haptics, theme, and reduced motion — because they change only that person's presentation. Persist those preferences without notifying. Shared settings that affect other players or play — house rules, difficulty, round length, board size, and similar room-wide configuration — still bump.

```typescript
await notifyActivity(ctx, {
  preview: `You played ${moveLabel}`,
  previewTimestamp: input.playedAt,
  targetUserIds: [ctx.userId],
  recency: "bump",
});
```

### `setTurn()` / `clearTurn()`

Declare whose turn it is in the calling app instance — the data behind the manager's **"Your Turn"** indicator (a pill on the room/tile). Call these from inside your mutator, the same place you call `notifyActivity`. A new turn mark also moves the recipient's visible room to the top of Recents without overwriting its existing preview. Each marked user's turn state is per-user-private — only that user ever sees their own "Your Turn."

`setTurn(ctx, input)` marks users up:

| Field | Type | Description |
|-------|------|-------------|
| `userIds` | `string[]` | Users to mark as "it's your turn" in this app instance. |
| `replace` | `boolean` (optional, default `true`) | `true` → declarative replace: members currently up but **not** in `userIds` are cleared, so passing the turn to the next player clears the previous holder automatically. `false` → additive: only `userIds` are touched (e.g. a simultaneous game where players become ready one at a time). |
| `push` | `boolean \| { title?, body }` (optional, default `true`) | `true` → default OS push to newly-added users (body "It's your turn.", title filled by the manager from the game/room name). `false` → mark silently. Object → override title/body. |

Marking is **idempotent** — re-marking an already-up user does nothing (no duplicate push, unread increment, or recents bump). A new turn mark increments the target's unread and bumps the target's visible room to the top of Recents, so the actionable tile stays discoverable. Capped at `MAX_TURN_USER_IDS` users per call.

`clearTurn(ctx, input)` is explicit down-marking — the readable counterpart to `setTurn`'s implicit replace-clear:

- `{ userIds }` — clear just those users.
- `{ all: true }` — clear every current turn-holder in this instance (e.g. game over).

`clearTurn` never touches unread (unread clears on view).

**Behavior:** the server pass fans out to each target user's manager; the client pass optimistically updates only the caller (so the mover's own pill clears the instant they take their turn). The authoritative fan-out lands on the server.

```typescript
import { clearTurn, setTurn } from "poe-tiles-sdk/v1/client.js";

// Sequential game (chess, checkers): pass the turn to the next player. This
// automatically bumps their room to the top of Recents, increments unread,
// marks "Your Turn," and sends the context-rich push.
const preview = `${moverName} played ${moveLabel}`;
await setTurn(ctx, {
  userIds: [nextPlayerId],
  push: { body: `${preview} — your move` },
});

// Simultaneous game: several users up at once (still a replace).
await setTurn(ctx, { userIds: [aliceId, bobId] });

// Add a player to the active set without disturbing the others.
await setTurn(ctx, { userIds: [carolId], replace: false });

// Mark up silently (no OS push), e.g. a low-stakes nudge.
await setTurn(ctx, { userIds: [nextPlayerId], push: false });

// Context-rich body — say what just happened instead of the generic default.
// Build it from the move/turn that triggered the change.
await setTurn(ctx, {
  userIds: [nextPlayerId],
  push: { body: `${moverName} took your ${pieceName} — your move` },
});

// Tile end — clear everyone, explicitly.
await clearTurn(ctx, { all: true });

// Clear one specific player (e.g. they resigned).
await clearTurn(ctx, { userIds: [aliceId] });
```

**Make the push body context-rich and engaging.** The default `"It's your turn."` works, but a body that names *what just happened* — `"Jacob just took your bishop"`, `"It's your turn to guess the word"`, `"Aaron checked you — your move"` — is far more likely to pull a player back into the game. Build it from whatever triggered the turn change (the captured piece, the played card, the round/phase, the score to beat) and fall back to the generic default only when there's genuinely no context to add (e.g. an undo, the opening move). You usually only set `body`; the manager fills `title` from the game/room name.

**Do not add `notifyActivity` only to make a turn discoverable.** `setTurn` already bumps each newly marked recipient's room to the top of Recents. Call `notifyActivity` separately when the sidebar preview should describe the move, or when the actor, spectators, or other non-turn-holders should also receive an activity update. Omit `unread` for the next player in that companion call because `setTurn` already increments it.

### `notifyInProgress()`

Report that long-running work is happening in this app instance — the data behind the **spinner on the room's Recents row**. Call it from inside your mutator, the same place you call `notifyActivity`. It is not agent-specific: an AI turn, an image generation, a simulation, or any job the room is waiting on is the same signal to someone scanning their room list.

| Field | Type | Description |
|-------|------|-------------|
| `inProgress` | `boolean` | This store's **aggregate** answer: is *anything* still running here? |
| `attemptKey` | `string` | Opaque identity of the active window of work (a job id, the driving queue item). **Required** while `inProgress`; ignored otherwise. |
| `heartbeatSeq` | `number` (optional) | Monotonic "still working" counter. Each **increment** renews the viewer's stall clock; an unchanged value does not. |
| `source` | `string` (optional, ≤32 chars) | Short producer label for display/debugging. Defaults to this store's type id. |

```typescript
import { notifyInProgress } from "poe-tiles-sdk/v1/client.js";

// The work starts.
await notifyInProgress(ctx, { inProgress: true, attemptKey: jobId });

// ...and when it ends, or you find nothing running.
await notifyInProgress(ctx, { inProgress: false });
```

**Send the aggregate, not one job's boolean.** The platform keeps one entry per app instance, so the last thing you send is the whole instance's answer. With two jobs running, reporting `false` when the first finishes clears the spinner while the second is still going. Derive "is anything still running here?" from your store at every call site — which also means calling it from *every* mutator that can change that answer, including the ones that end work (a completion, a cancel, an error), not only the one that starts it.

**Work that runs longer than ~5 minutes must heartbeat.** The viewer expires an attempt roughly five minutes after its last new signal, so a crashed producer never strands a spinner. If your work legitimately runs longer, increment `heartbeatSeq` from something that is genuinely still alive and doing the work (a worker or bridge timer) — never from a UI re-render or a periodic reconcile, or a dead job's spinner would spin forever. Re-sending the *same* `attemptKey` with no heartbeat is always safe: it restates the current answer without reviving an attempt the viewer already gave up on. A retry that starts fresh work should send a **new** `attemptKey`, which restarts the clock.

**Behavior:** the server pass dispatches to this instance's active members; the client pass dispatches to the caller only, so their own spinner appears without a round trip. The signal is display-only — it never bumps Recents order, previews, unread badges, or push notifications, so it is safe to send freely. Delivery is best-effort and covers the first ~150 members of a room; beyond that, members simply see no spinner. Calling it from a mutation another store dispatched throws, because cross-store mutations cannot dispatch further — defer that emission to an action.

### `assertRoomMember()`

Validate inside a mutator that a user is still an active member of the caller's resolved room.

```typescript
await assertRoomMember(ctx, { userId: input.userId });
```

The client optimistic pass is a no-op. The server pass reads the trusted `$$system.room` row: self-room stores validate against their own `$users`, and room-member stores validate against the canonical room store's `$users`. For child rooms with `$$system.room.parent`, a user who is active in the parent also passes — whether they have no child `$users` row yet or previously left the child room (a leave carries no veto; the platform re-admits them on access). This matters when a user is in the room but has never opened the tile, so they do not appear in the tile instance's local `$users` mirror yet.

### `notifyUsersAddedToTile()`

Send standard "added/assigned to this tile" activity and push notification to selected room members.

```typescript
await notifyUsersAddedToTile(ctx, {
  targetUserIds: [input.userId],
  appName: "Checkers",
  reason: "assigned",
  previewTimestamp: input.now,
});
```

The helper is server-only and validates every target against the caller's canonical room before dispatching. It uses the same manager `receiveActivity` path as `notifyActivity`, but does not filter against the tile instance's local `$users`, so it can notify room members who have not opened the tile. Use `notifyActivity()` directly for custom copy, unread behavior, or chat announcements.

**Unread policy is app-owned.** Leave `unread` omitted in both the schema and client config: by default, the SDK stores a per-user private unread projection and clears it when the host reports that the user is active in the tile. Do not add `expectNoUnread()` merely because the tile currently sends no notifications; keeping the default makes later `setTurn` and `notifyActivity({ unread: "increment" })` additions work without a policy migration. Apps with custom read semantics can declare `customUnread()` in both places and call `setUnreadCount(ctx, { count })` from their own mutators.

`expectNoUnread()` is the third choice, for an app that will never badge anyone. **It is an assertion, not a suppression switch** — hence the name. The increment paths are per-call and not policy-aware, so an app that declares it and then calls `unread: "increment"`, `setTurn`, or the automatic leaderboard notify still badges its recipients while declaring it does not. What the declaration buys is that the platform withholds the increment mutator, and treats any count that does appear as damage: it keeps the clear-side repair and clears on open whenever the local count reads positive. Declare it only if that is really true of your app; when in doubt, leave `unread` omitted. (**`noUnread()` is deprecated** — it is the former name for this policy. It read as "this app has no unread", a guarantee the platform cannot make, and it stays exported so tiles already published keep booting.)

**Push Notifications:**

When `push` is present, each recipient's manager enqueues a pending delivery row alongside the sidebar update.

- **Default sender-suppression.** The helper strips `push` from the caller's own dispatch. The caller's other devices still get the activity update via sync but no OS-level push for their own action. Override only when the activity isn't user-attributable to the caller — set `push.pushToCaller: true`.
- **OS-level "currently in the app" suppression.** Don't ring the device a recipient is actively using is handled at the OS layer (`UNUserNotificationCenterDelegate` on iOS, equivalents on Android/web), not by the helper.
- **Tap target is implicit.** Delivery channels construct deep-links from the calling app's `typeId` + `instanceId` — apps don't specify a URL.

**Limits:** Each notified user's manager is one external mutation target. The limit is `MAX_EXTERNAL_MUTATION_TARGETS` (200) unique target stores per commit.

#### When to notify, and at what level

| Activity kind | `unread` | `push` | Example |
|---|---|---|---|
| Action required from a specific user | `"increment"` | yes | "Jacob just took your bishop" — sent to the player whose turn it is (name the triggering event, not a bare "It's your turn") |
| Opt-in interesting event | `"increment"` | yes | "Your friend beat your high score!" |
| Passive update worth surfacing | `"increment"` | no | "Aaron reacted with 🎉" / "Spymaster gave a clue" — bumps the app and adds to the badge count, no ring |
| Preview refresh without unread | omit | no | Updating a move preview for the actor/spectators, importing your own old messages, todo edits — refreshes the row's preview in place without reordering recents or growing the badge (pass `recency: "bump"` explicitly if the event should also reorder) |

Rules of thumb:

- **Push only when the user would want their phone to ring.** Required-action moments (turn games, incoming chat message, invite) and high-signal opt-in events (someone beat your score, a friend you know just played). Don't push on every state change — multi-player apps generate dozens of mutations per session, and pushing all of them is spam.
- **Use `unread: "increment"` (without `push`) for "nice to know when you look".** Reactions, partial-progress events from collaborators, another player taking a non-blocking turn (e.g. spymaster choosing a clue while it's not yet your guess phase). This bumps the space, increments its numeric badge, and contributes to the sidebar's RECENTS total — but doesn't ring the device.
- **Omit `unread` for preview updates that should not grow the badge.** This includes a player's own durable action when another mechanism, such as `setTurn`, owns the recipient's unread state. If a player would expect a number to change and nothing else increments it, use `"increment"`. A badge-less call also does not reorder recipients' recents lists (the `recency` attention default) — the recipient whose action matters is usually being bumped by `setTurn` or an `unread`/`push`-carrying call already.
- **Keep caller unread opt-in exceptional.** User-authored activity is sender-suppressed by default. Set `unreadToCaller: true` only when the event is attributed to the app, system, or agent and is delivered back to the triggering user as a receipt.
- **Choose `targetUserIds` deliberately.** Omit it only when every active member — including the actor — should read the same preview, which means no human actor is named in it. When a person acted, target the other members with the third-person copy and the actor with a separate first-person call. For targeted pushes, include only the intended recipients: the next player for "your turn," or the previous record-holder for "friend beat your score." Default sender-suppression handles "don't push the user who triggered the action" for you.
- **Make the push body specific and engaging, not generic.** `"Jacob just took your bishop"` or `"It's your turn to guess the word"` pulls a player back far better than a bare `"It's your turn."` Build the body from whatever just happened — the move, the capture, the card played, the round/phase, the score to beat — and reserve the generic default for when there's genuinely no context. This applies to both `setTurn`'s `push` and `notifyActivity`'s `push`; compute the text in the same mutator that detects the event.
- **Make `preview` self-contained.** It shows up in the recents list with no other context — `"Alice: nice move"` reads better than `"nice move"`.

Concrete examples:

```typescript
// Turn-based game: setTurn alone makes the action discoverable to the next player.
const nextPlayer = computeNextPlayer(state);
const preview = `${currentPlayerName} played ${moveLabel}`;
await setTurn(ctx, {
  userIds: [nextPlayer.userId],
  push: { body: `${preview} — your move` },
});

// Optional: update the sidebar preview for every member. `preview` is one
// string per call, so split by reader: third person for the other members,
// first person for the actor. Push-less and unread-less, so the others' rows
// refresh in place; the next player's room (setTurn) and the actor's own row
// (the `recency: "bump"` call below) are the only ones that reorder.
await notifyActivity(ctx, {
  preview,
  previewTimestamp: input.playedAt,
  targetUserIds: memberUserIds.filter((id) => id !== ctx.userId),
});
await notifyActivity(ctx, {
  preview: `You played ${moveLabel}`,
  previewTimestamp: input.playedAt,
  targetUserIds: [ctx.userId],
  recency: "bump",
});

// Same game: spymaster picked a clue — badge + unread for the guessing team, no push
await notifyActivity(ctx, {
  preview: `Spymaster: "${clue}" (${count})`,
  previewTimestamp: Date.now(),
  unread: "increment",
  targetUserIds: guessingTeamUserIds,
});

// High-score game (e.g. poe-jump): someone finished a run — badge bump, no push.
// Other members read the third-person preview; the shared chat transcript is
// third person too. The runner gets a first-person preview of their own.
const timestamp = Date.now();
await notifyActivity(ctx, {
  preview: `${playerName} scored ${score}`,
  previewTimestamp: timestamp,
  unread: "increment",
  targetUserIds: memberUserIds.filter((id) => id !== ctx.userId),
  postToChat: {
    messageId: scoreEventId,
    text: `${playerName} scored ${score}`,
    timestamp,
  },
});
await notifyActivity(ctx, {
  preview: `You scored ${score}`,
  previewTimestamp: timestamp,
  targetUserIds: [ctx.userId],
  recency: "bump",
});

// Same game: new player beat the previous record — push the previous record-holder
if (score > previousBest.score && previousBest.userId !== ctx.userId) {
  await notifyActivity(ctx, {
    preview: `${playerName} beat your score (${score})`,
    previewTimestamp: Date.now(),
    unread: "increment",
    targetUserIds: [previousBest.userId],
    push: { body: `${playerName} beat your high score: ${score}` },
  });
}
```

**You can skip hand-rolling the high-score case:** `setLeaderboardScore` fires this notification for you on a new high score (personalized push to every other active member + a chat announcement when the #1 changes hands, scorer suppressed) — it is **on by default**. Pass `{ notifyOnHighScore: false }` — `setLeaderboardScore(ctx, { … }, { notifyOnHighScore: false })` — to opt out; hand-roll it yourself only when you want custom copy/targeting, and then opt out so it doesn't double up.

When the board has a persisted `label`, every push/activity body and the chat announcement name it: `Alice just beat your score on May 30 best attempts with 9!`. This is how a tile that mints one board per day (or week, or season) tells the recipient WHICH board the score landed on — put the period in the label (`May 30 best attempts`), never deictic wording like "Today's best attempts": the notification is often read after the day rolls over, and each period's board keeps its label forever. A single evergreen board can skip the label and keep the shorter wording.

The chat announcement is built from the entry you just wrote: `displayScore` (or the raw score) as the headline. Add `summaryInChatAnnouncement: true` — `setLeaderboardScore(ctx, { … }, { summaryInChatAnnouncement: true })` — and the entry's `markdown` rides under it, so a board that already annotates each row with a result summary shows that result in the transcript instead of a bare number:

```
🏆 Alice took the top spot with 2/6
🔥 Streak 1

🟨⬛⬛🟩⬛
🟩🟩🟩🟩🟩
```

It is **off by default**, because a `markdown` written for the `tileEnd` overlay is read only by members who open the board, while chat is read by the whole room. Opt in only for a summary you mean to publish there — and remember chat renders it as markdown, so keep it to the result itself rather than links or headings.

### `addInstanceToRoom()`

Register an app instance as a member of a flat room. The room owns its `$users` roster; member instances mirror that roster via fan-out from the room. Once registered, every `$addUsers` / `$removeUser` against the room reaches the member automatically — including users admitted before the member joined.

Import from the client SDK:

```typescript
import { addInstanceToRoom } from "poe-tiles-sdk/v1/client.js";
```

Call from inside a mutation handler:

```typescript
const mutators = {
  // Running on the chat (a room). Register a launched game with the
  // chat's $room_member_instances so the game inherits the chat's
  // $users via the platform's room fan-out.
  launchGame: async (ctx, input) => {
    await addInstanceToRoom(ctx, {
      storeTypeId: input.gameTypeId,
      instanceId: input.gameInstanceId,
    });
    await ctx.table("games").set({
      itemKey: input.gameInstanceId,
      value: input,
    });
  },
};
```

**Input shape:**

```typescript
{
  storeTypeId: string;   // The app instance being registered
  instanceId: string;
  room?: {                // Optional: explicit room ref
    storeTypeId: string;
    instanceId: string;
  };
}
```

- **Omit `room`** when the calling store IS the room (the common `launchGame`-style case — the helper dispatches to the local store).
- **Pass `room`** when the calling store is a *member* of the room and needs to register another app instance on the room's `$room_member_instances`. App-level mutators cannot read the local `$$system:room` row to auto-detect role, so the caller specifies it.

Idempotent on re-call (the platform mutator's `set` overwrites the identically-keyed row). Safe to race with the client-side `<poe-tile room="inherit">` flow — both converge on the same row.

The platform enforces a **single-room invariant**: if the target instance is already a member of a different room (its `$$system:room` points elsewhere) or is itself a room, the dispatch throws `RoomMembershipConflictError` and the row never lands. An instance can be a member of at most one room at a time.

### `getCurrentUserId()`

Read the current user's `userId` from a synced-store client.

```typescript
import { getCurrentUserId } from "poe-tiles-sdk/v1/client.js";

// Once at app mount:
const userId = await getCurrentUserId(store);
```

`store.userId` does not exist by design — the user identity lives in the query/mutator `ctx`. This helper runs a one-shot query that resolves to `tx.userId`, which is the recommended way to read it from UI code (effects, async resources, manual reads). For per-render reactive access, prefer reading `tx.userId` inside a `store.subscribe()` query callback.

```typescript
// SolidJS / async-init pattern:
const [userIdResource] = createResource(
  () => store,
  (s) => getCurrentUserId(s),
);
```

### `store.files.getQuotaUsage()` — exact upload quota counters

Read the exact instance usage and limits plus the authenticated user's
attributed usage:

```typescript
const usage = await store.files.getQuotaUsage();
// usage.instance: { bytes, count, limitBytes, limitCount }
// usage.user: { userId, bytes, count }
```

Client code can inspect only the acting user's usage. Backend actions can call
`ctx.files.getQuotaUsage({ userId? })` when they need to inspect another user.
The publish-time platform check remains authoritative if concurrent uploads
race a client-side preflight.

### `store.files.upload()` — managed file uploads

The store handle returned by `Poe.setupStore()` carries a `files` namespace
for uploading user files (photos, attachments) into the instance's own store.
The scaffold's canonical `InferSyncedStoreClient<YourSchema>` type describes
this complete handle, including `files`; do not manually intersect a second
extension type or inspect generated declaration files.
Uploads are **app-controlled**: they work only when your schema declares the
reserved `_requestUploadUrl` action and your backend implements it (see
[backend-api.md](backend-api.md#_requestuploadurl--app-controlled-uploads)) —
that handler is your policy gate, run server-side before every upload.

```typescript
const file = await store.files.upload({
  data: photoBlob,               // Blob | Uint8Array
  name: "capture.jpg",           // optional display metadata
  contentType: "image/jpeg",     // optional hint; bytes are inspected anyway
});
// file: { status: "staged", fileId, fileKey: null, url: null, ... }
```

Enforce app rules (one per day, one per round) in the MUTATOR that claims the
`fileId` — it is the authoritative gate anyway; the grant handler only sees
`{ fileId, sizeBytes, name? }` and should gate what must be decided before
the bytes upload, like a size cap (see
[backend-api.md](backend-api.md#_requestuploadurl--app-controlled-uploads)).

`upload()` resolves after the host has durably staged the bytes and its
background upload task. It returns a usable `fileId` immediately; subsequent
mutations may reference that ID, and the store's push queue waits for
publication before sending them. The file is NOT yet retained: write
`file.fileId` into a table field declared under that table's `fileRefs` so the
platform derives the `$files` claim row and keeps the bytes alive. An upload
that no row ever claims expires.

Local staging accepts up to 60 files or 256 MiB per store. Browser staging also
limits the signed-in account to 100 files or 256 MiB across stores and tabs
on the same browser profile and origin. Exceeding either limit rejects
`upload()` without evicting pending files. Published files awaiting claim
settlement still occupy staging capacity.

`await store.files.uploads.get(file.fileId)` reports local staging or terminal
failure state. It returns `null` after successful publication. Use it to render
an upload failure UI; do not wait for publication before creating the claiming
mutation.

`failure.reason` is one of these values:

- `network` — the last attempt got no usable server answer.
- `server_error` — the server answered with a 5xx error.
- `rate_limited` — the platform rate limit applied.
- `uploads_disabled`, `denied_by_app` (+`appCode`), `quota_exceeded`,
  `file_too_large`, `not_authorized`, `invalid_request` — the platform or your
  handler refused the upload.
- `integrity`, `expired`, `too_many_attempts` — the staged bytes did not match,
  the stage aged out, or the retries ran out.

Show a generic message for a reason your app does not know, because new hosts
can add reasons. Use `failure.retryable`, not the reason, to decide whether the
upload is still retrying. Do not show the raw reason string to players.

```typescript
// schema.ts — declare the claim field:
tables: {
  submissions: {
    schema: table(z.object({ fileIds: z.array(z.string()) })),
    fileRefs: { strong: ["fileIds"] as ["fileIds"] },
  },
},
// then claim from a mutator:
await ctx.table("submissions").set({
  itemKey: key,
  value: { fileIds: [file.fileId] },
});
```

**Persist only `fileIds` in your rows — never a URL.** Mutator args are
client-controlled, so a URL column would let any member display bytes that
bypassed the pipeline. Resolve the display URL at render time instead:

### `store.files.url(fileId)` — resolve a claimed file's display URL

```typescript
const src = await store.files.url(submission.fileIds[0]);
```

The host first reads local staged or cached bytes. A cold read downloads and
verifies the authoritative file, then attempts bounded cache admission. The
returned display URL belongs to this client and remains usable until explicit
disposal, including after disk eviction. Public and `privateOfUser(self)` claims
resolve; the uploader can also resolve their own unclaimed or server-only
upload. Other members need a visible claim.

Use `store.files.url(fileId, { target: "external" })` for an HTTP URL passed to
a document opener or another process. Store file IDs in rows, since display
URLs are local to a client and serving origins may change.

Failures reject with a `FileUploadError` (import `isFileUploadError` from
`poe-tiles-sdk/v1/client.js`) carrying a typed `code`:

- `uploads_not_enabled` — the schema declares no `_requestUploadUrl` handler.
- `upload_denied_by_app` — your handler threw an `ActionError`; its bounded
  code rides `error.appCode` (e.g. `"photo_too_large"`).
- `quota_exceeded` identifies the quota in `error.quotaScope`. `"instance"`
  means server quota. `"store_staging"` and `"device_staging"` mean local
  staging capacity. Local staging errors include a readable message and
  `retryable: true`; retry after pending uploads settle and free capacity.
- `rate_limited`, `file_too_large` — other platform limits.
- `idempotency_conflict` — the `fileId` belongs to a different uploader.
- `uploads_disabled` / `upload_failed` — deployment or transient failures
  (`error.retryable` says whether re-invoking `upload()` may succeed).

Uploads resolve after durable local staging and run under the host coordinator,
including while offline or after a tile closes. The current SDK Node
environment uses memory for file caches and the task ledger, so pending uploads
and cached bytes do not survive a process restart. Claim mutations remain
optimistic until publication permits their server push. Inspect pending or
failed work with `store.files.uploads.get(fileId)`, and retain the draft until
its claim is confirmed. Downscale camera photos before uploading, since grant
handlers commonly cap `sizeBytes`.

### `store.files.loadFile(fileId, options)` — load a file

Added November 2026; requires SDK/kernel 64 or later. Check
`Poe.has("store.files.loadFile.url")` on older hosts.

```typescript
const { url } = await store.files.loadFile(fileId, {
  cachePriorityKey: row.sortKey, // optional
});
const once = await store.files.loadFile(fileId, { cache: false });
```

| Parameter | Type | Required | Meaning |
| --- | --- | --- | --- |
| `fileId` | `string` | yes | A claimed file ID from your rows. |
| `cachePriorityKey` | `string \| number` | no | Keeps the file in the device cache longer; larger keys are kept longest. |
| `cache` | `false` | no | Load without adding the file to the device cache. Cannot be combined with `cachePriorityKey`. |

Returns `Promise<{ url: string }>`, where `url` is a device URL for the
downloaded bytes (for an `<img src>`, a `fetch`, or a download link). The file is read from the device
when it is there and downloaded otherwise; by default it is then kept in the
device cache so it loads offline later. Use `cache: false` for a file you show
once, so it does not take cache space from files you want to keep. Bytes
already on the device are still used.

The device may evict files from the cache under cache pressure. Keyed files are
kept over unkeyed ones, and larger keys are kept longest, so the row's
`sortKey` keeps recent rows' files over older ones.

### `store.files.loadImage(fileId, { size })` — load a resized image

Added November 2026; requires SDK/kernel 64 or later. Check
`Poe.has("store.files.loadImage.url")` on older hosts.

```typescript
const { url } = await store.files.loadImage(fileId, {
  size: "small", // optional; omit for the original
  cachePriorityKey: row.sortKey, // optional
});
```

| Parameter | Type | Required | Meaning |
| --- | --- | --- | --- |
| `fileId` | `string` | yes | A claimed file ID from your rows. |
| `size` | `"thumbnail" \| "small" \| "medium" \| "large"` | no | The image width to load: 128, 384, 768, or 1536 pixels. Omit it for the original image. |
| `cachePriorityKey` | `string \| number` | no | As for `loadFile`. |
| `cache` | `false` | no | As for `loadFile`. |

Returns `{ url }` like `loadFile`, a device URL for an `<img src>`. Each size is an
exact width in image pixels; it is not scaled by the screen's pixel density, so
for an image shown 192 CSS pixels wide on a 2x screen, pick `small`. The image
keeps its aspect ratio and is never upscaled (a source narrower than the size
comes back at its own width), and a larger copy already on the device may be
returned instead of downloading a new one. Without `size` it loads the
original, like `loadFile()`. `STORE_IMAGE_SIZE_WIDTHS` from
`poe-tiles-sdk/v1/shared.js` maps each size to its width.

A resized load rejects when the image is not on the device and cannot be
downloaded, or when the source is not a JPEG, PNG, or WebP image; fall back to
`store.files.loadFile()`. `store.files.cache.unpin(fileId)` removes the
original and every resized copy.

`store.files.imageUrl(fileId, { displayWidth })` is deprecated: it loads the
image the same way, but multiplies `displayWidth` by the pixel density and
rounds up to the next width. Use `loadImage` with a `size`.

### Recording which configuration produced an agent reply

If your app triggers agents (`Poe.agents.*`) and stores their replies, you can record the configuration each run actually executed on — the model, the tools it was allowed, the tool→model bindings, and which of those a per-trigger override replaced.

This is worth storing rather than looking up later, for two reasons: an agent's configuration is **overwritten in place with no history**, so editing it retroactively changes what every past reply appears to have been generated with; and a per-trigger override (`modelOverride` / `enabledTools` / `toolModels`) is **never persisted anywhere**, so it is unrecoverable once the run ends.

```typescript
import {
  type EffectiveAgentRunConfig,
  parseEffectiveRunConfigPlain,
} from "poe-tiles-sdk/v1/shared.js";
```

Declare the field on the row that stores the reply. Use `z.custom` for the type — do **not** import a Zod schema for it, because a schema reachable from your mutators lands in your app's eager bundle:

```typescript
// schema.ts
generationConfig: z.custom<EffectiveAgentRunConfig>().optional(),
```

Then validate at the boundary where the snapshot arrives, and write it **once**:

```typescript
// In the mutator that records the reply. No `undefined` guard is needed —
// `parseEffectiveRunConfigPlain` returns null for an absent or malformed value.
const generationConfig = parseEffectiveRunConfigPlain(input.generationConfig);

// Spread only when non-null — see the two rules below.
await ctx.table("messages").set({
  /* … */
  ...(generationConfig !== null ? { generationConfig } : {}),
});
```

Two rules to follow, both of which are easy to get wrong:

- **`null` means NOT RECORDED — never "the agent's current configuration."** A row written before you added the field, a reply from something that is not an agent, and a run that failed before resolving a configuration all read as `null`. Rendering any of them as the live configuration reintroduces exactly the problem this solves. The same applies one level down: a field missing from a snapshot whose `v` predates it is also not-recorded, so never `??` a default onto a snapshot field.
- **Write it on create only, and never rewrite it.** The snapshot cannot change within a run, so a later dispatch carrying one should be ignored. That is what makes the record trustworthy — and it means a retried run keeps the original.

`parseEffectiveRunConfigPlain` returns `null` instead of throwing, on purpose: a malformed snapshot should cost you the provenance record, never the reply it annotates. It is deliberately Zod-free so it is safe to call from a mutator.

## Platform Helpers

Small utilities for detecting or configuring the runtime environment. Safe to call from any Joiner tile entry.

### `resumeAudioContext()`

Resume a Web Audio context after a normal browser suspension or an iOS system-audio interruption such as an alarm or phone call. WebKit reports the non-standard state `"interrupted"`; checking only for `"suspended"` leaves the context silent until the tile is reopened.

Call the helper before scheduling a sound on a reused context. It is a no-op for running or closed contexts and contains resume failures because optional audio feedback must not interrupt input.

```typescript
import { resumeAudioContext } from "poe-tiles-sdk/v1/client.js";

const context = new AudioContext();
function playCue() {
  resumeAudioContext(context);
  // Create and start this cue's AudioNodes.
}
```

The helper also covers a newly-created context that starts suspended, but it does not bypass autoplay policy: create or resume audio from a user gesture when the browser requires one.

<!-- Keep this explicit ID: GitHub and VitePress generate different heading slugs. -->
<a id="render-budget"></a>

### `createRenderBudget()` / `resolveRenderBudgetDefaults()`

Every continuous-render tile (a `requestAnimationFrame` loop that redraws a canvas every frame) should adopt the platform render budget. It applies the platform power defaults — a 60 fps render cap on mobile-like clients (desktop stays uncapped), a device-pixel-ratio cap of 1.5 on mobile (2 on desktop), no antialiasing or soft shadows above DPR 1, and the default WebGL `powerPreference` — and it reports detailed render stats (fps, missed frames, render CPU, draw calls) that the platform uses to find battery-hungry tiles. On lab hardware the DPR + fps defaults cut rendered pixels by ~59% on a high-refresh Android phone with no visible quality loss. They are defaults, not an enforced ceiling: a tile that knows its workload can override them (see "Quality overrides" below).

**If your tile owns its render loop** (plain canvas 2D, three.js, raw WebGL), create a budget and let it drive renderer construction and the frame gate:

```typescript
import { createRenderBudget } from "poe-tiles-sdk/v1/client.js";

const budget = createRenderBudget({
  canvas, // prices each rendered frame for the pixels metric
  getDrawCalls: () => renderer?.info.render.calls, // three.js only; omit for canvas 2D
});
const renderer = new THREE.WebGLRenderer({ canvas, ...budget.rendererOptions() });
budget.configureRenderer(renderer); // applies the DPR cap + shadow downgrade

function loop(now: number) {
  // The gate skips RENDERING only. Keep simulation and input handling at
  // full rAF cadence (with your usual dt clamp) so a skipped frame never
  // desyncs game state.
  const renderThisFrame = budget.shouldRenderFrame(now);
  stepSimulation();
  if (renderThisFrame) {
    budget.renderFrame(() => renderer.render(scene, camera));
  }
  requestAnimationFrame(loop);
}
```

**Static scenes:** when your loop keeps ticking but the scene needs no repaint, call `budget.shouldRenderFrame(now, { idle: true })` before returning. It returns `false`, continues tick accounting and periodic telemetry, and ends the previous render interval so resuming does not count intentional idle time as missed frames. Resume the ordinary gate call as soon as input, simulation, a resize, or another invalidation requires a repaint. Keep simulation and input processing active during idle ticks.

This is the single biggest battery lever a canvas tile has, and "static" includes more screens than it sounds: the **menu / title screen, the game-over card, pause and how-to overlays, and any time host chrome covers the tile**. Players spend a large share of every session on those screens, and a loop that keeps redrawing them at 60 fps costs nearly as much as active play. Measured on a 2D canvas game on real phones, idle-gating the menu and game-over screens cut the tile's power on those screens by 30–48%, with one ambient frame every ~250 ms keeping the scene alive; return to full rate for about a second after input or a phase change so transitions stay smooth.

**Fewer frames before cheaper frames:** the cost of a canvas frame is mostly *producing and presenting a full-screen frame*, more than what is drawn on it — a canvas that only clears itself 60 times a second still used about two thirds of a full scene's rendering thread time. So render fewer frames first, then make the drawing cheaper (offset-fill shadows instead of `ctx.shadow*`, a cached background layer instead of a per-frame full-screen composite, sprite caches), which is worth about 13% of gameplay power on one phone in our measurements (inside run-to-run noise on another) and nothing on idle screens, which should not be rendering anyway.

**A lower `targetFps` during play is not a substitute:** whether it saves power depends on the device's power management (it paid on one measured phone and not on another, so it cannot be assumed from the platform), and only a person can judge whether it still feels smooth, so leave that decision to the creator. A cap that is taken saves less on a busy page: the compositor produces a frame whenever anything on the page changes, so a HUD value written every simulation tick, or a CSS animation or transition running while playing, keeps the page at the panel rate regardless of the canvas gate, and the cap then saves only the canvas's own work. Write HUD values inside the render callback, at the canvas cadence, and drive play-time effects from the render step rather than CSS keyframes or transitions, keeping their look.

**Two related habits:** only write DOM properties (`hidden`, `style.transform`, text) when the value changed, since an unchanged write each tick still forces a style recalculation; and adopt the budget before sizing your canvas, because a `resize()` that runs before adoption pins the buffer to pixel ratio 1 without anyone noticing. You can check all of this in a browser: count render calls per second on each screen (about 4 while idle-gated, 60 during play), confirm `canvas.width` equals its CSS width times the budget's resolved `pixelRatio`, and watch the page's frame rate during play equal the canvas target rather than the panel rate.

**WebGL context loss:** when the budget's `canvas` is a real canvas element, the budget also watches it for `webglcontextlost` / `webglcontextrestored` and records the event for the platform's reliability telemetry. A reclaimed context (common in mobile WebViews under memory pressure) makes every GL call a silent no-op — the loop keeps running at full fps while the canvas turns transparent, so the player sees your page background and nothing else. Pass `onContextLost` / `onContextRestored` to show and clear a visible notice; three.js re-initializes its own GL state on restore, so hiding the notice is usually all the recovery a tile needs:

```typescript
const budget = createRenderBudget({
  canvas,
  onContextLost: () => showNotice("Graphics paused by your device…"),
  onContextRestored: () => hideNotice(),
});
```

Create ONE budget per document, not one per game round: the platform's power metric reads cumulative counters, so a fresh budget on every remount resets them mid-session and corrupts the tile's numbers. If your tile rebuilds its renderer across rounds or component remounts, use the SDK's shared-budget factory instead of managing the singleton yourself — `acquireSharedRenderBudget()` returns the document's one budget (creating it on first call), and `adoptSharedRenderBudgetRenderer(renderer)` re-points frame pricing, draw-call sampling, and the DPR cap at each freshly built renderer (`adoptSharedRenderBudgetCanvas(canvas)` is the flavor for canvas-2D tiles with no renderer object). Soft shadows: pick the shadow-map type from `budget.defaults.softShadows` instead of hardcoding `PCFSoftShadowMap`.

```typescript
import { adoptSharedRenderBudgetRenderer } from "poe-tiles-sdk/v1/client.js";

// In the mount path that (re)builds the renderer — every mount adopts the
// same document-scoped budget, so the platform's cumulative counters survive:
const budget = adoptSharedRenderBudgetRenderer(renderer);
```

**If an engine owns the loop** (Phaser), you cannot wrap the render call — map the resolved values into the engine's own config with the pure resolver instead:

```typescript
import { resolveRenderBudgetDefaults } from "poe-tiles-sdk/v1/client.js";

const defaults = resolveRenderBudgetDefaults();
const game = new Phaser.Game({
  ...(defaults.targetFps !== null ? { fps: { limit: defaults.targetFps } } : {}),
  render: { powerPreference: defaults.powerPreference },
  // ...rest of your config
});
```

Do NOT call `createRenderBudget()` from an engine-owned tile just to read `.defaults`: constructing a budget registers the helper as the iframe's render-stats producer and silences the platform's automatic instrumentation — if nothing then drives `shouldRenderFrame`/`renderFrame`, the tile stops reporting render stats entirely. `resolveRenderBudgetDefaults()` is side-effect free.

**If a tile does neither**, it still works and is still measured: the platform auto-instruments every tile with coarse render stats. But it renders unbudgeted — high-refresh Android panels run the loop at 90–120 fps and retina screens get uncapped-DPR buffers, both pure battery cost — and its telemetry stays coarse, so it shows up worse in the platform's per-tile power ranking without the detail to explain why.

#### Quality overrides

The resolved values are the platform's defaults, nothing more. A tile that wants different quality — a graphics-settings page, richer settings chosen from its own knowledge of its workload — passes explicit overrides, and the SDK honors them verbatim:

```typescript
const budget = createRenderBudget({
  canvas,
  maxPixelRatio: 3,   // raise (or lower) the DPR cap
  antialias: true,    // replace the resolved-DPR-based default
  targetFps: 30,      // change the frame-gate target; applies on desktop too
});
// The same options work on acquireSharedRenderBudget() (first call only)
// and on resolveRenderBudgetDefaults() for engine-owned tiles.
```

Prefer overriding through the budget over bypassing it: `shouldRenderFrame()` is also what counts frames and paces the platform's render stats, so routing around the gate corrupts your tile's telemetry, while an explicit `targetFps` keeps the whole instrument coherent (the gate paces against it, missed frames are judged against it, and the reported target reflects it). Overrides are stamped into the tile's power telemetry, so an opted-up tile shows up hotter in the fleet ranking *with the explanation attached* — never disguised as a regression.

Platform behavior worth knowing before overriding (documented, not enforced):

- **iOS WKWebView clamps `requestAnimationFrame` to ~60 Hz** even on 120 Hz ProMotion panels, so a higher `targetFps` there renders at ~60 while being truthfully judged against your request — expect a poor missed-frame ratio.
- **Android WebView runs rAF at the panel rate**, so targets above 60 are reachable only on high-refresh panels.
- **Sub-60 targets read as visibly choppy** on phones (the platform default is 60 for this reason).
- **`maxPixelRatio` above the device's real DPR buys nothing** — the resolved ratio is `min(device DPR, maxPixelRatio)`.

### `createVerticalScrollBounceMount()`

Create an inner render target inside a root element and opt the root into native vertical pull bounce, even when the app's content is shorter than the viewport. Use this for the normal iframe-document case where `#root` is the top-level scroll container.

Apps scaffolded from the official templates already call this in their entry file, so most apps do not need to add it manually.

```typescript
import { createVerticalScrollBounceMount } from "poe-tiles-sdk/v1/client.js";

const root = document.getElementById("root");
if (root) {
  const appRoot = createVerticalScrollBounceMount(root);
  renderApp(appRoot);
}
```

The helper clears `root` and appends one generated content wrapper on every platform. Inside the iOS app, it also applies vertical overflow/momentum styles to `root` and makes the wrapper at least `calc(100% + 1px)` tall. The 1px overflow is intentional: it is the smallest reliable amount needed for WKWebView to enter the native rubber-band path.

### `installVerticalScrollBounce()`

Opt a specific custom scroll area into native vertical pull bounce. Use this when only part of the app should bounce, such as a chat message list, while settings/invite/member panels should keep their own behavior.

```typescript
import { installVerticalScrollBounce } from "poe-tiles-sdk/v1/client.js";

const cleanup = installVerticalScrollBounce({
  scrollElement: messagesScroller,
  contentElement: messagesList,
});
```

`contentElement` must be a descendant of `scrollElement`. The helper returns a cleanup function that restores the previous inline styles. Outside the iOS app it validates the input and otherwise no-ops, so desktop, mobile web, and Android do not get a forced 1px scroll range. If the content later grows taller than the viewport, the same element remains the normal scroll container; no re-install is needed.

### `isIosApp()`

Returns `true` when running inside the iOS app WebView, including sandboxed app iframes. Use this only for behavior that depends on the native app shell; use [`isIosWebkit()`](#isioswebkit) for broader iOS WebKit checks.

```typescript
import { isIosApp } from "poe-tiles-sdk/v1/client.js";

if (isIosApp()) {
  // Native-app-only iOS behavior
}
```

### `isAndroidApp()`

Returns `true` when running inside the Android app WebView, including sandboxed app iframes. The Android counterpart of [`isIosApp()`](#isiosapp); use it for behavior that depends on the native Android app shell. (There is no `isAndroidWebkit()` — the Android WebView is Chromium, not WebKit.)

```typescript
import { isAndroidApp } from "poe-tiles-sdk/v1/client.js";

if (isAndroidApp()) {
  // Native-app-only Android behavior
}
```

### `isIosWebkit()`

Returns `true` when running in iOS Safari or WKWebView (including the iOS app). Use only for genuine platform differences — most code should be platform-agnostic.

```typescript
import { isIosWebkit } from "poe-tiles-sdk/v1/client.js";

if (isIosWebkit()) {
  // iOS-specific workaround
}
```

### `isMobileLikeClient()`

Returns `true` when the app is running inside the iOS or Android app **or** in a browser whose primary pointer is coarse (phones, tablets, touchscreen laptops in tablet mode). Returns `false` on regular desktops with a mouse and in Node / SSR contexts.

Use to gate UI that only makes sense on touch-primary devices — touch-only controls or mobile-specific install hints.

```typescript
import { isMobileLikeClient } from "poe-tiles-sdk/v1/client.js";

if (isMobileLikeClient()) {
  // Render the touch joystick.
}
```

### `applyNativeAppGestureOverrides()`

Suppress default browser gestures (text selection, the iOS callout menu, and native link-drag) inside the native app's WebView, so the app feels like a native mobile app. Opt-in per app — call once at app startup (e.g. in your entry file).

Inputs, textareas, and contenteditable elements are opted back in so users can still select and copy text they've typed.

No-op outside the native app WebView — desktop browsers, iOS Safari, and Android Chrome keep their default behavior. Idempotent.

```typescript
import { applyNativeAppGestureOverrides } from "poe-tiles-sdk/v1/client.js";

applyNativeAppGestureOverrides();
```

### `suppressLongPressMagnifier()`

Suppress the iOS long-press magnifier loupe on one element. No tile may show the loupe, so call it on every non-scrolling surface a finger can rest on — a game canvas, a board, a draggable piece, and also the HUD, buttons, and menus. Apply it per element; the exceptions are native scrollers, form fields, and links. One call on the nearest non-scrolling container covers a group of controls (the HUD, a menu, a button row).

`applyNativeAppGestureOverrides()` stops the selection callout and text selection, but on iOS it does **not** stop every round magnifier loupe WebKit shows once a still finger starts its text-selection gesture. For a plain long press, `-webkit-user-select: none` stops the loupe. A tap followed quickly by a long press bypasses that CSS and opens the loupe even over non-selectable content, so a press-and-hold-to-charge or drag interaction can pop a magnifier mid-play. WebKit withholds that gesture only when the page cancels `touchstart`.

Pass the surface element. The helper sets `-webkit-user-select`, `user-select`, `-webkit-touch-callout`, and `touch-action` to `none` on it. It lets touches through until the first tap in the tile ends (or the first real click lands), and cancels `touchstart` for every touch on the element after that. The first tap stays a real tap, so it still lifts the iOS 30 fps limit on tile frames, which only a real click can do. The cost: if the very first tap is followed at once by a hold, the loupe can still appear that one time. It returns a function that removes the listeners and restores the CSS (call it on unmount). Applies on all iOS WebKit; a no-op that returns a no-op remover elsewhere (Android, desktop, server).

**Scope it deliberately.** `touch-action: none` stops panning and zooming on the element, and a cancelled `touchstart` also loses the synthesized `click`. Use the plain call where input comes from `pointerdown` / `pointerup`, with no `click` handlers on the surface. An element that must scroll natively cannot use the helper at all.

**Surfaces with `click` handlers (`preserveTaps`).** If taps on the element run on `click` handlers (buttons, menus, tap-to-move board cells, tap-to-place racks — `click` is also how keyboard activation reaches `<button>` cells), pass `{ preserveTaps: true }`. Every quick still tap is then re-dispatched as a synthetic bubbling `click` at the touched element, so click handlers and framework event delegation keep working during rapid taps; when iOS also sends its own click for the first tap, the helper stops that duplicate before your handlers see it; holds and drags produce no click; mouse, keyboard, and non-iOS platforms are untouched. A re-created tap is a press of at most 500 ms that travels at most 10 px. Nested installs re-create one click per tap. The synthetic click is `isTrusted: false` and does not focus inputs — never point this mode at form fields or navigation links.

```typescript
import { suppressLongPressMagnifier } from "poe-tiles-sdk/v1/client.js";

// Pointer-driven canvas — plain call:
const canvas = document.querySelector("canvas")!;
const removeMagnifierSuppression = suppressLongPressMagnifier(canvas);

// Tap+drag board whose cells act on click — preserve taps:
const board = document.getElementById("board")!;
const removeBoardSuppression = suppressLongPressMagnifier(board, {
  preserveTaps: true,
});

// later, on teardown:
removeMagnifierSuppression();
removeBoardSuppression();
```

### `installKeyboardLayoutInset()`

Keep your app's layout above the iOS on-screen keyboard. On iOS the WKWebView does **not** resize when the keyboard opens — it just draws the keyboard on top of your content, so a bottom-anchored input or button ends up hidden behind it. Call this once at startup to opt in: the native shell then shrinks your scroll container (`#root` by default) by the live keyboard height, so the space the keyboard occupies is removed from your layout and bottom-anchored content stays visible. It animates in sync with the keyboard and is a **no-op outside the iOS app** (desktop, Safari, Chrome, Android are unaffected — they resize or scroll natively).

```typescript
import { installKeyboardLayoutInset } from "poe-tiles-sdk/v1/client.js";

installKeyboardLayoutInset(); // shrinks #root; call once at startup
installKeyboardLayoutInset({ selector: ".app-root" }); // custom container
```

Use it for a **full-viewport app that owns its own keyboard layout** — one with a scroll scaffold (`html, body { height: 100dvh; overflow: hidden }` and the container `overflow-y: auto`) and a docked input bar, like a chat composer. Registering also disables the WebView's native document scrolling while the app is mounted (so a drag with the keyboard up can't push your fixed chrome off-screen).

**Consequence — a non-docked input needs help.** Because registering suppresses WebKit's native scroll-to-focused, an input that lives in ordinary scroll flow (not docked above the keyboard) is no longer auto-revealed when it's focused — the keyboard will cover it. You have two options: dock the input's controls above the keyboard (a bottom bar that rides the shrunk container), or scroll them into view yourself with `createKeyboardFocusScroller()` below.

### `createKeyboardFocusScroller()`

The companion to `installKeyboardLayoutInset()` for the scroll-it-yourself case: it scrolls a focused input's controls above the keyboard. On focus it eases the scroll container each animation frame so the controls ride up **with** the rising keyboard (rather than the keyboard covering the input and the page snapping afterward), and a manual drag aborts it. It's a no-op where the browser's own scroll-to-focused already reveals the input, so it's safe to leave in for every platform.

Wire it to the element wrapping the input **and** its buttons (e.g. the `<form>`): attach `ref` to that element, `onFocusIn` as its focus handler, and call `dispose()` on unmount.

```tsx
import {
  createKeyboardFocusScroller,
  installKeyboardLayoutInset,
} from "poe-tiles-sdk/v1/client.js";
import { onCleanup } from "solid-js";

// once at startup:
installKeyboardLayoutInset();

// in the component that renders the input (SolidJS shown; same idea in React/Preact):
function GuessForm() {
  const scroller = createKeyboardFocusScroller();
  onCleanup(scroller.dispose);
  return (
    <form ref={scroller.ref} onFocusIn={scroller.onFocusIn} class="pb-4">
      <input placeholder="Your guess…" />
      <button type="submit">Guess</button>
    </form>
  );
}
```

Options: `scrollRoot` (element or getter; defaults to the `#root` element) and `maxDurationMs` (how long to keep tracking the keyboard's rise; defaults to 800). Add a little bottom padding (e.g. `pb-4`) below the last control so it doesn't sit flush against the keyboard.

## Framework Hooks

### React — `useLiveQuery` (`poe-tiles-sdk/v1/react`)

A React hook that subscribes to a live store query. Handles subscription lifecycle automatically and re-renders when data changes.

```typescript
import { useLiveQuery } from "poe-tiles-sdk/v1/react";

function App({ store }) {
  const { data: items, isLoading } = useLiveQuery(store, (tx) =>
    tx.table("items").entries().toArray(),
  );

  if (isLoading) return <div>Loading...</div>;

  return (
    <ul>
      {(items ?? []).map(([, item]) => <li key={item.id}>{item.text}</li>)}
    </ul>
  );
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `store` | `InferSyncedStoreClient<Schema> \| null` | The store to subscribe to. Pass `null` to get loading state. |
| `queryFn` | `(tx: QueryContext) => Promise<T>` | Query function run against a read transaction |

**Returns:** `{ data: T | undefined, isLoading: boolean }`

- `data` is `undefined` until the first query result arrives
- When `queryFn` reference changes, previous data is kept until new results arrive
- The hook automatically unsubscribes on unmount

### SolidJS — `createLiveQuery` (`poe-tiles-sdk/v1/solid`)

A SolidJS reactive primitive that subscribes to a live store query. Both parameters are accessors for fine-grained reactivity.

```typescript
import { Show, For } from "solid-js";
import { createLiveQuery } from "poe-tiles-sdk/v1/solid";
import type { InferSyncedStoreClient } from "poe-tiles-sdk/v1/client.js";
import type { MySchema } from "./synced-store/schema";

type MyStoreClient = InferSyncedStoreClient<MySchema>;

function App(props: { store: MyStoreClient }) {
  const { data, isLoading } = createLiveQuery(
    () => props.store,
    () => (tx) => tx.table("items").entries().toArray(),
  );

  return (
    <Show when={!isLoading()} fallback={<div>Loading...</div>}>
      <For each={data() ?? []}>
        {([, item]) => <li>{item.text}</li>}
      </For>
    </Show>
  );
}
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `storeAccessor` | `Accessor<InferSyncedStoreClient<Schema> \| null>` | Accessor returning the store (or `null` for loading) |
| `queryFnAccessor` | `Accessor<(tx: QueryContext) => Promise<T>>` | Accessor returning the query function |

**Returns:** `{ data: Accessor<T | undefined>, isLoading: Accessor<boolean> }`

- Both params are accessors — SolidJS tracks signal reads for automatic re-subscription
- `onCleanup` handles unsubscription automatically

### SolidJS — `createLiveQueryResource` (`poe-tiles-sdk/v1/solid`)

Suspense-aware sibling of `createLiveQuery`. It subscribes to the same live query shape, but exposes the initial result through a Solid `Resource`; later subscription results mutate that resource.

```typescript
import { For, Suspense } from "solid-js";
import { createLiveQueryResource } from "poe-tiles-sdk/v1/solid";

function App(props: { store: MyStoreClient }) {
  const { data } = createLiveQueryResource(
    () => props.store,
    () => (tx) => tx.table("items").entries().toArray(),
  );

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <For each={data() ?? []}>
        {([, item]) => <li>{item.text}</li>}
      </For>
    </Suspense>
  );
}
```

**Returns:** `{ data: Resource<T | undefined>, isLoading: Accessor<boolean> }`


### Retrying the current tile

*Added 2026-09-10.*

Import `requestTileReload` from `poe-tiles-sdk/v1/client.js`. Call it from an explicit Retry action when the current document cannot recover. The owning host remounts the same instance and open props in a fresh frame. This preserves stored history; disposable unsaved UI state is recreated. It does not request a bundle upgrade, migrate data, or clear caches.

```ts
const result = await requestTileReload();
if (result.status !== "accepted") {
  // Show result.message and let the user try again.
}
```

Disable Retry while pending. Repeated calls share one pending request. `accepted` means the host accepted the request, not that the replacement loaded. Other results are `unavailable`, `timeout` (no acknowledgement within five seconds), or `failed`, each with a user-facing `message`. Older hosts and unsupported nested wrappers time out with guidance to reload the page. The top document and a same-origin framed HTTP kernel shell can reload themselves; sandboxed iframe documents never navigate their own blob URL. The SDK's store access notice already uses this recovery action.

### Correlating mutation failures across retries

*Added 2026-09-29; `flushDelivered()` added 2026-09-30.*

Import `createMutationFailureObserver` from `poe-tiles-sdk/v1/client.js` when an interface keeps editable input while retrying a rejected mutation. Create one observer per store session. Supply `requests`, `matchesInput`, `isCurrent`, `hasAccepted`, and `onDiagnostic`. Capture immutable inputs and register the new request's deferred `identity` synchronously before validation or mutation creation; resolve it from the mutation result, or with `undefined` if creation fails.

All three request callbacks (`isCurrent`, `hasAccepted`, `onDiagnostic`) receive captured shallow copies of plain records. Compare stable key/epoch fields, never object identity; do not rely on prototype methods or fields assigned after delivery. Inputs must be immutable and structured-cloneable (unwrap reactive proxies before capture). Invalid inputs or throwing diagnostic callbacks produce no diagnostic and never establish acceptance.

Transient store retries do not produce request diagnostics. Commit contention (`optimistic_lock_conflict`) retains the write and retries with overload backoff indefinitely; it never consumes the refusal budget or produces an exhaustion diagnostic. Repeated `mutation_id_mismatch` and `schema_version_mismatch` refusals can exhaust that budget, causing the store to revert the mutation as a non-retriable `unexpected_error`. The observer can then emit a `current-attempt` diagnostic for a matching current request, alongside the separate stuck-mutation background error.

The host has exported the observer since runtime 47, but the current Vite plugin infers runtime 48 for every `createMutationFailureObserver` import from `poe-tiles-sdk/v1/client.js`, including observer-only use. Declare `poeTile({ minSdkVersion: 48 })` for that entry. The emitted minimum is the greater of the configured and inferred floors, so declaring 47 does not make the build compatible with runtime 47. `Poe.has(...)` cannot guard a missing named import.

For Vite-built tiles, importing `createMutationFailureObserver` from `poe-tiles-sdk/v1/mutation-failure-observer.js` bundles the portable helper into the tile. This subpath needs no host runtime upgrade; use an SDK package version that includes it.

When `hasAccepted` reads a store with optimistic changes, register a deferred `settled` promise on the request before invoking `mutate`, alongside the deferred `identity`. Resolve only the diagnostic gate with `settled.resolve(result.confirmed.catch(() => {}))`; this handles abandonment even if no failure event reaches the observer. The original `result.confirmed` retains its rejection and application handling; this derived gate does not convert abandonment into acceptance. If mutation creation fails, resolve the gate in `finally`. Do not assign `settled` after a failure has arrived: the observer captures the request at delivery. The observer waits for `settled` to fulfill or reject before checking current-request eligibility and authoritative acceptance, so an optimistic value cannot suppress a rejection diagnostic. Settlement means processing/rollback finished, not success; `hasAccepted` must still check authoritative application evidence. Omit `settled` only when that check cannot observe an in-flight optimistic write.

`current-attempt` diagnostics match both client and mutation IDs. `historical-request` means identity metadata is unavailable: the failure concerns this input, but may belong to an earlier attempt. Never clear newer input or declare the current attempt failed from historical evidence. `confirmed` means processed, not successful; use authoritative application evidence for `hasAccepted`. The observer never retries or changes application state. Dispose it when the store session ends. Absence of a diagnostic does not establish success, because sufficiently late failures can outlive the SDK's bounded recent-mutation cache.

`isCurrent` receives a shallow captured request. Compare its stable key and epoch (or equivalent caller-owned generation), not object reference equality.

A request record may also include `settled?: Promise<unknown>`, supplied by the caller as a completion-only gate. Follow the deferred-gate pattern above: `settled.resolve(result.confirmed.catch(() => {}))`, and resolve the gate if mutation creation fails. Keep the original `result.confirmed` rejection and application handling separate. The gate must finish only when that request's mutation lifecycle or caller-owned bookkeeping finishes; it does not certify acceptance. It is optional and is not supplied by the observer.

The callable disposer also exposes `await observer.flushDelivered({ key: request.key, epoch: request.epoch })`. It captures that selector and waits only for inspections already registered for that attempt; later failures and other attempts are excluded. The `key`/`epoch` pair must uniquely identify each tracked attempt; change the epoch for every retry, including a retry with identical input. An undefined epoch is one exact value, not a wildcard. Resolve that attempt's identity and settled promises first, then keep it current until the checkpoint completes. Never await it from those dependencies or an observer callback, which would wait on itself. The checkpoint does not prove acceptance or the absence of future errors. Call `observer()` to unsubscribe.

`flushDelivered()` requires SDK runtime version 48 or newer when the observer is imported from the client entry (`poe-tiles-sdk/v1/client.js`). The Vite import gate already enforces that floor for both observer-only and checkpoint use; the bundled portable `poe-tiles-sdk/v1/mutation-failure-observer.js` subpath needs no host runtime upgrade.

The no-argument `observer.flushDelivered()` is an advanced observer-wide checkpoint. It waits for every captured attempt, so **all** tracked identity and settled gates must be resolved before awaiting it—including any new retry that has not yet called `mutate`. Use the explicit selector when retiring one request.
