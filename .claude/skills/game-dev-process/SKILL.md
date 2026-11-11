---
name: game-dev-process
description: How to develop, test, play, and ship a game in this repository, end to end. Use when changing a game's behavior or look, adding a game, pulling changes made on Joiner, or deploying to Joiner and GitHub Pages.
---

# Game development process

Each game is a Joiner tile in its own top-level folder (`sailrunner/`,
`skyrunner/`, `cloudrunner/`) and ships to two places: the Joiner tile, and a single-player web
build on GitHub Pages. A change is done when it is tested, played, committed to
`main`, live on Pages, and uploaded to Joiner.

Root `AGENTS.md` holds the standing rules (commit to `main`, publish without
asking). This skill is the order of work and the traps.

## 0. What the owner has complained about (read every time)

Each of these was a real complaint. Do not repeat them.

**Ownership and judgment**
- **"Don't you have taste?" / "ask me for what improve it???" / "wtf".** Do
  not hand design decisions back as a menu. Decide, using taste, and keep
  improving until a human would not complain. Ask only when the answer truly
  changes direction (for example which game, or a deliberate rule change).
- **"Did you even try?" / "did you actually play it?"** A bot reading the
  game's internal state and pressing keys is not playing. Before claiming a
  game is good, steer it **by sight**: screenshot, decide from the pixels,
  press, look again, with no probe or internals. Report honestly what a person
  would struggle with.
- **"The game is still shit."** Passing tests and tidy screenshots prove
  nothing about fun or clarity. Judge it as a player would.
- **Misreading the request.** "Wind on the map" meant the map; "arrows on the
  water" meant arrows on the water moving with the real wind. Restate the
  request in one line before building when it is ambiguous, and never remove
  something the owner asked for.
- **Stopping to argue with an open goal.** When given an open-ended goal, keep
  making concrete improvements; do not stop and debate whether it is met.
- **Commit and push as you go.** Each finished, verified change is committed,
  pushed and published (Pages and Joiner) without being asked.

**Motion and feel**
- **"Initial screen is laggy" → "in the home screen it stalled".** Idle screens
  drawn at 4 fps look laggy; freezing them looks hung. The home screen is the
  first impression: animate it at full rate. Only true pause/game-over panels
  may idle.
- **"Too laggy."** Measure on real hardware, not only the headless CPU browser
  at phone size: launch Chrome headful with a GPU at the user's screen size
  (`deviceScaleFactor: 2`, 1280×800 or larger) and read real frame times. Big
  per-pixel shaders on retina screens are the usual cause; keep a dynamic
  resolution fallback. Also measure input-to-response (key press to visible
  turn).
- **"Why can't you test this frame by frame???"** Motion is checked with
  Playwright's fake clock (section 5), never with loose screenshots.
- **"The arrow movement is funny" / "arrows should travel the real
  direction".** Things on the water belong to the water: they drift with the
  wind relative to the sea, not relative to the boat or camera. With the boat
  stopped they must move exactly the way they point. Prove it with a unit test
  and a frame-by-frame film with the boat stopped.

**Look**
- **"Graphics are uninspiring" / "can you build better graphics?"** Aim for a
  stylised, saturated, art-directed look (strong light, sky gradient, depth,
  life: birds, spray, distant boats), never flat single colours. Compare before
  and after shots and iterate until it would go on an app store page.
- **"Could you have more realistic waves?"** Real moving swell (Gerstner,
  deep-water speeds), whitecaps on crests, objects floating on it.
- **Wide screens.** Check 1920 px wide: a sky band once stopped short and left a
  solid slab on desktop.
- **Text over the scene** must stay readable over pale sky and clouds (pills,
  edges, shadows).

**Realism and rules**
- **"Could you study how sailing works?"** Research the real activity before
  building its physics, and compare point by point (polar, no-go zone, gybing
  downwind, steerage, momentum, leeway).
- **"Stop having over/under speed requirements."** Remove arbitrary rules the
  owner dislikes outright, everywhere (rules, rendering, HUD, copy, tests).
- **"Start with max thrust"; "no need to countdown".** Prefer getting the
  player into the action immediately.
- **"The game doesn't make sense at all" (Cloudrunner).** A new game must make
  its core loop legible in the first ten seconds: show the thing to react to,
  give continuous feedback, and one line of guidance.

**Navigation**
- When steering by sight, the next target was often off screen and a later
  buoy looked like the target. Always show the next goal (edge arrow or pointer
  with distance) and mute everything that is not the next goal.

**Tools**
- **"Could you use puppeteer to play" / "install puppeteer mcp??"** Puppeteer
  MCP and Chrome automation are available; use them to play, and say so instead
  of asking.
- **"Read the docs and connect to joiner."** Follow the docs end to end
  (install, login, publish) without stalling.

## 1. Set up the machine (once)

- Bun 1.x and Node 22.22+ are required. If the `curl | bash` Bun installer is
  blocked, use `brew install oven-sh/bun/bun`.
- Install the CLI with the current command from
  <https://poe-tiles-docs.pages.dev/starter/BOOTSTRAP.md>. It lands in
  `~/.bun/bin`, which is not on `PATH`: prefix commands with
  `export PATH="$HOME/.bun/bin:$PATH"`.
- `poe-tiles login` runs in the background; give the user the approval link and
  code it prints, then confirm with `poe-tiles auth whoami`.
- In a game folder run `bun install --ignore-scripts`. A plain `bun install`
  can fail compiling `better-sqlite3` on a new Node, and nothing here needs it.

## 2. Before editing

- Work from inside the game's folder and read its `AGENTS.md`.
- Load that folder's `tile-creator` skill (and `synced-store` for store work).
  It sets hard rules, including TypeScript only and at most 400 lines per file.
- If the game may have been edited on Joiner, pull first (section 7).

## 3. Make the change

Where things live in every game:

| Folder | Holds |
| --- | --- |
| `game/` | Pure rules and simulation, with unit tests. Put new logic here. |
| `render/` | Drawing: the 3D or canvas scene and the map. |
| `ui/` | Screens, HUD, input, and the controller that runs the loop. |
| `synced-store/` | Joiner state: schema, mutators, readers. |
| `tile/` | Joiner entry point and the shared stylesheet. |
| `web/` | GitHub Pages entry point and the localStorage store. |

Rules that keep both targets working:

- **Mirror store changes in `web/src/local-store.ts`.** A new mutator, a new
  field a reader returns, or a new host call the UI makes must exist there too,
  or the web build breaks while the tile still passes.
- **A saved preference** follows the mute pattern: an optional field on the
  prefs row, a mutator that spreads the current row, the reader, the local
  store, and a test in both `mutators.test.ts` and `local-store.test.ts`.
- **Keep computation pure and tested.** Planning, scoring, and view fitting go
  in `game/` or a small `render/` helper with a `*.test.ts`; the controller
  only calls them.
- **Add the folder to the `test` script** in `package.json` if tests are added
  somewhere the script does not already list.

## 4. Check it

Run from the game's folder, in this order:

```bash
bun run type-check
bun run test          # unit and Happy DOM tests
bun run build:web     # web build into dist-web/
bun run verify        # everything, including both builds and browser tests
```

`verify` takes about two minutes for Sailrunner because a browser test sails a
whole race. If `scripts/doctor.sh` fails with "Permission denied", restore its
executable bit (`chmod +x`); a source download from Joiner drops it.

## 5. Play it

Passing tests do not show what the player sees. Before shipping a change to
gameplay or visuals, play the web build in a browser and look at screenshots:

1. `bun run build:web`, then serve `dist-web/` (`python3 -m http.server`).
2. Drive it with a throwaway Playwright script: open the page at 390x844,
   start a run, and save screenshots to `.visual-checks/` (gitignored) at the
   start, mid-run, and the end. Sailrunner's `tests/autopilot.ts` sails the
   course; Skyrunner flies level through the first ring hands-off.
3. Read the screenshots. Check the thing that changed, then the rest of the
   screen for overlap or clipping.
4. Delete the throwaway script.

**Check motion frame by frame, never from loose screenshots.** Install
Playwright's fake clock (`page.clock.install()` before `goto`), then advance it
with `page.clock.runFor(100)` between screenshots: every frame is then exactly
100 ms of game time apart. Freeze the variable you are not testing (for the
wind arrows: stop the boat in irons first, so any motion on screen is the
arrows' own). Stitch frames and an overlay of the first (red) and last (cyan)
frame into one image, so each moving thing leaves a red-to-cyan streak you can
read. `scripts/frames-example.test.playwright.ts` is a worked example: copy it
into the game's `tests/`, serve `dist-web/`, run it, then delete the copy.

`?display=mobile` or `?display=768x768` on any Pages URL runs the game at a
fixed size, which is the quickest way for the user to check a layout.

## 6. Ship it

1. **Commit and push to `main`.** One commit per user-visible change, with a
   message that says what the player gets.
2. **GitHub Pages** deploys from `.github/workflows/pages.yml` on every push.
   Wait for the run (`gh run watch <id> --exit-status`), then load the live
   page in a headless browser and start a run. A new game needs a build step in
   the workflow and a card in `.github/pages/index.html`.
3. **Joiner.** From the game's folder:

   ```bash
   poe-tiles tiles power                       # the tiles this account owns
   poe-tiles tiles channels huikang/<handle>   # what is live, and what auto-advances
   bun run build && poe-tiles tiles publish
   ```

   - Look tiles up as `huikang/<handle>`. A bare handle returns "Tile not
     found" even for your own tile.
   - Check `.poe-tile.json → handle` against `tiles power` first. Joiner can
     rename a tile when it is listed, and publishing to a handle that matches
     no tile creates a new one.
   - Read the receipt. "Live version did not change" means the upload went to
     the `test` channel only, because live is pinned. When the user asked for
     the change to reach players, make it live:
     `poe-tiles tiles promote huikang/<handle> <version>`.
   - Report the tile URL, the live version, discovery, and source visibility.

## 7. Pull changes made on Joiner

The user can edit a tile in a Joiner Creator session, so the repo can fall
behind:

```bash
poe-tiles tiles versions huikang/<handle>          # anything newer than the last publish?
poe-tiles tiles download-source huikang/<handle> --out <tmp>/src.tar.gz
```

Extract into a temporary folder and `diff -rq` it against the game's folder
(ignore `node_modules`, `dist`, `dist-web`). Take what Joiner changed, keep
what is newer in the repo, then check the handle in `.poe-tile.json`, reinstall,
run `verify`, and commit as a pull.

## 8. Report

Say what changed for the player, give both URLs, and state what was and was not
checked: tests run, screens played, the live page loaded, the Joiner version
and whether it is live.
