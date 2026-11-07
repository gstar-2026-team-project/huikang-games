# simple-games

A collection of independent Joiner tiles. Each game is its own folder at the
top level, created with `poe-tiles tiles init <name>-<random suffix> --template react`
from this directory. Nothing is shared between games: each has its own
dependencies, tests, and `.poe-tile.json`.

- Before working on a game, `cd` into its folder and read that folder's
  `CLAUDE.md`; run every command from inside the game's folder.
- Keep game code inside its folder. Do not add a root `package.json` or
  shared code unless the user asks for it.
- When adding a game, add a row for it to the table in `README.md`.
