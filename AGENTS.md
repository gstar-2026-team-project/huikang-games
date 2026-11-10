# simple-games

A collection of independent Joiner tiles. Each game is its own folder at the
top level, created with `poe-tiles tiles init <name>-<random suffix> --template react`
from this directory. Nothing is shared between games: each has its own
dependencies, tests, and `.poe-tile.json`.

For the full order of work (set up, change, test, play, ship to Joiner and
GitHub Pages, pull from Joiner), read
[`.claude/skills/game-dev-process/SKILL.md`](.claude/skills/game-dev-process/SKILL.md).

## Working on a game

- Before working on a game, `cd` into its folder and read that folder's
  `AGENTS.md` (or `CLAUDE.md`); run every command from inside the game's folder.
- Keep game code inside its folder. Do not add a root `package.json` or
  shared code unless the user asks for it.
- When adding a game, add a row for it to the table in `README.md`.
- Look up a tile with its creator prefix: `poe-tiles tiles get huikang/<handle>`.
  A bare handle returns "Tile not found" even for your own tile, and
  `tiles list` shows only listed tiles; `poe-tiles tiles power` lists the
  tiles this account owns.
- Publishing targets the `handle` in `.poe-tile.json`, not the folder name, so
  a handle that matches no tile of yours creates a new tile. Joiner can rename
  a tile when it is listed (`sailing-regatta-q7m3` became `sailrunner`), so
  before publishing check the handle against `poe-tiles tiles power`.
- To pull changes made on Joiner, download the tile's source
  (`poe-tiles tiles download-source huikang/<handle>`), diff it against the
  folder, and keep anything newer in the repo.

## Committing

- Commit and push directly to `main`. Do not create feature branches or pull
  requests unless the user asks for one.

## Publishing

- Publish without asking for permission. After a change to a game passes
  `bun run verify`, publish it from the game's folder:

  ```bash
  bun run build && poe-tiles tiles publish
  ```

- Then open the printed tile URL, check that the game loads, and report the
  URL and the receipt (live status, discovery, source visibility).
- Keep a tile's discovery as it is (new tiles are unlisted). Listing a tile
  publicly is still the user's call.

## GitHub Pages

- Every push to `main` runs `.github/workflows/pages.yml`, which builds each
  game's standalone web version (`bun run build:web`, output in `dist-web/`)
  and deploys it to <https://gstar-2026-team-project.github.io/huikang-games/>.
- The web version has no Joiner host: `web/src/local-store.ts` replaces the
  synced store with localStorage. When a change adds a mutator or a host
  capability the UI calls, mirror it there, or the web build breaks.
- Every web page takes `?display=mobile` or `?display=768x768` to run at a
  fixed screen size (`web/src/screen-size.ts`, one copy per game); a new
  game's web entry should call `mountSizedFrame` too.
- After pushing, check that the workflow run succeeded and the page loads.
