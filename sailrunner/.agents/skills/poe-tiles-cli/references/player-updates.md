# When players receive a tile update

Use this reference to explain which version a player sees; it does not authorize an upload or a promotion. Follow the host's publishing rules. For a preview pinned to an exact version, first check that the player opened the latest preview link: that link stays on its recorded version. The live-version behavior below applies when the player opens a tile that follows live.

Promoting to live doesn't switch everyone at the same instant — a tile always
opens from whatever is already on the player's device so it starts instantly,
instead of making them wait while it checks for a newer version. So the update
reaches people quickly, not instantly. Never tell a creator "everyone has it now"
after an upload, deploy, or promotion.

| The player's situation | When they get the newly-live version |
|---|---|
| They have never opened your tile on this device | **Right away.** Nothing is saved on their device yet, so it downloads the live version. |
| They have opened your tile on this device before | **On their next open after this one.** To start instantly, the tile opens the copy already saved on their device — the old version — and downloads the live one in the background while they play. The following open uses it. |
| Your tile is open on their screen right now | **Only when they go get it, and only once their session notices.** Nothing interrupts them and no prompt appears; they keep playing the version they opened. Once their running session detects the new version (a `client_bundle_id_mismatch` on the synced-store connection — not immediate), they can tap the tile's title to open its settings and tap **Reload tile**. Until then that row isn't there. They can also just leave the tile and open it again, which puts them back on row two above. |

A few things that are always true:

- **A compatible update never swaps versions out from under someone mid-play.**
  When the saved-data shape is unchanged, players finish what they're doing and
  reload when they choose.
- **One exception, and it's the important one:** if the newly-live version changed
  the shape of saved data (you bumped `TILE_SCHEMA_VERSION`), the old version
  can't keep syncing, so the tile updates itself without waiting for a tap. The
  player sees an **"Update required"** dialog over just your tile while it
  reloads into the new version — including on that first open in row two
  above. Anything on screen that isn't saved in the store (a half-typed draft,
  say) is lost in that reload. If the reload still lands on an old version, the
  dialog offers **Try again** instead of reloading in a loop. This is why a
  [migration](../../synced-store/references/schema-migrations.md) matters: it's
  what carries their existing games and rooms across the change instead of
  wiping them.
- **If the tile is closed, or open but sitting in the background**, nothing
  happens until they come back to it. That's why a promote at night doesn't start
  reaching people until they open the tile again the next day.
- **Your own device is a special case.** Promoting tells your own devices right
  away, so your next open is always the live version. While you have the tile open,
  a **Reload to update** button also appears in the top bar — that one is
  creator-only, so don't read it as something your players get: their only
  in-session path is the **Reload tile** row in tile settings, and only once their
  session has noticed the new version.
