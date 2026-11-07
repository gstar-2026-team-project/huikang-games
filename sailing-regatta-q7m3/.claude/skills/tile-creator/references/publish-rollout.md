# Publish rollout: going live and when players get the update

**Whether an upload goes live immediately is the live channel's follow-latest
preference, ON by default.** Every `poe-tiles tiles upload` records a new
version in your tile's version history. While **live** follows the latest
version (the default), the same upload also points live at the new version, so
players start getting it right away. Pin live to a version when you want a
deliberate upload-then-promote workflow: uploads then only record the version,
and `live` moves only when you explicitly promote (or `deploy`).

```
poe-tiles tiles upload                  # records a version; live follows it while the preference is on
poe-tiles tiles auto-advance <tile> off # pin live: uploads stop going live until you promote
poe-tiles tiles deploy                  # upload AND make THAT build live even while live is pinned
poe-tiles tiles promote <tile> <version> # point live at a version (promote or roll back)
poe-tiles tiles channels <tile>         # see which version each channel serves
poe-tiles tiles versions <tile>         # version history, with channel markers
```

(`tiles publish` is the upload command's old name and still works as an alias.)

You can also name and annotate the version you're uploading —
`--version-name "Beta 2"` and `--version-notes "What changed"` label the new
version in the tile page's history (notes default to your `--change-summary`),
and `poe-tiles tiles edit-version` edits them later.

The tile's page in the app mirrors all of this in its **Tile Versions** tab:

- The **Release Channels** card lists `live` plus your custom channels. Each
  row shows what it currently serves — `Pinned to version: "…"` or
  `Follows latest version ("…")` — with an **Open channel** button and a
  `⋯` menu holding **Change version** (a picker whose leading
  **Follow latest version** option is the same preference as
  `tiles auto-advance`; picking a version pins the channel there) plus
  **Rename** and **Delete** for custom channels. **Add channel** creates a
  custom channel at the current live version.
- The **Version History** card lists every published version with channel
  badges, an **Open preview** button (see below), and a `⋯` menu holding
  **Edit** (rename the version, edit its notes) and the directional live move
  (**Make this version live** / **Roll back live to this version**). An
  explicit live move pins live — its follow-latest preference turns off, so a
  later upload can't silently undo your promote or rollback.
- **Publishing from the app (in-app Edit/Remix)** follows the same
  follow-latest preference as CLI uploads.

## Going live while live is pinned

With live pinned (follow-latest off), going live is a separate, deliberate
step:

- **`poe-tiles tiles upload`** records the new version and leaves `live` where
  it was. Nothing your players run changes.
- **`poe-tiles tiles deploy`** does the same upload and then points `live` at
  the new version in one step — an explicit promote that overrides the pin for
  this upload only.
- **Promote later** once you've tested the build:
  `poe-tiles tiles promote <tile> <version>`, or **Make this version live**
  from the version row's `⋯` menu on the tile's page. Rolling `live` back to
  an earlier version works the same way.

<a id="test-on-staging-in-the-app"></a>

## Previewing an exact version (one tap, nothing created)

Every version in the **Version History** card has an **Open preview** button.
It opens that exact build's tile info — play it, invite a tester into the room
it launches, or run a multiplayer simulation — completely isolated from the
players on `live`, and pinned permanently to that one version. No channel is
created and nothing is written anywhere until you actually launch a room from
it: the preview identity derives from the version itself.

1. `poe-tiles tiles upload` your new build (it lands in Version History).
2. Open the tile's page, its **Tile Versions** tab, and tap the new version's
   **Open preview**, then **Play Now**. This drops you into a fresh room
   running exactly that version — a real, playable room, not a mock.
3. Play it, and **invite a friend** into that room to test the multiplayer
   parts together. Nobody on `live` sees this room, and nothing you do in it
   touches the live players' games.
4. When it's ready, **promote to live** (the version row's `⋯` menu or
   `poe-tiles tiles promote`).

A preview room is addressed by its own version-scoped identity, so its rooms,
leaderboards, and saved data never mix into the live tile's — testing a build
can't corrupt or pollute what your players see.

## Custom channels: a named, movable pointer

Reach for a **custom channel** (e.g. `beta`) when you want a named pointer you
manage deliberately — share one test surface with friends, hold it on an older
build, or have it follow every upload. Custom channels are not discoverable
on the platform; only people you point at them run them. Manage them from the
Release Channels card, or from the CLI:

```bash
poe-tiles tiles set-channel <tile> beta 5      # create/point a custom "beta" channel at version 5 (manual)
poe-tiles tiles set-channel <tile> beta 6 --auto-advance  # make "beta" follow the newest upload
poe-tiles tiles delete-channel <tile> beta     # remove a custom channel
```

- A channel row's **Open channel** opens that channel's build the same
  isolated way as a version preview — play it, invite testers, or run a
  simulation — except the rooms follow the channel: repointing the channel
  moves them to the new build.
- `live` is the only reserved channel name. `set-channel` refuses it; live moves through the
  promote paths (`tiles promote`, `tiles deploy`, follow-latest, or the
  version row's live move), which carry the schema-downgrade guard below.
- `staging` is an ordinary custom channel name. The automatically maintained
  staging channel was retired; creators can create, repoint, and delete their own.
- A brand-new custom channel starts manual (pinned); `--auto-advance` — or the
  picker's **Follow latest version** — opts it into following each upload.
- Renaming a channel is display-only: rooms address the channel by its
  permanent name, so they keep working across renames.

## Pinning a room to a version (creator-only)

A preview or channel room is isolated by design — but sometimes you want to
run a specific build in a **real room**, with its real players and saved data
(compare an old build against the current one, or hold one room back while the
fleet moves on). If you are the tile's creator **and a member of that room**,
open the room's settings sheet (tap the room title) and use **Pin to tile
version**:

- Picking a **version** pins the room to that exact build — code only; the room
  keeps its identity, members, data, leaderboards, and analytics. Everyone in
  the room gets the pinned build (your view reloads immediately; others pick it
  up within seconds or on their next open), and a version badge appears in the
  room header so nobody mistakes it for the live build.
- A pinned room does **not** change when you upload; it stays on that version
  until you change it.
- Picking **Latest** unpins the room, returning it to the normal fleet
  behavior.
- Only you (the creator) see the control, and only in rooms you are in. A pin
  that would roll the room's data schema backwards is refused with
  `SCHEMA_DOWNGRADE_BLOCKED` — like the promote guard below, a room migrated
  forward can't run a build from before a schema bump.
- Rooms pin **versions only** — a pin can't make a room follow a channel it
  doesn't already encode (a room that silently changed builds whenever a
  channel advanced would be too easy to forget about). For channel-following
  test sessions, use a custom channel's isolated rooms above.
- **Scoped rooms are pinnable too**: inside a channel test room or a version
  preview room, the same control pins that one room to an exact version,
  overriding its channel or baked-in version. Unpinning returns it to the
  room's default — the channel's current version, or the preview's version —
  rather than to `live`.

Use a preview or channel room when you don't want players affected; use a pin
when affecting that room is the point.

## Rolling back across a schema change (coming once schema versions are declared)

This is the **intended** behavior once an upload declares its synced-store schema
version — it is not a guarantee you can rely on yet, because uploads don't
emit their schema version today.

The idea: if a version changed the shape of saved data (you bumped
`TILE_SCHEMA_VERSION`), you can promote *forward* to it, but you won't be able to
later roll `live` *back* to a version with an older schema — those saved
games/rooms have already migrated forward, and synced-store migrations are
one-way. Once schema versions are emitted, such a promote is refused with a
`SCHEMA_DOWNGRADE_BLOCKED` error rather than silently stranding player data, and
you roll forward to a fixed version instead. Until schema versions are emitted,
this downgrade guard is inert, so don't rely on it to protect player data yet.

## Once a version IS live, when do players get it?

Read [player update behavior](../../poe-tiles-cli/references/player-updates.md) for device caching, reloads, schema changes, and creator-device behavior. The upload and promotion rules above decide which version is live; the shared reference explains when players receive it.
