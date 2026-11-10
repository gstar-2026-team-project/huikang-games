# Battery and heat report

`poe-tiles tiles power` reads the platform's 7-day battery and heat report for
a tile you own: a verdict, the reason codes behind it, and the measurements it
rests on. It is the same report the creator sees on the tile's dashboard as
"Battery and heat", so read it before you explain or fix a battery finding.

## When to run it

- The creator says their phone gets hot or the battery drains while playing,
  asks whether the tile is efficient, or arrives with a battery finding from the
  dashboard.
- Before a performance fix, to know which reason to chase, and on a later turn,
  to see whether the published fix moved the current build.

Do not run it to decide how to build a new tile: the build-time rules are the
render-budget and motion rules in the skill, and a new tile has no sessions to
report on.

```bash
# In a Creator session (POE_TILES_PUBLISH_TOKEN is set): the session's own tile.
poe-tiles tiles power
poe-tiles --json tiles power

# Anywhere else, signed in: one tile you own, or every tile you own.
poe-tiles tiles power myuser/my-tile
poe-tiles tiles power
```

In a Creator session the command reads only the tile the session publishes; it
needs a published preview first, and naming any other tile is refused as "not
one of your tiles". Use `--json` when you need a measurement the human output
leaves out, such as `auto_share`, `override_share`, or the render-loop context
numbers.

## Reading the verdict

| Verdict | Meaning |
|---|---|
| `hot` | An outcome is well above the typical tile: Android current at least 1.5× the typical tile's, or the iPhone warm-up share at least 5 points above it. |
| `watch` | An outcome is above the typical tile (1.2×, or 2 points), or a structural reason fired. |
| `ok` | At least one outcome is measured and none is above the typical tile. |
| `insufficient_data` | No outcome can be judged yet: each one is under its sample floor, waiting for the typical tile's baseline, or counted but not computed yet. A tile played only in a browser, on a phone or a desktop, never gets an outcome: the battery outcomes come from the Joiner phone apps alone. Render measurements count browser sessions too, so such a tile can still read `watch` from a structural reason. |
| `not_computed` | The tile has enough sessions, but the hourly refresh has not computed its numbers yet. Check again in an hour. |

The verdict compares the tile with the typical tile across the platform, on
whatever phones each was played on, at whatever brightness and starting
temperature. It is a signal to investigate, not a measurement of the tile
alone. Confirm a cause in the code before you claim one.

## Reason codes

Each reason is a finding about this tile. Fix the cause the code points at;
never fix a reason by lowering quality the creator did not ask to lower.

| Reason | What it measured | What to inspect | Fix |
|---|---|---|---|
| `android_current_high` | The Android phone's median current draw while running the tile, against the typical tile's. | A render loop that runs on menus, game-over, and pause screens; a loop that runs while the tile is hidden; per-frame canvas cost; a drawing buffer above the budget's pixel ratio; timers and CSS animations that never stop. | Adopt the render budget, go idle on static screens, pause on the foreground signal, and keep frames cheap, as the skill's render-budget and motion rules say. |
| `ios_thermal_escalation` | Of iPhone sessions that started cool, the share that warmed up (thermal state fair or worse), against the typical tile's. | Sustained GPU or CPU load: the same causes as above, held for long sessions. | The same fixes. Sustained load matters more than peaks here. |
| `uncapped_pixel_ratio` | The median drawing-buffer pixel ratio on phones is above 1.6, while the platform's mobile cap is 1.5. | A canvas sized by `window.devicePixelRatio` rather than the budget's resolved `pixelRatio`; a `maxPixelRatio` override; an engine's resolution setting not driven by `resolveRenderBudgetDefaults()`. | Size every buffer by the budget's `pixelRatio`. If the tile raised `maxPixelRatio` on purpose, that explains the finding: ask the creator whether the sharper image is worth the battery, and keep their answer. |
| `missed_frames_high` | On the render budget, at least a quarter of sessions (the p75) miss at least a quarter of their frames. | Expensive frames: per-fill `shadowBlur`, full-screen `globalCompositeOperation` passes, paths rebuilt every frame, many draw calls. | Cache static art, bake effects into an offscreen layer, and draw shadows and glows as plain shapes. Do not lower `targetFps` on your own. |

`uncapped_pixel_ratio` and `missed_frames_high` are structural: they describe
the tile's own buffer and frame budget, can raise `watch` but never `hot`, and
appear before the battery outcomes have enough sessions. Unlike the battery
outcomes, they count browser sessions as well as the phone apps: pixel ratio
counts every phone-sized session, and missed frames every session whose frame
rate the render budget caps: phones by default, and desktop only when the tile
sets `targetFps` itself.
Phones in Low Power Mode are left out of missed frames: iOS then holds
animation near 30 fps whatever the tile does.

## Context codes

Context codes never change the verdict. They narrow down where to look.

| Context | What it says | What it cannot say |
|---|---|---|
| `unbudgeted_render_loop` | Most sessions ran without the render budget and redrew a large area at a high pixel rate. | Whether the loop is needed. A static canvas with a live loop reads high too; that is the case to fix. |
| `quality_override` | Most sessions on the render budget overrode a quality setting (`maxPixelRatio`, `antialias`, or `targetFps`). | Overrides in an engine-owned tile (Phaser, for example) are not recorded, so the absence of this code does not rule one out. |
| `dom_animation_suspected` | An outcome reason fired and the tile draws no canvas. | Which animation. Run `bun run render-check` with the tile's persistent screens classified `idle` and reached in the fullest state a player can own, read its `frames/tick` and `anims` columns and the `many_running_animations` finding, then list `document.getAnimations()` on that screen to name the loops. The cost is compositing, not script: sandbox CPU time stays low on a tile that heats phones, so do not judge a fix by it. |

## Freshness, rotation, and the typical tile

- The report covers the last 7 days and is rebuilt every hour. The header's
  `Generated` time is when; `stale` means the hourly refresh has failed for
  more than two hours and the numbers are older than usual.
- Up to 50 tile/client builds are recomputed each hour, oldest first. When the
  header says `Rotating`, a build's `Computed` time can be older than `Generated`: its
  numbers are carried forward from that hour.
- The `Typical tile` line is the baseline every outcome is compared with. While
  it has too few sessions itself, an outcome reads "waiting for the baseline"
  and cannot raise a reason.

## Sample floors

- An outcome (Android current, iPhone warm-up) needs 30 sessions; a structural
  measurement (pixel ratio, missed frames) needs 10. Below the floor the number
  is withheld and the report shows the count toward it, such as "12 of 30
  sessions".
- Both the weighted sample count and the raw row count must reach the floor, so
  the count shown is the smaller of the two.
- "40 sessions, not computed yet" means the floor is met and the hourly rotation
  has not reached the tile yet.

## After a fix: the current build

The default 7-day verdict uses only the latest published client build. Older
builds do not keep its warning active after a fix. On the creator page, open
**Performance → View all versions** to inspect any published version with the
same warning rules and sample floors. Each report covers the last seven days,
so a version with no recent samples reads as insufficient data. Versions that
share a client bundle share its measurements.

The `Current build` line measures the live build:

- `published after this report; measured on the next refresh`: the fix is
  live and the next hourly report will start counting it.
- `collecting, 12 of 30 sessions`: the build is being measured.
- `v8: Android 1.0× the typical tile over 41 sessions`: the build is measured.
  Compare it with the older version’s report to see whether the fix worked.

Never tell the creator a fix worked until the current build reads measured and
its numbers moved.

## What to tell the creator

Say what the report found, in the report's comparative terms, then what you
found in the code and what you changed. For example: "The battery report says
Android phones draw 1.6× the typical tile's current running this tile. I found
the canvas redrawing at full rate on the title screen and made it idle there.
The report compares with other tiles on different phones, so it is a lead
rather than a measurement; the current build will show whether this helped
once it has 30 phone sessions."

Never state an absolute battery figure (milliamps, hours of battery): the report
does not measure one.
