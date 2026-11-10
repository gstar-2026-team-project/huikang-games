---
name: poe-tiles-cli
description: Joiner CLI command reference. Use when explaining how to install, upgrade, authenticate, scaffold, publish, inspect, manage, or script with the `poe-tiles` CLI, including command examples, arguments, options, environment variables, JSON output, app commands, store commands, skills installation, model, account, and upgrade commands.
---

# Joiner CLI Reference

Use this skill as the concise command reference for `poe-tiles`. Prefer exact command examples over prose. If a command needs authentication, assume the user has run `poe-tiles login`; it does not require a Poe API key. API keys via `--api-key`, `POE_API_KEY`, or `~/.poe-tiles/poe-tiles-api-key` are legacy alternatives.

<a id="poe-tiles-cli-reference"></a>

## Install and Upgrade

```bash
poe-tiles --version
poe-tiles upgrade
poe-tiles upgrade --print
```

Options:
- `poe-tiles upgrade --print`: print the equivalent install command without running it.

## Global Options

```bash
poe-tiles --help
poe-tiles --version
poe-tiles --json tiles list
poe-tiles --server http://localhost:8787 tiles list
poe-tiles --server http://localhost:8787 login
poe-tiles --api-key "$POE_API_KEY" tiles list
```

Options:
- `--json`: output machine-readable JSON.
- `--server <url>`: override the server URL. `POE_SERVER_URL` is the environment-variable equivalent.
- `--api-key <key>`: legacy Poe API key override for API-backed commands.
- `-V, --version`: output the CLI version.
- `-h, --help`: display help.

Environment:
- `POE_TILES_SESSION_TOKEN`: Joiner session token. Usually created by `poe-tiles login` in `~/.poe-tiles/poe-tiles-session-token`.
- `~/.poe-tiles/poe-tiles-session-token`: home-directory file containing exactly one Joiner session token.
- `POE_API_KEY`: legacy Poe API key. Explicit API keys still work via `--api-key`, this env var, or the local API key file.
- `~/.poe-tiles/poe-tiles-api-key`: legacy home-directory file containing exactly one raw Poe API key.
- `POE_SERVER_URL`: optional server URL override.

Local-only commands that do not need authentication to start: `tiles init`, `skills install`, `upgrade`.

## Config files

Existing projects can keep `.poe-app.json` with either historical `poe-app/v2.json` schema URL, on `poe-app-platform-docs.pages.dev` or `poe-tiles-docs.pages.dev`. The CLI reads these files without renaming them or rewriting their contents. If both config filenames exist, all fields other than `$schema` must agree; JSON formatting and property order do not matter. Equivalent files use `.poe-tile.json`. Divergent or malformed files stop the command without changing either file, so reconcile them before continuing. Current field validation still applies, including the explicit `--publish-as-poe` requirement.

For copied source with only `.poe-app.json`, Remix preparation validates the original config, keeps its filename and unrelated fields, and records known remix attribution using the current schema, just as it does for `.poe-tile.json`. Ordinary config reads and stored source archives remain unchanged. When both config filenames exist, preparation leaves both untouched and reports that metadata preparation was skipped rather than stamping only one file and leaving a conflicting pair.

## Auth Commands

```bash
poe-tiles login
poe-tiles auth whoami
poe-tiles auth usage
poe-tiles auth points-history
poe-tiles auth logout
poe-tiles --json auth whoami
```

Commands:
- `login`: open or print a browser approval URL and save a local CLI session.
- `auth whoami`: show the current authenticated user.
- `auth usage`: show point balance.
- `auth points-history`: show usage history.
- `auth logout`: end the current session.

Options:
- `poe-tiles login --remote`: print a browser approval URL/code for opening in any browser, useful on SSH or remote machines.
- `poe-tiles login --no-open`: compatibility alias for printing the browser approval URL without opening a browser.
- `poe-tiles login --open`: force opening the browser approval URL in this machine's browser.
- `poe-tiles login --device-label <label>`: label the device shown in the approval UI.
- Global `--json` is useful for scripting.

When an agent runs `login` for a user, the user must see the approval link in chat:
- Start `poe-tiles login` as a background command. It keeps polling until the user approves, so a foreground tool call returns no output until login has already finished.
- As soon as it prints the approval URL and the `Enter code:` line, post the URL to the user as a clickable Markdown link (`[Approve Joiner sign-in](<url>)`) and the code as text.
- Post the link even when the CLI says it is opening the browser; a browser launched from an agent's shell may not appear.
- Wait for `Logged in successfully.`, then confirm with `poe-tiles auth whoami`.

## Remix Command

### `remix`

```bash
poe-tiles remix app_123
poe-tiles remix myuser my-app
poe-tiles remix myuser/my-app --dir ./my-local-copy
```

Arguments:
- `<typeIdOrCreatorName>`: app ID, `userHandle/appHandle`, or creator name when paired with `[handle]`.
- `[handle]`: app handle when the first argument is a creator name.

After unpacking, `remix` makes the copy usable on its own:
- Rewrites the `poe-tiles-sdk` dependency in `package.json` from a workspace reference to the published SDK tarball URL, so `bun install` resolves the SDK.
- For first-party bundles (package name `@poe-tile/*` with a workspace `poe-tiles-sdk` dependency), pins any declared `@playwright/test`, `playwright`, and `playwright-core` dependencies to the monorepo's tested versions and adds matching exact `overrides` for all three. External apps keep their declared Playwright versions; bundles without Playwright dependencies get no Playwright overrides.
- Installs the SDK skills (tile-creator, synced-store) into `.claude/skills/`.

The Playwright pins preserve the tested versions after the source leaves the
monorepo. Fresh caret resolution can otherwise pick a newer release before all
three npm packages are available. Keep the pins after that publication completes:
they prevent recurrence and make upgrades deliberate, including patch and security
updates. To upgrade an existing remix, choose a release available for all three
packages, set its declared Playwright dependencies and all three overrides to
that same exact version, then run `bun install` to update the existing lockfile.
Commit the manifest and lockfile together.
Upgrading the CLI alone does not update existing remixes' Playwright versions.

If the source carries other internal workspace dependencies (apps published from a monorepo sometimes do), `remix` leaves them intact and warns — they have no published package and `bun install` will fail until you remove or replace them.

Options:
- `--dir <path>`: output directory for the unpacked source bundle. Defaults to the app handle. The directory must not already exist.
- `--no-skills`: skip installing the SDK skills into `.claude/skills/`.

## Apps Commands

### `tiles init`

```bash
poe-tiles tiles init
poe-tiles tiles init my-app --template solidjs
poe-tiles tiles init my-game --template phaserjs --output-dir ./poe-tiles
poe-tiles tiles init my-app --template react --no-skills
poe-tiles tiles init my-app --template vanilla-js --no-blank
poe-tiles tiles init my-proto --template react --no-store
```

Arguments:
- `[app-name]`: app name, lowercase alphanumeric plus hyphens.

Options:
- `-t, --template <template>`: one of `react`, `vanilla-js`, `solidjs`, `preact`, `phaserjs`.
- `--workspace-sdk`: resolve `poe-tiles-sdk` through `workspace:*` instead of the published tarball.
- `--internal-mono-repo`: configure an internal ai-app monorepo scaffold. Implies `--workspace-sdk`.
- `--output-dir <path>`: parent directory for the new app. Defaults to the current directory.
- `--no-skills`: skip copying SDK skills into `.claude/skills/`.
- `--no-blank`: keep the todo-list example instead of blanking generated app code.
- `--no-store` (experimental): scaffold without synced-store. No `synced-store/`, `client.ts`, backend entry, mutator test, or e2e tests; state is in memory only and the generated `.poe-tile.json` has no `sourceBundle`. For throwaway prototypes.

### `tiles list`

```bash
poe-tiles tiles list
poe-tiles --json tiles list
poe-tiles --json tiles list | jq '.[].handle'
```

Options:
- No command-specific options. Use global `--json` for scripting.

### `tiles get`

```bash
poe-tiles tiles get myuser/my-app
poe-tiles tiles get app_123
poe-tiles --json tiles get myuser/my-app | jq '.bundleUrl'
```

Arguments:
- `<tileHandleOrId>`: app ID or `userHandle/appHandle`.

Options:
- No command-specific options.

### `tiles download-source`

```bash
poe-tiles tiles download-source myuser/my-app
poe-tiles tiles download-source app_123 --out ./source-bundle.tar.gz
```

Arguments:
- `<tileHandleOrId>`: app ID or `userHandle/appHandle`.

Options:
- `--out <path>`: output path for the downloaded source bundle. Default: `source-bundle.tar.gz`.

### `tiles rename`

```bash
poe-tiles tiles rename myuser/old-handle new-handle
poe-tiles tiles rename app_123 new-handle
```

Arguments:
- `<tileHandleOrId>`: app ID or `userHandle/appHandle`.
- `<newHandle>`: new lowercase alphanumeric-plus-hyphens handle, unique per creator.

Options:
- `--use-poe-account`: rename an app owned by the `@poe` system account. Requires an allowlisted API key.

### `tiles power`

Show the 7-day battery and heat report for tiles you own: a verdict (`ok`,
`watch`, `hot`, `insufficient_data`, or `not_computed`), its reason codes and
context codes listed apart, and the measurements behind it, with each battery
outcome compared with the typical tile. Owner only. The tile-creator skill's
[power report reference](../tile-creator/references/power-report.md) explains
every code and how to act on it.

```bash
poe-tiles tiles power myuser/my-app          # one tile you own
poe-tiles tiles power                        # every tile you own
poe-tiles --json tiles power myuser/my-app   # the full report, every measurement
```

Arguments:
- `[tileHandleOrId]`: app ID or `userHandle/appHandle`. Omit it to report every
  tile you own, or, in a Creator session (`POE_TILES_PUBLISH_TOKEN` set), the
  tile that session publishes.

Notes:
- In a Creator session the command reads only the session's own tile, and only
  after a preview has been published; naming any other tile is refused as not
  one of your tiles.
- The report is rebuilt hourly. It answers "not available yet" until the first
  hourly report exists.

### `tiles channels`

Show a tile's release channels — which version is **live** (what players run)
and which versions custom channels serve, plus each channel's schema version. Owner
only. Note: schema versions are not populated by the publish path yet, so the
schema column currently shows as unknown/null for every channel.

```bash
poe-tiles tiles channels myuser/my-app
poe-tiles --json tiles channels app_123
```

Arguments:
- `<tileHandleOrId>`: app ID or `userHandle/appHandle`.

### `tiles set-channel` / `tiles delete-channel`

Point a custom channel at a specific published version, or delete it.
Owner only. Use these to keep named test channels separate from live.

```bash
poe-tiles tiles set-channel myuser/my-app beta 3 --no-auto-advance  # pin beta to v3
poe-tiles tiles set-channel myuser/my-app beta 5         # create/point a custom "beta" channel (manual)
poe-tiles tiles set-channel myuser/my-app beta 6 --auto-advance  # make it follow the newest upload
poe-tiles tiles delete-channel myuser/my-app beta        # remove a custom channel
```

Arguments:
- `<tileHandleOrId>`: app ID or `userHandle/appHandle`.
- `<channel>`: channel name — lowercase letters, digits, and hyphens.
- `<versionNumber>` (set-channel): the published version to point at.

Notes:
- `live` is the only reserved channel name: it cannot be set or deleted with
  these commands. Live moves through `tiles promote`, `tiles deploy`, or
  its follow-latest preference.
- `staging` is an ordinary custom channel name. Its old automatically maintained
  channel was retired; creators can create, repoint, and delete their own.
- `--auto-advance` makes the channel jump to the newest version on every upload
  and `--no-auto-advance` pins it manually. Omitting both flags preserves the
  channel's current setting. A brand-new custom channel starts manual.

### `tiles auto-advance` / `tiles promote`

Live follows the latest upload by default. Pin live before uploading a version
that should remain a test, then promote the tested version without re-uploading:

```bash
poe-tiles tiles auto-advance myuser/my-app off  # pin live before a test-only upload
poe-tiles tiles upload                        # record a version; pinned live stays unchanged
poe-tiles tiles promote myuser/my-app 3        # release existing v3 and leave live pinned
poe-tiles tiles auto-advance myuser/my-app on  # resume following future uploads
```

These owner-only commands take an app ID or `userHandle/appHandle` followed by
`on|off` or a published version number, respectively. In a managed Creator
workspace, follow the host's publishing and channel rules.

### `tiles upload` / `tiles deploy`

**An upload records a new version, and live follows new uploads by default.**
For a test-only upload to an existing tile, turn off live auto-advance first.
With live pinned, a plain upload leaves live unchanged; `tiles deploy` is the
same upload plus an explicit promote, making that new build live in one step.
Use `tiles channels` to inspect the current state and `tiles promote` to release
an existing version without re-uploading. Read
[publish rollout](../tile-creator/references/publish-rollout.md) for the full
upload-then-promote workflow and version previews. (`tiles publish` is the
upload command's old name and still works as an alias; its deprecated
`--promote` flag is what `tiles deploy` replaces.)

```bash
poe-tiles tiles upload                  # also advances live while it follows latest (default)
poe-tiles tiles deploy                  # upload AND make this build live even while live is pinned
poe-tiles tiles upload --handle my-app --dir ./dist
poe-tiles tiles upload
poe-tiles tiles upload --change-summary "Added touch controls and improved scoring."
# Inside a platform Edit session: preview normally, then finalize the original tile.
poe-tiles tiles upload --finalize-edit
poe-tiles tiles upload --finalize-edit --edit-handle renamed-tile
poe-tiles tiles upload --handle my-app --dir ./dist --display-name "My App" --short-description "A fast party game."
poe-tiles tiles upload --handle my-app --dir ./dist --source-bundle . --source-bundle-visibility owner_only
poe-tiles tiles upload --handle my-app --profile-picture ./assets/icon.png --long-description ./README.md
poe-tiles tiles upload --handle my-app --profile-picture="" --short-description="" --long-description=""
```

Options:
- `--handle <handle>`: app handle. Required unless `.poe-tile.json` provides one.
- `--dir <path>`: directory containing app files and `index.html`. Defaults to `.poe-tile.json` `runtimeBundle.dir`, or `dist`.
- `--publish-as-poe`: upload under the `@poe` system account. Requires an allowlisted API key.
- `--no-publish-as-poe`: upload under the calling user (the default).
- `--source-bundle <path>`: source-code directory to upload alongside the runtime bundle. Requires `--source-bundle-visibility`.
- `--source-bundle-visibility <vis>`: `owner_only` or `public`.
- `--source-bundle-ignore <path>`: ignore file with extra source-bundle exclusion patterns.
- `--profile-picture <pathOrUrl>`: app icon. Local PNG/JPG/WEBP <=512 KB, or an `https://` URL. Empty string clears.
- `--short-description <text>`: one-line tagline <=140 chars. Empty string clears.
- `--long-description <path>`: markdown file <=16 KB. Empty string clears.
- `--display-name <name>`: human-friendly name <=80 chars. Empty string clears.
- `--change-summary <text>`: per-upload user-facing summary <=500 chars, included in Creator chat receipts.
- `--finalize-edit`: inside a platform Edit session, upload the current project to the original tile instead of its unlisted preview. The server rejects this outside the matching Edit session.
- `--edit-handle <handle>`: with `--finalize-edit`, explicitly rename the original tile; otherwise its current handle is preserved.

`tiles deploy` accepts the same options. It uploads and then promotes in-band —
the server promotes under the same request identity that uploaded, so it
composes with `--publish-as-poe` and the other publish-as identities. To release
an already published version, use `tiles promote` instead. See the
publish-rollout reference for schema-downgrade limitations.

Use the current schema v10 to set the config-only `instancing` field
(there is no CLI flag for it):

```json
{
	"$schema": "https://poe-tiles-docs.pages.dev/schemas/poe-tile/v10.json",
	"handle": "word-duel",
	"instancing": "per-context"
}
```

`per-launch` is the default. Omitting `instancing` on a later upload preserves the existing value; set `"per-launch"` explicitly to reset it.

Categories are assigned automatically by the platform. Do not submit a
`categories` field. If a legacy `.poe-tile.json` contains it, delete the top-level
field (including a `null` or empty value) and retry; keep other metadata intact.

For questions about when players receive a released build, read [player update behavior](references/player-updates.md). It distinguishes version-pinned previews from live updates and explains device caching and reloads.

## Store Commands

Store commands use the authenticated user-router WebSocket. Each command accepts `--timeout-ms <ms>` where listed; default is `15000`.

### `stores access`

```bash
poe-tiles stores access todo-store room-1
poe-tiles stores access todo-store room-1 --timeout-ms 30000
```

Arguments:
- `<typeId>`: store type ID.
- `<instanceId>`: store instance ID.

Options:
- `--timeout-ms <ms>`: WebSocket open and response timeout in milliseconds.

### `stores pull`

```bash
poe-tiles stores pull todo-store room-1 --after-version 0
poe-tiles stores pull todo-store room-1 --after-version 42 --target-local-bytes 2000000
poe-tiles --json stores pull todo-store room-1 --after-version 0 | jq '.patches'
```

Arguments:
- `<typeId>`: store type ID.
- `<instanceId>`: store instance ID.

Options:
- `--after-version <version>`: only return patches after this store version. Default: `0`.
- `--target-local-bytes <bytes>`: target local data budget for the pull. Default: `1000000`.
- `--timeout-ms <ms>`: WebSocket open and response timeout in milliseconds.

### `stores schema`

```bash
poe-tiles stores schema todo-store room-1
poe-tiles --json stores schema todo-store room-1 | jq '.commands.mutators'
```

Arguments:
- `<typeId>`: store type ID.
- `<instanceId>`: store instance ID.

Options:
- `--timeout-ms <ms>`: WebSocket open and response timeout in milliseconds.

### `stores get`

```bash
poe-tiles stores get todo-store room-1 todos todo-1
poe-tiles --json stores get todo-store room-1 todos todo-1 | jq '.value'
```

Arguments:
- `<typeId>`: store type ID.
- `<instanceId>`: store instance ID.
- `<tableName>`: table name visible to the authenticated user.
- `<itemKey>`: item key.

Options:
- No command-specific options. Global `--json` is useful for scripting.

### `stores scan`

```bash
poe-tiles stores scan todo-store room-1 todos --limit 50
poe-tiles stores scan todo-store room-1 todos --sort-key-prefix active --limit 20
poe-tiles stores scan todo-store room-1 todos --cursor '{"itemKey":"todo-1","sortKey":"active"}' --limit 20
poe-tiles stores scan todo-store room-1 todos --cursor '$last' --reverse --limit 20
poe-tiles --json stores scan todo-store room-1 todos --limit 50 | jq '.items'
```

Arguments:
- `<typeId>`: store type ID.
- `<instanceId>`: store instance ID.
- `<tableName>`: table name visible to the authenticated user.

Options:
- `--sort-key-prefix <prefix>`: only include sort keys with this prefix.
- `--item-key-prefix <prefix>`: only include item keys with this prefix.
- `--cursor <cursor>`: entry-key JSON cursor, `$first`, or `$last`.
- `--limit <count>`: maximum number of items to return.
- `--reverse`: scan in descending order.

### `stores action`

```bash
poe-tiles stores action todo-store room-1 countTodos
poe-tiles stores action todo-store room-1 summarize --input '{"status":"open"}'
poe-tiles stores action todo-store room-1 importPreview --input-file ./input.json
poe-tiles --json stores action todo-store room-1 countTodos | jq '.result'
```

Arguments:
- `<typeId>`: store type ID.
- `<instanceId>`: store instance ID.
- `<actionName>`: action name.

Options:
- `--input <json>`: inline JSON input.
- `--input-file <path>`: read action input JSON from a file.

Omit both input options to pass `{}`. Pass at most one of `--input` or `--input-file`.

### `stores mutate`

```bash
poe-tiles stores mutate todo-store room-1 setTodo --input '{"id":"todo-1","text":"Buy milk"}'
poe-tiles stores mutate todo-store room-1 clearDone --input null
poe-tiles stores mutate todo-store room-1 importTodos --input-file ./input.json
poe-tiles --json stores mutate todo-store room-1 setTodo --input '{"id":"todo-1","text":"Buy milk"}' | jq '.version'
```

Arguments:
- `<typeId>`: store type ID.
- `<instanceId>`: store instance ID.
- `<mutationName>`: mutator name.

Options:
- `--input <json>`: inline JSON input.
- `--input-file <path>`: read mutator input JSON from a file.
- `--timeout-ms <ms>`: WebSocket open and response timeout in milliseconds.

Pass exactly one of `--input` or `--input-file`.

### `store files upload`

```bash
poe-tiles store files upload touch-grass room-1 ./photo.jpg --content-type image/jpeg
poe-tiles --json store files upload touch-grass room-1 ./photo.jpg | jq '.fileId'
```

Arguments:
- `<typeId>`: store type ID.
- `<instanceId>`: store instance ID.
- `<file>`: local path to a non-empty file of at most 10 MiB.

Options:
- `--name <name>`: display name; defaults to the local file's basename.
- `--content-type <type>`: receiver hint; the platform inspects the bytes authoritatively.

The authenticated user must be an active instance member, and the app must opt
in with `_requestUploadUrl`. Claim the returned `fileId` in a
`fileRefs`-declared field using `store mutate`; unclaimed uploads expire.

## Model Commands

```bash
poe-tiles models list
poe-tiles --json models list | jq '.[].id'
```

Options:
- No command-specific options.

## Account Commands

```bash
poe-tiles accounts list
poe-tiles accounts unlink github
poe-tiles --json accounts list
```

Commands:
- `accounts list`: list linked OAuth accounts.
- `accounts unlink <providerId>`: unlink one connected account.

Arguments:
- `<providerId>`: provider ID to unlink.

Options:
- No command-specific options.

## Skills Commands

```bash
poe-tiles skills install
poe-tiles skills install --dir .agents/skills
poe-tiles skills install --dir path/to/skills
```

Options:
- `--dir <path>`: custom target directory. Each skill is written as `<dir>/<skill-name>/`. Without this option, installs both `.claude/skills` and `.agents/skills` and creates `AGENTS.md` if missing, preserving existing project instructions.

Install merges with existing skill directories: matching files are overwritten, and user-added files outside the bundle are preserved.

## Scripting Patterns

```bash
poe-tiles --json tiles list | jq '.[].handle'
poe-tiles --json auth points-history | jq '[.[] | .cost_points] | add'
poe-tiles --json stores schema todo-store room-1 | jq '.commands'
poe-tiles --server http://localhost:8787 --json tiles list
```

When a user asks for a command's options, prefer `poe-tiles <command> --help` as the final source of truth if the installed CLI may differ from this skill.
