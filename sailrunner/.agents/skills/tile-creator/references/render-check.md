# Render check

`bun run render-check` finds the battery-hungry rendering patterns the
production power report measures, from inside the sandbox, before the tile
has a single player. It builds the tile, runs
`tests/render-check.test.playwright.ts` under the `mobile-viewport` Playwright
project (iPhone 13 on Chromium), walks the screens listed in that file, and
reduces what it counted to findings in the same vocabulary the production
report uses. Counts of code decisions (draw calls per render, animation
starts, running animations) are read as ratios over animation-frame ticks and
judged down to 45 ticks a second. Renders per second and compositor frames
per tick move with the hold's tick rate, so they are judged only when the hold
ran at 58 ticks a second or better. A slow sandbox changes how long the check
takes and which readings it withholds, never what a judged reading says.

The check is separate from `verify` and never runs on prototype turns.

## When to run it

- Before presenting a tile with a canvas render loop or decorative animation
  as finished.
- When the creator mentions battery, heat, or a warm phone.
- When the production power report, once it is available to you, says
  `watch` or `hot`: run the check to confirm the pattern locally, fix it, and
  run the check again instead of waiting a week for new sessions.

Tell the creator what each tool is for: the check finds patterns, the
production power report measures outcomes.

## Completing the check

- Run ordinary `bun run render-check`, with `RENDER_CHECK_REPORT_ONLY` unset,
  and preserve its actual exit status. If saving output, redirect to a log
  and capture the status before reading the log; a pipeline through `grep`
  or `tail` can report that command's success instead of the check's failure.
- Inspect `.visual-checks/render-check.json` as well as the command result.
  The scaffold's findings assertion alone can pass with lost or unreached
  screens. In the tile's test, also assert that every declared screen is
  `measured`. Require valid covered probes on every screen and valid
  reduced-motion probes on idle screens; reduced-motion is not run on play
  screens. A skipped, `inconclusive`, or `unobservable` run is unverified.
  Inspect every `partial` cause and withheld reading and resolve missing
  coverage needed to judge this tile before claiming completion.
- Fix findings and rerun; assess notices, hints, and borderline readings
  rather than weakening thresholds or dropping screens to silence them.
  Repeat after the final change to rendering, timers, visibility/pause/resume
  behavior, or the screen test, including changes made while fixing another
  check. A later `verify` pass does not refresh the render-check report.
- Cite the final report and command exit status when reporting verification,
  including any remaining limitation. Only claim the source actually tested;
  if a later relevant edit has not been rechecked, say it is unverified.

## Writing the screens

The scaffold ships one screen:

```ts
const screens: RenderCheckScreen[] = [
	{ name: "opening screen", kind: "unknown", reach: async () => {} },
];
```

Replace it with the tile's real screens, in the order a player meets them.
Each screen has:

- `name`: unique; printed in the table and in every finding.
- `kind`: `idle` for a menu, game-over card, pause or how-to overlay, where
  nothing should move; `play` for active play; `unknown` for a screen you
  have not classified, which is measured and probed but judged only by the
  screen-agnostic rules. A game that starts playing at once keeps its
  opening screen `unknown` so continuous rendering there is reported, not
  failed. A screen the player leaves open and comes back to (a farm, a
  lobby, a collection, a board between moves) is `idle`: nothing needs to
  move there between inputs, and continuous ambient motion on such a screen
  is the pattern the production power report flags. Calling it `unknown`
  hides the idle findings; the check still reports `page_busy_no_canvas`
  and `many_running_animations` there. Reach a persistent screen in the
  fullest state a player can own (every pet, crop, decoration and effect),
  because the count of running animations grows with what is on screen.
- `reach(ctx)`: drive the tile's real UI to the screen. It runs after the
  previous screen's probes, on the same page, so it starts from whatever
  state the previous screen left (a game-over card after a `play` screen
  whose game ended; the menu after a restart). Never reload. A `reach` that
  throws or outruns its bound marks the screen `not_reached` and ends the
  walk, so every later screen is `not_reached` too.
- `exercise(ctx)` (optional): runs during the main hold of a `play` screen
  that needs input to keep rendering. Tap, drag, or hold keys until
  `ctx.signal` fires, then stop within two seconds. An `exercise` that
  rejects (including `ctx.signal.throwIfAborted()`) or does not settle within
  those two seconds marks the screen `exercise_failed`: its row stays, no
  finding comes from it, and its probes are skipped.
- `assert(ctx)` (optional): resolve `true` while the tile is still on this
  screen. It runs after the hold and again after the probes, because an
  input-driven game can end while the tile is covered. A `false`, a
  rejection, or a timeout marks the screen `screen_lost`; its row stays, no
  finding comes from it, and the next `reach` starts from where the tile is.

`ctx` carries `frame` (the tile's Playwright frame), `page`, `server` (the
running `TestServer`, for admitting a second user or seeding state the way
the e2e tests do), and `signal`.

Up to eight screens. The test's timeout grows with the count.

**Assert the state you measured.** Supply an `assert` for each real screen.
For input-driven play, check during `exercise` that play remains active and
that the inputs produce the intended effect (such as a score increase or
movement). For timed rounds, reach a genuine gameplay phase with enough time
left for the hold, and assert the actual end screen separately. Do not accept
a pause or game-over screen as active play, add a nominal `play` screen solely
to wait out a timer, or change the game's rules or duration to make it pass.
If a phase cannot be measured honestly, report that coverage limitation.

The assertion runs after the main hold and again after the probes. If
covering intentionally leaves the game paused until Resume, distinguish
those two calls: `ctx` has no phase field, so keep a per-screen flag reset in
`reach` and advance it only after the main-hold assertion succeeds. The first
call must confirm active play and the second the specific expected pause
with the round unfinished. Do not use one permissive list of playing, paused,
and ended states for both. Measure that pause as an `idle` screen, then
explicitly resume through the UI before the next play measurement. If the
tile resumes automatically, assert that behavior instead. The report's
`covered.resumed` only says a frame was drawn after uncover; a redrawn pause
card can satisfy it without gameplay resuming.

## What a hold measures

Every screen gets a main hold, a covered probe, and, on `idle` screens, a
reduced-motion probe. Each discards a 60-tick settle window (about a second
at 60 Hz) before counting, so a full-rate burst right after a transition is
not judged: a
compliant tile legitimately renders at full rate for about a second after
input or a phase change, a game-over card slides in, and a paused overlay
may animate because the tile was just covered.

The covered probe sets `hostCovered` on the session page's `<poe-tile>`
element, the same path the host's results sheet uses, and watches what the
tile does while covered on every screen, play included. The reduced-motion
probe turns `prefers-reduced-motion: reduce` on and watches decorative
animation on idle screens only.

## Findings, borderline, and notices

A **finding** fails the run. A **notice** is advisory. A **borderline**
reading is a rate-derived number inside a 15% band around its threshold,
where a change in the machine's frame rate could move it across; it never
fails the run and reads as "close enough to look at". The table below
states each code's nominal threshold: a rate-derived code fires at 15%
above it and is borderline from 15% below it, so `idle_screen_renders` at
20 fires from 23 renders a second and reads borderline from 17. Exact counts
(a shadowed fill on every render, one running animation under cover) have
no band: a value of exactly 1 against a threshold of 1 is a finding.

| Code | Severity | Fires when | What to inspect and the fix |
|---|---|---|---|
| `idle_screen_renders` | finding | an `idle` screen renders 20 or more times a second | The loop keeps drawing on a screen where nothing moves. Call `shouldRenderFrame(now, { idle: true })` there and draw one ambient frame every ~250 ms. |
| `idle_screen_page_busy` | finding | an `idle` screen produces compositor frames on half the ticks or more | Something other than the canvas changes every tick: a per-tick DOM write, an infinite CSS animation, a shimmer. Write DOM values only when they change; stop decorative animation between bursts. |
| `page_busier_than_canvas` | finding | on a `play` screen with an active canvas, the page produces 0.3 more frames per tick than the canvas renders | The canvas is capped or gated but the page is not: a HUD written every simulation tick, a CSS pulse. The compositor runs at panel rate whatever the canvas does. Write the HUD only on change; stop per-tick animations during play. |
| `page_busy_no_canvas` | notice | an `unknown` screen with no laid-out canvas produces compositor frames on half the ticks or more | Running CSS or Web Animations never pause, so the phone composites every layer at the panel rate for the whole session. If nothing on the screen needs continuous motion, classify it `idle` (the same reading is then `idle_screen_page_busy`, a finding) and pause ambient loops between bursts. |
| `shadowed_fills` | finding on `play`, notice elsewhere | a fill with `shadowBlur` or `shadowOffsetX/Y` set and a visible `shadowColor` on every render | Draw the shadow as a second offset fill of the same path. |
| `full_canvas_composite` | finding on `play`, notice elsewhere | a `fillRect`, `drawImage`, or single-`rect()` `fill` under a `globalCompositeOperation` other than `source-over` covers the whole canvas on every render | Bake the grain, vignette, or tint into a background layer rendered once into an offscreen canvas and drawn with one `drawImage`. |
| `uncapped_pixel_ratio` | finding | the largest canvas's buffer-to-CSS ratio, on the screen where it is largest, is above 1.6 on a phone-shaped frame, the budget stamped no `dpr` override, no engine evidence, and some screen renders 12 or more times a second | The buffer is sized from raw `devicePixelRatio`. Size it from the render budget's resolved `pixelRatio`, and re-apply on resize. |
| `animations_run_covered` | finding | while the host reports the tile covered: 12 or more renders a second, any animation start, or any running animation, finite or not | Subscribe to the foreground signal and pause the loop, timers, and decorative animation under cover. A 30-second entrance still running under cover counts. |
| `buffer_below_budget` | notice | buffer ratio below 1.4 on a phone-shaped frame, no `dpr` override, no engine evidence | A buffer sized to its CSS box: cheap, but text and edges smear on phones. Size it from the resolved `pixelRatio`. |
| `buffer_ratio_static` | notice | buffer ratio above 1.6 (same gates as `uncapped_pixel_ratio`) on a tile where no screen renders 12 or more times a second | A canvas that rarely renders is cheap whatever its size; the ratio is a configuration mismatch, not a cost. Size it from the resolved `pixelRatio` when you touch the code. |
| `no_resume_after_cover` | notice | the tile drew in the last 60 ticks of the hold, drew nothing under cover, and drew nothing in the 60 ticks after uncover (about a second each at 60 Hz) | A tile that renders only on input correctly schedules nothing after uncover. If the tile should resume on its own, assert that in the screen's `assert`. |
| `animations_ignore_reduced_motion` | notice | with reduced motion on, an `idle` screen starts an animation or keeps an infinite one running | Honor `prefers-reduced-motion` for decorative animation, including changes while mounted. |
| `per_render_gradient` | notice | a gradient or pattern is created on every render | Create it once, or when its inputs change, and reuse it. |
| `per_render_text_measure` | notice | `measureText` runs on every render | Measure once per text change and cache the width. |
| `many_running_animations` | finding, notice on `play` | 20 or more animations running at the end of a hold | Every running animation makes the phone composite a frame per refresh, and the count grows with what the player owns. Animate a few visible items with quiet intervals between bursts, under one shared scheduler; turn a particle layer (rain, snow, petals, sparkles) into a burst or one animated image. |
| `unbudgeted_render_loop` | notice | 30 or more renders a second with no render budget created and no engine evidence | Wire `createRenderBudget()` into the loop; see the render-budget section of the client API reference. |
| `duplicate_frame_callbacks` | finding | 0.1 or more extra deliveries of the same `requestAnimationFrame` callback per tick, averaged over the hold (any screen, judged down to the floor rate) | A loop was restarted from inside its own callback, for example three.js `setAnimationLoop(null)` then `setAnimationLoop(fn)` during a frame, or one callback is scheduled twice. The second call sees zero elapsed time and resets time-based animation. Stop the old loop outside the frame callback, or dedupe the schedule. Withheld when the platform shim did not report it. |

Every finding prints the screen, the value, the threshold, and a fixed
sentence. The thresholds live in the SDK's `RENDER_CHECK_THRESHOLDS`.

**Hints** come from a scan of the tile's source and never fail the run. They
tell you where to look when a runtime finding fires:

| Hint | What it saw |
|---|---|
| `hint_shadow_per_fill` | an assignment to `shadowBlur` or `shadowOffsetX/Y`, with file and line |
| `hint_composite_pass` | an assignment to `globalCompositeOperation` other than `source-over` |
| `hint_infinite_css_animation` | `animation` or `animation-iteration-count` with `infinite` |
| `hint_blend_mode` | `mix-blend-mode` other than `normal`, in CSS, a `style.mixBlendMode` assignment or style object, or `setProperty`: a blended layer over moving content is re-blended on every frame |
| `hint_filter_effect` | `filter` or `backdrop-filter` with `blur()` or `drop-shadow()`, in CSS, a `style.filter` / `style.backdropFilter` assignment or style object (with or without a `webkit` prefix), or `setProperty`: a filter on or above an animated element is re-rendered on every frame |
| `hint_no_render_budget` | `requestAnimationFrame` and `getContext(` somewhere, no budget created or resolved anywhere |
| `hint_no_foreground_subscription` | a loop or interval somewhere, no foreground subscription anywhere |
| `hint_no_reduced_motion` | `@keyframes` or `.animate(` somewhere, no `prefers-reduced-motion` anywhere |

The three whole-scan hints are withheld when the scan hit its caps, so an
incomplete scan never asserts that something is missing.

## What the check cannot see

- The GPU cost of a blur, a filter, or a shader on a given phone.
- Which of many running animations costs most on a phone, or how much a
  DOM screen costs at all: headless Chromium's CPU time stays low while a
  phone composites the same layers at the panel rate, so compare builds by
  frames per tick and running animations, never by sandbox CPU.
- Whether a 30 fps cap pays on a given device.
- Thermal escalation.
- A gesture scheduled less often than a probe window (180 ticks, about three
  seconds at 60 Hz): it can escape both probes. Test such a scheduler's
  pause path in the tile's own unit tests.
- A render gate whose threshold sits just above a multiple of the 60 Hz
  frame interval (17 ms, 34 ms, 51 ms, and so on, within about half a
  millisecond per frame the gate spans): its reading can differ between
  machines even inside the accepted band. A reading that moves between runs
  is usually this.
- Draw calls inside a worker. A canvas handed to a worker with
  `transferControlToOffscreen` reads `unobservable` rather than guessing; a
  worker's frames presented on the main thread through
  `transferFromImageBitmap` count as renders, but the shadows, composites, and
  gradients drawn to produce them are invisible. An `OffscreenCanvas` drawn on
  the main thread (a sprite cache, a scratch canvas) is counted like any other
  canvas.

## States that are not findings

- `inconclusive`: the sandbox could not hold the check's tick-rate floor on
  a static reference tile, that reference tile could not open or stopped
  answering, or no screen was measured. The test skips with the reason.
  Rerun when the machine is less loaded; never read silence as a pass.
- A tile frame that stops answering mid-screen (detached, navigated, crashed)
  marks that screen `inconclusive` with the message under Notes and ends the
  walk; the earlier rows stand.
- `unobservable`: the tile moved its canvas off the main thread
  (`transferControlToOffscreen`). The test skips with the reason; the hints
  still print. A tile page that cannot open, a tile frame that never
  appears, or a frame that does not answer at open also reads
  `unobservable`, and the test fails on those, because a tile that never
  mounts proves nothing.
- A rate-derived reading withheld because the hold ran below 58 ticks a
  second (named under Notes in the report). Count-based codes are still
  judged down to 45 ticks a second.
- `borderline`, as above.
- `partial`: some screen was not measured, its page-frame column could not be
  read (when CDP tracing is unavailable this is every screen, with the
  environmental reason under Notes), a probe it was due did not run or ran
  below the floor, the resume read after cover did not complete, or the
  source scan hit its caps or could not read the tile directory; the status
  line names each cause.

The report is printed to the Playwright log, attached to the run, and
written to `.visual-checks/render-check.json` in the tile directory, even
when the run is cut short. Cite it when you report the check. That folder is
temporary (in Creator it does not survive the container sleeping), so read the
report in the turn that ran the check.

## Adding the check to an older workspace

1. Upgrade the workspace's SDK pin to a release that exports
   `poe-tiles-sdk/v1/test-utils/render-check.js`, then `bun install`.
2. Copy `tests/render-check.test.playwright.ts` from a fresh scaffold
   (`poe-tiles tiles init` into a temporary directory) into `tests/`, then
   change the scaffold name it carries (the `typeId` passed to
   `registerTile` and the `tileTypeId` in `sessionUrl`) to this tile's type
   id as the other tests spell it.
3. Add the file to the `mobile-viewport` project's `testMatch` in
   `playwright.config.ts` and to the desktop project's `testIgnore`.
4. Add the script to `package.json`:
   `"render-check": "bun run build && bunx playwright install chromium && RENDER_CHECK=1 bunx playwright test tests/render-check.test.playwright.ts"`.
5. If the workspace has no `scripts/visual-check.ts`, copy that too; the
   test writes its JSON through it.
