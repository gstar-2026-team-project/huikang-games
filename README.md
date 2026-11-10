# simple-games

Small games built as [Joiner tiles](https://poe-tiles-docs.pages.dev/guide.html).
Each game lives in its own folder with its own `package.json`, tests, and
`.poe-tile.json`, so games can be built, tested, and published independently.

Play them in the browser at
<https://gstar-2026-team-project.github.io/huikang-games/>.

| Folder | Game | Play on the web |
| --- | --- | --- |
| [`sailrunner/`](sailrunner/) | **Sailrunner**: race a sailboat around a new buoy course every day, with a sailing lesson, a shared leaderboard, and replays. | [sailrunner/](https://gstar-2026-team-project.github.io/huikang-games/sailrunner/) |
| [`skyrunner/`](skyrunner/) | **Skyrunner**: fly a plane through golden rings, with a daily challenge, twelve star-rated canyon levels, and endless free flight. | [skyrunner/](https://gstar-2026-team-project.github.io/huikang-games/skyrunner/) |
| [`cloudrunner/`](cloudrunner/) | **Cloudrunner**: fly an unpowered glider, circling in thermals that appear and die to reach a daily set of beacons, or as many as you can in free flight. | [cloudrunner/](https://gstar-2026-team-project.github.io/huikang-games/cloudrunner/) |

The web versions run without Joiner, so they are single-player: times and
progress are saved in the browser only, with no shared leaderboard.

Add `?display=` to any of these pages to play at a fixed screen size, centred
in the window: a name (`?display=mobile` is 390x844, `tablet` is 768x1024,
`desktop` is 1280x800) or an exact size in CSS pixels (`?display=768x768`).
The landing page passes it on to the game you open.

## Working on a game

```bash
cd sailrunner       # or skyrunner, cloudrunner
bun install
bun run dev        # live preview inside a local Joiner host
bun run build:web  # standalone web build in dist-web/
bun run verify     # type-check, tests, builds, browser tests
```

Every push to `main` deploys the web builds to GitHub Pages through
[`.github/workflows/pages.yml`](.github/workflows/pages.yml).

## Adding a game

From this folder, scaffold a new tile next to the others (use a short random
suffix so the handle never collides with an earlier tile):

```bash
poe-tiles tiles init my-game-x7k2 --template react
```

Then add it to the table above. To put it on GitHub Pages too, give it a
standalone `build:web` like the others (`sailrunner/web/`, `skyrunner/web/`), and add it to the
workflow and to `.github/pages/index.html`.
