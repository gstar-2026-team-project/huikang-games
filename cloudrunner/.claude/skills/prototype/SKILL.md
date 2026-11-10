---
name: prototype
description: Default workflow for a new Joiner tile. Build a store-less, single-device prototype that publishes as a preview at the end of the first turn, iterate on how it feels, then integrate it with the Joiner platform when the creator asks. Applies automatically when a creator session inlines it or when the workspace holds a `.poe-prototype` marker. Requests for platform integration or to skip prototyping go to its Integrate with Joiner section.
allowed-tools: Bash, Glob, Grep, Read, Edit, Write
user-invocable: false
---

# Prototype


**User Argument:** {{user_input}}

This is the default workflow for new Creator v2 tiles. The creator can choose `/one-shot` to build directly on Joiner instead, or `/platform-prototype` to build directly on Joiner; ordinary creator skills customize the prototype without changing its workflow.

The request is the text after this skill block (or the argument above). If the conversation shows a `/help-me-build` interview the creator has not confirmed yet, continue the interview instead of building; once they confirm, the request is the design they confirmed. **Start immediately** for a new idea: say what you'll build in a few lines — the idea, not the plan — then write the files; the file is the draft, so do not write the code in your head first (see Working with the creator in your system prompt). Keep editing the prototype when `.poe-prototype` exists. When Creator inlines this workflow, it has already checked workspace eligibility and the required capabilities. Trust that selection: do not run a separate workspace or capability preflight, add a path-selection step to the plan, or announce which path you chose. For a new tile, go straight to writing the prototype files below; for an edit, read the relevant existing files as part of implementing the change. Progress updates should describe what you are building.

Depart from this default only when the request or session context calls for it:

- **Loaded outside Creator's workflow selection.** Before following this workflow, check that your tool list has both `begin_conversion` and `promote_conversion`, and your system prompt or a platform notice says durable workspace checkpoints (workspace backups) are enabled. If either is missing, say in one line that the prototype workflow is unavailable in this session, do not write `.poe-prototype`, and follow `tile-creator` for the request as it stands. Locate existing work before writing so an integrated tile is preserved.
- **A tile with platform integration already exists.** A `.poe-tile.json` in the workspace with no `.poe-prototype` beside it is a tile with Joiner platform integration. Continue with `tile-creator`. Do not call `begin_conversion`; keep working on the existing tile.
- **Integrate with Joiner.** The request asks to finish the prototyping phase and build the full version on the Joiner platform ("I'm done prototyping", "finish prototyping", "build the real version", "connect it to Joiner", "save progress", "make it multiplayer", "make it real", "convert the prototype"), or asks to build directly on Joiner with no prototype step ("skip the prototype", "build the multiplayer version now"). The `finish-prototype` skill, inlined when the creator presses Finish prototyping or types `/finish-prototype`, is this request. Go to Integrate with Joiner, even in a session whose workflow setting is direct.

Describe this step to the creator as finishing the prototyping phase and building the full version, in terms of what it adds: saved progress, shared state, and multiplayer features as appropriate to the tile. Use "finish prototyping" and "build the full version" in progress updates and invitations to take this step, not "integrate with the Joiner platform".

While a prototype exists, `tile-creator` and `synced-store` are not part of your job: do not read them (the only exception is the reference files that What tiles can do links to, when the creator asks what tiles can do), and do not scaffold, install, or add a store. The bash, write, and edit tools refuse those actions in this phase, and each refusal is counted. Integrate with Joiner is where they come back.

## Prototype

Goal: a preview the creator can open at the end of this turn, written so that the later split into project files is mechanical.

**Start writing immediately; there is no scaffolding or dependency setup.** Create the prototype directory and write the files below directly. Do not look for a starter project or run `poe-tiles tiles init` or a framework generator.

### Files

Write exactly three files under `/workspace/<name>/`. `<name>` is a kebab-case base from the request plus a 12-character random hex suffix (`cat-flap-8c41e67ba203`); it becomes the handle, and nobody has to see it. Generate the suffix by running `bun -e 'console.log(require("node:crypto").randomBytes(6).toString("hex"))'`; use the output, never an invented suffix or the example. Keep the complete handle at most 100 characters. Once a manifest exists, preserve its handle; the host may have changed it to resolve a collision during the first preview publish.

- `.poe-tile.json`:

  ```json
  {
    "$schema": "https://poe-tiles-docs.pages.dev/schemas/poe-tile/v10.json",
    "handle": "cat-flap-8c41e67ba203",
    "displayName": "New Arcade Tile",
    "shortDescription": "One sentence about what this does, under 140 characters.",
    "runtimeBundle": { "dir": "." }
  }
  ```

  `displayName` follows the placeholder rule: "New" plus the kind of tile (`New Word Tile`, or plain `New Tile` when the request names no theme). A name the creator supplied wins over the placeholder. No `sourceBundle`. Discovery categories are platform-assigned; never add a top-level `categories` field to `.poe-tile.json`.
- `.poe-prototype`: empty. Its presence is the phase; every boot re-derives the phase from disk, not from memory.
- `index.html`: the whole prototype.

No `package.json`, no `bun install`, no build, no `poe-tiles-sdk` import. There is no project to install.

### index.html

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` and `<meta name="color-scheme" content="light dark">`.
- A **static shell in the body before any script**: the play surface, already sized to the screen, and the HUD (score, status). No title. The host lifts its loading overlay on the first contentful paint, so this markup, not the script, is what makes the preview appear at once.
- One `<style>` block and one `<script type="module">`, each divided by header comments into these six labelled modules, in this order: `state`, `rules`, `render`, `input`, `loop`, `styles`. The `styles` module is the `<style>` block; label its sections with the same names. Integration ports one module to one file, so keep each module's cross-module reads narrow: `rules` is pure functions over `state`; `render` reads state and draws; `input` translates events into `rules` calls; `loop` owns time.
- **Memory only.** State lives in module variables. No `localStorage`, no network, no external scripts, fonts, or images: the bundle runs from a `blob:` URL and cannot fetch files beside it, so draw with canvas, CSS, and inline SVG. One exception is generated art: an image the creator asked for, or a specific animal, character, or object the request names (a dog, a knight, a teapot), which code-drawn shapes rarely make recognizable. For either, read the `image-generation` skill before you call `generate_image`; it embeds generated images as `data:` URLs. Requested music and every sound effect follow the same exception: read the `audio-generation` skill before calling `generate_music` or `generate_sound_effect`, then embed the saved MP3 using its data-only script. When `generate_sound_effect` is available, generate each sound effect with it instead of synthesizing it with Web Audio.
- **Single device.** A second player is hot-seat or simulated; rooms, turns, and invitations arrive with Joiner platform integration.
- **Tilt and shake are input, with touch first.** When the request mentions tilt, steer, lean, balance, shake, motion, gyro, or accelerometer, read the shared device-motion guidance (`device-motion.md`, beside `player-updates.md` in the `poe-tiles-cli` skill; it is readable in this phase) before designing input and follow its controls model. Non-negotiable: Touch is the default and Tilt is opt-in behind a tap; never motion-only. In the prototype the toggle's choice lives in memory and there is no motion claim to call; integration adds the `privateOfUser` row and the `Poe.motion.claim()` call alongside the store.
- **No third-party APIs, now or after integration.** The no-network rule above also holds for the integrated tile's server code: neither a prototype nor an integrated tile can call a third-party API or a creator-owned server. If the creator asks for live outside data (weather, scores, their own backend), say that tiles cannot do that today and keep the data inside the tile. AI and image generation at runtime are different: the platform provides them through server actions once the tile is integrated. A prototype has no backend, so it has no AI at runtime; promise it for the integration step instead of faking it. Build-time art from `generate_image` (above) is unaffected.

## How a prototype should feel

The prototype exists to answer "does this feel right?", so these are requirements, not polish:

- Mobile first: a 390×760 phone viewport is the design target. Pointer events, `touch-action: none` on the play surface, tap targets at least 44 px, no hover-only affordances.
- Pad against device chrome with `var(--poe-safe-area-inset-top, env(safe-area-inset-top))` and the other three sides. Never use raw `env(safe-area-inset-*)` alone.
- For anything with motion: drive simulation from a fixed or clamped timestep so identical inputs give an identical run at 30 Hz and at 120 Hz. Never scale movement by a raw frame delta.
- For a skill or scored game: generate the challenge per run from a seed kept in state; bound the step between consecutive elements by what the movement constants allow; ramp from a forgiving opening to a floor; score once per obstacle and only after it is fully cleared; match every collision shape to the shape drawn. Unscoreable and unmissable are both failures, so tune both ends.
- Where the player embodies a character, draw one: an assembled silhouette that reacts to input and to what happens to it, not a rectangle or a lone emoji.
- Decorative motion in bursts, not loops: a few items moving at a time for about a second, then a quiet gap of several seconds in which no animation runs; no infinite particle layers (rain, snow, petals as dozens of looping elements); blend modes and filters off moving content. The integrated tile inherits the prototype's look, and continuous ambient motion on a screen players leave open is what heats phones in production.
- Show failures in the UI, not only in the console.

## Screen and look

These decide whether a tile reads as a game or as a web page, so they are requirements:

- **The game is the screen.** The play surface (board, canvas, world, table) fills the tile edge to edge; the HUD and controls sit on top of it or in thin bands at its edges. Never put the game in a card, panel, or centered column with page margins around it.
- **Edge to edge for the picture, not for input.** In the native apps a swipe that starts at a side edge navigates back instead of reaching the game. In the Android app that is a band of roughly 24 px on either side (wider at a higher back-sensitivity setting), and the OS consumes the swipe before the page sees a touch, so no `touch-action` or `preventDefault()` stops it. In the iOS app it is a swipe from the left edge (and from the right edge when there is forward history). Desktop previews never show it. Never require a swipe, drag, or flick to start in that band; a stroke that starts further in and crosses it is fine. Keep tappable controls at least 24 px plus the side safe-area inset from either edge by insetting the control row, not the canvas. A game that accepts a horizontal swipe anywhere on screen is the at-risk class: prefer taps, vertical swipes, or a swipe zone inset from both sides.
- **One screen, no scroll.** Size the root to the tile (`height: 100dvh; overflow: hidden`) and the play surface to the space that remains: keep its aspect ratio and fill the leftover band with the world's own color. All controls and game state stay visible without scrolling at 350×509 and 390×760 (phone) and 780×414 (desktop). Put primary phone controls in the bottom third. Only list or document content scrolls, inside its own container.
- **No website chrome.** No title or logo in a corner, no tagline, subtitle, slogan, feature list, or footer: the platform already shows the name. Every word on screen is something the player needs now: score, state, the next action. Teach with one short hint at the point of action that disappears after the first move.
- **Dark mode dims the world; it does not invert it.** The world keeps its palette in both schemes; under `prefers-color-scheme: dark`, lower the lightness of its brightest surfaces, same hues, so it does not glare inside a dark app. The chrome (HUD text, buttons, dialogs, hints) follows `prefers-color-scheme` through CSS variables. Never hardcode one scheme, and never read the device appearance any other way.

## Finishing a prototype turn

**One quick look, then finish.** The creator trying the preview is the check that matters, and every minute you spend testing delays it. Before you end a prototype turn, you may load the page once, at 390×760 in one color scheme, and read one screenshot saved under `/tmp`, to catch a blank screen, a script error, or a broken layout. If it shows one, fix it and look once more. Do not script a playthrough, play a full round, drive the game with a bot, or capture other sizes or color schemes; design for the sizes above, but do not render each one. Say only what that one look showed, never that the tile passed checks you did not run.

Write `.poe-tile-change-summary` beside `.poe-tile.json`: one plain sentence a person would want to read in Version History. Then end the turn. The platform publishes the directory as an unlisted preview and posts the link; you run no publish command and paste no link.

The next step after prototyping is finishing the prototyping phase and building the full version. Close with one sentence inviting changes or that step once it feels right, for example: "Try the prototype and let me know what you'd like changed, or when you're ready to finish prototyping and build the full version with saved progress and multiplayer." Mention only the capabilities this tile needs. On the first turn, also say that the prototype does not save: its state resets on reload. Do not ask whether to publish the prototype, offer public listing, or describe publishing as its next step. The automatic preview needs no decision from the creator; public listing comes after the full version is built. A request to build the full version authorizes that work, not public listing.

If a creator reports seeing an older preview, read [player update behavior](../poe-tiles-cli/references/player-updates.md). It is shared guidance outside the blocked full-project skills and does not require platform integration.

On a later turn while `.poe-prototype` exists: make the change, write a fresh change summary, end the turn. Keep the module labels intact.

## What tiles can do

When the creator asks whether tiles can do something ("can it take pictures?"), answer from this table. **Prototype** is this phase's `index.html`; **Full version** is the tile after they finish prototyping. For detail, read only the linked section: grep for its heading, then read around that line with `offset` and `limit`. `client-api.md` is too large to read whole. These linked files are the only parts of `tile-creator` and `synced-store` you may read in this phase. A capability that is not in this table or in those files is not available: say so, and do not guess.

| Capability | Prototype | Full version | Details |
| --- | --- | --- | --- |
| Upload a photo or file from the device | No | Yes | [file uploads](../synced-store/references/file-uploads.md) |
| Live camera (face, hand, or pose tracking), microphone, speech input, location, contacts, Bluetooth, payments, share sheet, fullscreen | No | No | [sandbox](../tile-creator/references/sandbox-limitations.md#sandbox-restrictions) |
| Tilt, shake, motion sensors | Phones only, touch first; desktop has none | Phones only, touch first, with `Poe.motion.claim()` | [sensors](../tile-creator/references/sandbox-limitations.md#device-sensors) |
| Copy to the clipboard | Yes (write only) | Yes (write only) | [sandbox](../tile-creator/references/sandbox-limitations.md#sandbox-restrictions) |
| Sound and music (Web Audio, started from a tap) | Yes | Yes | [audio](../tile-creator/references/client-api.md#resumeaudiocontext) |
| Haptics (vibration) | No | Yes | [haptics](../tile-creator/references/client-api.md#poe-haptics) |
| Saved progress after a reload | No, state resets | Yes | [storage](../tile-creator/references/sandbox-limitations.md#sandbox-restrictions) |
| Multiplayer, invites, turns | Hot-seat or simulated only | Yes, real time | [invites](../tile-creator/references/client-api.md#poe-room-openinvitepicker), [turns](../tile-creator/references/client-api.md#setturn-clearturn) |
| Fast real-time multiplayer: shooters, racing, fighting, synced physics | Hot-seat or simulated only | Works, but other players' moves arrive with visible delay; say so before building and offer a design that holds up | [limits](../synced-store/references/limitations.md) |
| Hidden or private information per player | No | Yes | [visibility](../synced-store/references/data-visibility.md#the-three-tiers) |
| Player names and profile pictures | No | Yes | [member info](../synced-store/references/getting-user-info-of-members.md) |
| Leaderboards and end-of-round results | Local only | Yes | [results](../tile-creator/references/client-api.md#poe-room-tileend-input) |
| Push notifications, unread badges, "your turn" | No | Yes | [notify](../tile-creator/references/client-api.md#notifyactivity) |
| AI text or image generation while playing | No | Yes, from server actions; the player needs Poe access | [models](../tile-creator/references/backend-api.md#calling-a-model-from-an-action) |
| Music made while building | Yes, with `generate_music` | Yes | `audio-generation` skill |
| Sound effects made while building | Yes, with `generate_sound_effect` | Yes | `audio-generation` skill |
| Art made while building | Yes, with `generate_image` | Yes | `image-generation` skill |
| AI agents as room members | No | Yes | [agents](../tile-creator/references/client-api.md#poe-agents-create-agentid-name-model-tools-room) |
| Open a web link | No | Yes, the player confirms | [links](../tile-creator/references/client-api.md#poe-openexternalurl-url) |
| Open or embed another tile | No | Yes | [open](../tile-creator/references/client-api.md#poe-open-typeid-instanceid-openprops-anchorsortkey-placement-viewwidth), [embed](../tile-creator/references/client-api.md#poe-tile-custom-element) |
| Scheduled server work (timers, cron, events while nobody plays) | No | No; server code runs when a player acts | [limits](../synced-store/references/limitations.md) |
| Live outside data, third-party APIs, the creator's own server | No | No | [network](../tile-creator/references/sandbox-limitations.md#network-access) |
| Remote scripts, fonts, or images | No | No; bundle them | [network](../tile-creator/references/sandbox-limitations.md#network-access) |
| `localStorage`, `IndexedDB`, cookies | No | No | [sandbox](../tile-creator/references/sandbox-limitations.md#sandbox-restrictions) |

When the answer is "Full version", say that it arrives when they finish prototyping and build the full version, and offer that step. Do not fake it in the prototype. When the answer is "No" in both columns, say that tiles cannot do that today, and offer the closest design that works. When the creator's idea depends on fast real-time multiplayer, tell them before you build, in the first reply, that other players' moves will look delayed in the full version, and offer the alternatives the linked limits list; build what they choose.

## Integrate with Joiner

Goal: preserve the prototype's experience while connecting it to the Joiner platform for saved progress, shared state, and multiplayer features where needed. Keep the same handle and live directory, and preserve the prototype until the tile with platform integration has published once.

1. **Call `begin_conversion` first**, with no arguments, before any other command. It checkpoints the workspace durably, posts the notice the creator sees, lifts the phase guard, and returns `conversionId`, `source` (`prototype` or `empty`), `handle`, `livePath`, and `stagingPath`. Use those values; do not invent paths or a handle. If it returns an error, report it in one line and end the turn: the workspace stays closed to changes, and the creator's next message retries the checkpoint through the platform. After a restart, call it again; it resumes the same integration. If the result says a background agent's candidate is ready, follow the result instead of steps 2–5: it is already ported. Otherwise, once it succeeds, tell the creator in one line that they can leave this page: you keep building, and they'll get a notification when it's ready.
2. **Read `tile-creator` and `synced-store` now.** They govern the staging work from here.
3. **Scaffold into staging:** `cd /workspace/.staging && poe-tiles tiles init <handle> --template <react|preact|solidjs|vanilla-js|phaserjs>` (store on), then `bun install` in the new directory. Confirm it is `stagingPath`. `.staging` is outside the publish scan, so nothing publishes from it, and the scaffold's handle equals the prototype's, which is what the promotion needs.
4. **Port.** For `source: prototype`, one module to one place: `state` splits into synced-store schema (everything durable or shared: progress, scores, seats, turns) and local UI state; `rules` becomes pure functions plus a mutator for every shared transition; `render`, `input`, and `styles` go to the UI; `loop` stays client-side and drives simulation from store state. A hot-seat "second player" becomes a real member and `setTurn`. The prototype has no iOS magnifier suppression, and the full version must never show the loupe: as you port `input` and `render`, call the SDK's `suppressLongPressMagnifier` on every non-scrolling surface a finger can rest on (play surface, HUD, buttons, menus, overlays), as `tile-creator` requires. Copy `displayName` and `shortDescription` from the prototype manifest into the staged `.poe-tile.json` and keep its `handle`. Copy the prototype's generated image and audio files from its `assets/` into the staged `assets/` and load them with `?url` imports, as the `image-generation` and `audio-generation` skills describe; do not carry the data-only `.js` scripts over, and never replace a generated sound effect with a synthesized one. For `source: empty`, there is no prototype to read or port: build from the creator's request. **The port must be modular TypeScript. This is required, not a preference:** each prototype module becomes its own `.ts` file (or a folder of them), no source file is over 400 lines, no game code stays in `.js`, and nothing uses `@ts-nocheck`, `@ts-ignore` or `@ts-expect-error`. Copying the prototype's script into one file is not a port. Before `promote_conversion`, check all three in the staging directory: `find . \( -name node_modules -o -name .claude -o -name .agents \) -prune -o \( -name '*.ts' -o -name '*.tsx' \) -exec wc -l {} \; | sort -n | tail -3` shows no file over 400 lines, `grep -rn --include='*.ts' --include='*.tsx' --exclude-dir=node_modules -e @ts-nocheck -e @ts-ignore -e @ts-expect-error .` finds nothing, and `bun run type-check` passes. The new scaffold passes all three. If any check fails, keep splitting and fixing types; do not promote.
5. **Give the candidate its icon** when you have the `generate_image` tool: read the `image-generation` skill and follow its **Icon** section, with `<tileDir>` the staging directory relative to `/workspace` (`.staging/<handle>`). Without the tool, skip this and continue; a later turn or `publish` makes the icon. **Write `.poe-tile-change-summary` in staging**, beside the candidate manifest, before calling promotion; the bridge carries it into the live directory with the candidate.
6. **Call `promote_conversion({ conversionId })`.** The bridge verifies the candidate, checkpoints it, and performs the renames itself: for a prototype, live to `.staging/<name>.prev` and then staging to live; for an empty source, staging to live. Never `mv` or `rm` those directories and never edit `.staging/conversion.json`. Only candidate-validation failures reopen staging: repair the named problem and call the tool again with the same `conversionId`. Bridge-owned checkpoint, rename, or publication failures keep workspace mutations closed; follow the tool's recovery instructions without editing files or running workspace commands.
7. **End the turn** with no further workspace commands. The change summary is already in the promoted candidate. The publish under the recorded handle, the `.prev` cleanup, and the record cleanup belong to the bridge.

Two manifests with the same handle must never be visible to the publish scan at a turn boundary. The bridge's renames are the only way the integrated tile becomes live.
