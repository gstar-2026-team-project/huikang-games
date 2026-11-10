# Schema Migrations

## The rule you must not break

**Once a tile has been published, any backwards-incompatible schema change requires a migration, shipped in the same change.** This is the single most-missed step. A bump without a migration is not a soft reset — it forces every existing client to clear its local data and dispose, which players experience as their in-progress game or room being wiped.

If you have changed `schema.ts`, ask: **would data written under the OLD schema still be valid under the NEW schema?**

- **No → backwards-incompatible → bump `TILE_SCHEMA_VERSION` AND write the migration.** You are here if you renamed a field, removed a field, changed a field's type or its allowed values, made an optional field required, changed how you compute `itemKey`/`sortKey`, split/merged tables, or changed the shape of any mutation's input.
- **Yes → backwards-compatible → do NOT bump the version.** Adding a brand-new table, a new mutator, or a new *optional* field (or a field with a default that old rows can omit) does not need a migration. Bumping needlessly would wipe instances for no reason.
- **Unsure → treat it as incompatible and write the migration.** The cost of an unnecessary migration is a few lines; the cost of a missing one is wiped user data.

Do not stop at bumping the version — the checklist for a live tile is:

1. Bump `TILE_SCHEMA_VERSION`.
2. Add the `migrations` entry with `migrateData` (and `migratePendingMutation` if input shapes changed).
3. Republish.

## When to bump the version

Only increment `TILE_SCHEMA_VERSION` for backwards-incompatible changes that require migrating existing persisted data or pending mutations. Adding a new mutator, a new table, or a new field with a default is backwards-compatible and does not need a bump. The version lives in its own constant file (set up from day zero — see [api-patterns.md](api-patterns.md)) so client and server read the same value without bundling Zod on the client:

```
tile-schema-version.ts   ← export const TILE_SCHEMA_VERSION = 2;
schema.ts               ← uses TILE_SCHEMA_VERSION in defineSchema()
client-config.ts        ← uses TILE_SCHEMA_VERSION in defineClientConfig()
```

When you bump the version WITHOUT a matching migration, existing instances reload into the new code, which cannot read the old-shape data still in local storage — so that data is discarded (`onSchemaVersionMismatch` fires and the client disposes/rebuilds). To a player this looks like their game or room was wiped. This is exactly why a migration is mandatory for any incompatible change to a live tile.

## How upgrades roll out to users

Publishing a new version does **not** instantly upgrade everyone who has the tile open. Understanding the rollout is what lets you set the right expectations with players.

**The lifecycle of one upgrade:**

1. **You publish** a new version (bumped `TILE_SCHEMA_VERSION` + migration). The new bundle is now the latest published version, but nothing has changed yet for anyone who already has an instance open.
2. **Running instances keep running the OLD code until the server notices the publish.** How fast that happens depends on the instance's connection state. An instance open **on someone's screen** (foregrounded, connected) is not idle at the protocol level — its presence heartbeats count as server activity, so the server notices the new version within about 30 seconds (a server-side version-resolution cache bound) with no user action. An instance in a **backgrounded or disconnected** tab produces no server activity, so nothing happens while it just sits there.
3. **For a backgrounded/disconnected instance, the upgrade waits for its next "activity" against the server**: opening/reopening the instance, reconnecting after the connection dropped, running an action, or returning the app to the foreground (which triggers a repair pull). At that point the server notices the newer published version.
4. **The migration runs once, server-side, at that moment.** The server runs your `migrateData` over that instance's stored data in a single atomic step and bumps the instance's stored schema version. (A pure read/pull without any such trigger does not migrate.)
5. **The still-open old-code client detects the bumped version and updates itself.** The tile shows an **"Update required"** dialog over just that tile and reloads it into the new version against the now-migrated data, with no tap needed (the same way the root manager shell updates itself). If the reloaded tile is still on an old version, the dialog offers **Try again** instead of reloading in a loop. A user opening the tile fresh after you published gets the new version from the start on a first-time device; a device that opened the tile before may serve its cached previous bundle for that one open (bundle resolution is cache-first for load speed) and goes through the same automatic update as soon as it connects.

**Why a change you published last night can show up as an automatic update this morning:** an instance you left open overnight was backgrounded and its connection dropped (device sleep / backgrounding), so it produced no server activity and never re-checked for the new version (step 2). When you foregrounded the app in the morning, the repair pull ran (step 3), which triggered the migration (step 4) and then the automatic "Update required" reload (step 5). It was not a fixed polling delay — the rollout to a backgrounded instance simply waits for the next activity.

**What to tell your players (expectation-setting):**

- New and reopened sessions get the new version right away — either from the start, or (on a device that cached the previous bundle) via the same automatic "Update required" reload on open. Long-lived open sessions update within about half a minute while foregrounded, or the next time they come back to the app. No player action is needed, but anything on screen that isn't saved in the store is lost in the reload.
- Because the migration runs once server-side and every client then reloads into matching code, players keep their data across the upgrade — provided you shipped the migration. Skipping the migration is what turns an upgrade into a data wipe.

## Recovering from a failed migration

If a migration fails, its changes are rolled back and the instance remains
at its previous schema version. Subsequent attempts retry the migration and
can keep blocking sync. To recover affected instances, fix the failing
migration step and
[publish a new build](#how-upgrades-roll-out-to-users)
that completes within the
[applicable limits](architecture-scaling-and-performance.md#store-size-and-row-operations).
Reloading alone will not resolve a migration that consistently exceeds those limits.

For example, if `1to2` fails, correct `1to2` rather than only adding `2to3`.
Keep the same target schema version if the intended schema is unchanged;
instances that already reached it do not rerun that migration. Make sure
affected instances follow the corrected build, updating their release
channel or version pin as needed.

## Defining a Migration

Provide migrations for each version step:

```typescript
import { defineMigration } from "poe-tiles-sdk/v1/backend.js";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const migration1to2 = defineMigration(v1Mutators, v2Mutators, {
  migrateData: async (ctx) => {
    // Transform existing data
    for await (const [key, value] of ctx.table("todos").scan().entries()) {
      await ctx.table("todos").set({
        ...key,
        value: { ...value, priority: 0 },
      });
    }
  },
  migratePendingMutation: {
    // Transform in-flight mutations from old clients
    addTodo: (args, emit) => {
      emit("addTodo", { ...args, priority: 0 });
    },
  },
});

const schema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION, // bumped to 2 in tile-schema-version.ts
  migrations: { "1to2": migration1to2 },
  // ...
});
```

Stream row-local rewrites with `for await` so the migration does not retain every
input value. Await writes before advancing; the migration still commits atomically.
Batching writes after an unlimited `toArray()` does not bound the initial read.
Use `toArray()` for explicitly limited pages or bounded collections that need a
snapshot, sorting, or cross-row analysis. If the migration changes storage keys,
preserve its original-row snapshot or design a cursor strategy that cannot revisit
inserted rows or skip moved rows; do not mechanically replace that snapshot.

## Pending Mutation Handlers

Each mutation handler in `migratePendingMutation` can:
- **Transform args** — call `emit()` with modified input
- **Rename** — emit a different mutation name
- **Drop** — don't call `emit()`
- **Expand** — call `emit()` multiple times to produce several mutations from one

## Common pitfalls

- **`for (const [key, value] of entries)` — `key` is an `EntryKey`, not a string.** `ctx.table(...).scan().entries()` yields `[EntryKey, JSONValue]` where `EntryKey = { sortKey, itemKey }`. Both `set` and `delete` accept `string | EntryKey`, so the natural patterns are `set({ ...key, value })` and `delete(key)` — no manual extraction needed. Never cast with `key as unknown as string`: it bypasses the type system, and against older platform versions it stored `"[object Object]"` as the literal `itemKey` and corrupted the row.
- **`migrateData` and the row's `value.sortKey` are not the same as the storage `sortKey`.** Some apps store a fractional-index `sortKey` inside the row's value (used for client-side ordering) **and** use a different sort key as the KV storage key (used for scan ordering). Be explicit about which one you mean; reread the schema before writing the migration's `set(...)` call.
