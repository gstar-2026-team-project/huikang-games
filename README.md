# simple-games

Small games built as [Joiner tiles](https://poe-tiles-docs.pages.dev/guide.html).
Each game lives in its own folder with its own `package.json`, tests, and
`.poe-tile.json`, so games can be built, tested, and published independently.

| Folder | Game |
| --- | --- |
| [`sailing-regatta-q7m3/`](sailing-regatta-q7m3/) | **Daily Regatta**: race a sailboat around a new buoy course every day, with a sailing lesson, a shared leaderboard, and replays. |

## Working on a game

```bash
cd sailing-regatta-q7m3
bun install
bun run dev      # live preview
bun run verify   # type-check, tests, build, browser tests
```

## Adding a game

From this folder, scaffold a new tile next to the others (use a short random
suffix so the handle never collides with an earlier tile):

```bash
poe-tiles tiles init my-game-x7k2 --template react
```

Then add it to the table above.
