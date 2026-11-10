# Scaffolding a new Joiner tile

End-to-end workflow for creating a new app from a natural-language prompt. Scaffold → schema → UI → ship.

<a id="scaffolding-a-new-poe-tile"></a>

---

## Step 1: Scaffold

Pass both `<name>` and `--template <t>` explicitly when scaffolding with an agent. Omitting either opens an interactive picker that a non-interactive session cannot answer. Reuse an existing project instead of scaffolding over it; install dependencies inside the scaffolded directory.

Pick a template: `react`, `preact`, `solidjs`, `vanilla-js`, `phaserjs`. Pick `phaserjs` for real-time 2D games with sprites, world coordinates, or arcade physics — it ships with the Phaser 3 dep, vite configured to inline assets and dynamic imports for the platform sandbox iframe, and a dynamic-import seam so happy-dom unit tests stay Phaser-free.

For a new small interface naturally expressed with ordinary DOM elements, prefer the existing `vanilla-js` template. Use a framework when the interaction benefits from it or the user requests it, and preserve the framework of existing work. Keep all platform behavior, accessibility and visual identity requirements.

The `react`, `preact`, and `solidjs` templates ship Tailwind v4 preconfigured (`tailwindcss` + `@tailwindcss/postcss` deps, `postcss.config.js`, `@import "tailwindcss"` in `tile/styles.css`) — utility classes work out of the box. `vanilla-js` and `phaserjs` do not; if you need Tailwind there, wire it up the same way (deps + postcss config + `@import "tailwindcss"` in `tile/styles.css`) before relying on utility classes, otherwise they will silently render as no-op strings.

Where Tailwind is already configured, prefer its utilities for routine layout, spacing, typography, responsive styling and theme colors. Keep complete class names visible in source; reserve custom CSS for behavior or visuals utilities do not express clearly. Preserve the setup, safe areas, root scrolling, native gestures, focus states and touch targets. Choose the tile's own palette, typography and composition; this is reuse of styling tools, not a shared visual template. Use existing CSS when Tailwind is absent rather than adding it just for this preference.


```bash
poe-tiles tiles init <name> --template <t>
cd <name> && bun install
```

`<name>` becomes the publish handle, which is unique per creator and hard to change once a session is bound to it — so use the kebab-case base derived from the prompt plus a short random suffix (`zombie-runner-k4x7`). A bare descriptive handle collides with, or silently republishes over, an earlier tile from a similar prompt. The handle never has to be pretty: `displayName` (Step 5.5) replaces it on every user-facing surface.

### Generated files

```
<name>/
├── tile/                      # entry point + backend wiring
│   └── src/
│       ├── entry.tsx          # Poe.setupStore(clientConfig); await store.waitForBootstrap(); render UI
│       └── backend.ts         # re-exports tileBackendConfig as default
├── synced-store/              # store contract
│   ├── data/
│   │   └── items.ts           # shared read helpers + table/read ctx types
│   ├── schema.ts
│   ├── mutators/
│   │   ├── index.ts           # compose exported mutator map
│   │   ├── remove-todo.ts
│   │   ├── set-todo.ts
│   │   └── types.ts
│   ├── mutators.test.ts       # colocated unit tests
│   ├── hooks.ts               # deterministic membership hooks, shared by client + backend
│   ├── client-config.ts
│   └── backend-config.ts
├── ui/                        # store-agnostic components
│   ├── App.{tsx,ts}
│   └── App.test.happydom.tsx  # colocated UI tests
├── tests/                     # Happy DOM setup/matchers + optional skipped browser examples
├── scripts/doctor.sh          # toolchain health check
├── client.ts                  # client-safe re-exports
├── package.json
├── tsconfig.json
├── vite.config.ts
└── playwright.config.ts
```


---

## Step 2: Schema and mutators

Read `@../synced-store/SKILL.md` **now** before continuing — Step 2 depends on it.

**Walk every cross-turn / cross-player handoff and pick a visibility tier per piece of state.** Skipping this is the #1 cause of mid-implementation rewrites.

Tiers:
- **Public** (`ctx.table(...)`) — synced to everyone in the instance.
- **Per-user private** (`ctx.privateOfUser(userId).table(...)`) — role/user-specific (active player's input, in-flight LLM prompt, drafts).
- **Server-only** (`ctx.serverOnly().table(...)`) — secrets the server uses but never exposes (answer keys, RNG seeds).

Don't design around tiers with client-side hiding/encryption — synced-store enforces at the server boundary.

**Before writing schema, classify every table as bounded or unbounded and state its primary read shape.** When unbounded data is mostly presented as one ordered list (for example, chronological message/activity history or a newest-first social/photo feed), every accumulating row must have a nonempty `sortKey`; choose its namespace and ordering direction now even if the first UI does not yet paginate. A safety cap or quota does not make a naturally accumulating history bounded for this decision. Keep small always-needed rows at the empty sort key (`sortKey: ""`) so they load eagerly. Eager rows and lazily loaded sort-key rows can always coexist in the same store. Read [@../../synced-store/references/sort-keys.md](../../synced-store/references/sort-keys.md) for generation and pull windows.

**Before writing schema**, list every table with its tier AND every cross-player handoff with the table backing it; state the design to the user for confirmation. For turn-based games answer:
- Active player's view this turn? → typically `privateOfUser(activePlayer)` written by the prior player's mutator.
- Mid-turn state surviving refresh (e.g. in-flight bot call)? → `privateOfUser(self)`, NOT sessionStorage / component state.
- Hidden during play, revealed at end? → `serverOnly()` during play, copied to public on reveal.
- Stalled turn policy? → ask whether the game should wait indefinitely or let another player activate a skip after an inactivity deadline. If skippable, confirm the tile-specific duration and result of skipping before designing the schema; do not assume that a seconds-long party game and a many-hours asynchronous game share a timeout.
- Player leaves the room? → distinguish explicit membership removal from closing the tile or disconnecting, which must preserve resumable state. Decide whether `onRemoveUser` can remove the seat and repair turn order, teams, and win conditions without breaking fairness. If not, model a durable resolution state where the remaining players choose a new match or a game-specific alternative; do not silently choose for them.

If any answer is "figure out later," figure it out now.

Either keep generic `app*` names (simplest) or rename across `synced-store/*` + `client.ts` + `tile/src/entry.{tsx,ts}` + `tile/src/backend.ts` + `ui/App.{tsx,ts}` together.

Lift **patterns** from a reference app, not code: lobby+slot shape, add/remove hooks (wired in `backend-config.ts`; reference apps still use the deprecated `onAddUsers`, so write `onAddUsersV2` instead), turn-validation order (throw BEFORE `if (!ctx.isServer) return`), `entries().toArray()` returning `[EntryKey, T]` with `EntryKey.itemKey: string`, `store.query(tx => tx.userId)` for user id.

---

## Step 3: UI

Replace the stub in `ui/App.{tsx,ts}`.

- `App` receives `{ store }` prop. `store.subscribe()` for reads, `store.mutate.<name>()` for writes.
- For the framework-specific React, Preact, SolidJS, Vanilla JS, and Phaser binding, follow the [compact multiplayer API recipe](./multiplayer-api-recipe.md#5-bind-the-shared-reader-to-the-scaffold).
- Do not create another Poe client in the UI. Pass `store` and, when host RPCs
  are needed, the entry point's real `Poe` object as props. Import only the
  scaffold's framework adapter (`v1/react` or `v1/solid`) directly in UI code.
- `store.userId` is not exposed at the top level. Read via `store.query(async (tx) => tx.userId)`.
- `store.subscribe(tx => tx.table("foo").entries().toArray(), entries => ...)` returns `Array<[EntryKey, T]>`. Destructure as `[k, v]`, key is `k.itemKey` (NOT `as string`).
- Subscription queries track only exact keys and scan prefixes read through `tx`; changing a value captured outside `tx` does not invalidate the query. Keep the returned `SubscriptionControl`, call `await subscription.refresh()` after such a change, and call `subscription()` to unsubscribe during cleanup. `subscribeToTable()` returns the same control shape.
- Keep the scaffold's `applyNativeAppGestureOverrides()` startup call for every player-facing tile. Remove it only when free text selection is a primary feature of a document-like or text-heavy tile.
- No tile may show the iOS magnifier loupe. Before choosing interaction handlers, inventory every non-scrolling surface where a finger may pause or drag (board, canvas, rack, card/piece field, joystick, control pad, HUD, buttons, menus, overlays). Apply `suppressLongPressMagnifier(element)` even if the tile has no explicit hold gesture: slow taps enter the same iOS WebKit selection gesture. Use `{ preserveTaps: true }` only when descendant taps depend on `click`; never suppress a native scroller, form field, or navigation link.
- **Avatars + names from `$userInfo`.** Pull from the `$userInfo` system table — never raw user IDs. Pair `$users` membership with `$userInfo` lookup. Subscribe once, build `Map<userId, PoeUserInfo>`:

  ```ts
  // PoeUserInfo (from @poe/synced-store-system-mutators): { userId, username, displayName, profilePicture, isDev? }
  // displayName / profilePicture are required strings but may be EMPTY — always fall back.
  store.subscribe(
      (tx) => tx.table("$userInfo").entries().toArray(),
      (entries) => {
          const next = new Map<string, PoeUserInfo>();
          for (const [, v] of entries) next.set((v as PoeUserInfo).userId, v as PoeUserInfo);
          setUserInfo(next);
      },
  );
  // <img src={info.profilePicture || PLACEHOLDER} alt={info.displayName || info.username} />
  // Name fallback: displayName, then username, then a NEUTRAL label ("Player") —
  // never the raw userId. A not-yet-resolved member profile can carry internal
  // ids (`u_<hex>` / `private-...`) in displayName/username; skip those too:
  // const usable = [info?.displayName, info?.username].find(
  //   (v) => v && !/^u_[0-9a-f]{32}$/.test(v) && !v.startsWith("private-"),
  // );
  ```

  Use `||` not `??` so empty strings fall through.

Once the UI is functionally complete, finish required listing metadata and
publish immediately. There is no authorization step and nothing to carry
across from one: a publish always creates an unlisted tile, and listing it
publicly is a separate step you mention in one sentence beside the preview
link, never a question you ask. The profile picture is part of that first
publish; gallery screenshots and video are the only separate gate, deferred
in Step 5.5 until the user is ready to present the tile as finished.

---

## Step 5.5: Fill in app metadata

Complete text metadata. `displayName` is a nonempty string of at most 80 characters and `shortDescription` is a nonempty string of at most 140. Player-count keys are `players.min` and `players.max`; use positive integers and omit an unbounded maximum. `instancing` is the string `"per-launch"` for separate launches or `"per-context"` for reuse within the launch context, not an object. Preserve the generated handle and SDK pin unless the host or requested change requires otherwise.

**Fill in the listing-page metadata yourself — do not ask the user.** The scaffold ships text fields as `TODO` placeholders and cannot infer the supported player count. Derive every value from what the app actually does (its `synced-store/schema.ts`, `ui/App.*`, and the original prompt). After this step there must be zero literal `TODO` strings in the text metadata.

1. **`.poe-tile.json` → `displayName`** — a **placeholder summary name**, not a final title: "New" plus the kind of tile the prompt asked for — `"New Zombie Tile"`, `"New Strategy Tile"`, or plain `"New Tile"` when the prompt names no theme. Do not invent a real name here: the user names the tile only when they ask to list it publicly — that is the moment you propose a real title (see Step 6) — and a name they supplied at any point always wins over the placeholder. The placeholder is what the launch-link preview shows, so it should still summarize the tile; it need not be unique — the handle and tile ID carry uniqueness.

2. **`README.md`** — long description rendered on the app's landing page. Rewrite the scaffold stub as a **short, player-facing description**: 2–4 sentences of prose, written for someone deciding whether to play, derived from the app's actual behaviour (schema/UI). Just the title + the paragraph — **no** `## What you can do` bullet list and **no** `## Built on Synced-Store` section. Keep under 16 KiB UTF-8.

3. **`.poe-tile.json` → `shortDescription`** — replace the placeholder with one specific sentence (≤140 chars). Say what the user does in the app, not what the app "is for". Examples: *"Online chess for two players."*, *"Shared todo list synced across devices."*, *"Real-time multiplayer draw-and-guess party game."* Avoid leading filler like *"An app to…"*.

4. **`.poe-tile.json` → `players`** — for every game or participant-count-sensitive tile, declare the supported player-count facet. Count total seats, including humans and AI; derive the values from the rules and capacity the app actually implements, not the number of people currently in the room or a test fixture.

   - Set `min` to the fewest participants needed for a meaningful session.
   - Set `max` only when the rules, board, seats, or validated performance impose a real creator-declared upper bound. For an exact two-player game, use `{ "min": 2, "max": 2 }`. When the implementation has no upper bound, omit `max`: `{ "players": { "min": 1 } }` is shown as `1+`. Never substitute the schema or platform ceiling, which would turn an uncapped tile into a misleading finite range.
   - Add `recommended: { min, max }` only when a narrower range is materially better than the full supported range (for example, a party game that supports 3–12 but plays best with 5–8). Keep it within the supported range.
   - Omit `players` for utilities where participant count does not describe the experience. Do not publish `players: null` for a new tile; `null` is only the explicit clear sentinel when republishing an existing tile.
   - This field also decides testability, not just the listing page: a tile the range calls multiplayer gets a **multiplayer simulation** link in upload output and in the Creator chat receipt, opening `recommended.min` (else `min`) dev-user phones already inside the tile. See [cli.md](cli.md#tiles-upload-output).

5. **Leave discovery categories to the platform.** Do not add a `categories` field to `.poe-tile.json`. Use schema v10; when editing older source, remove the obsolete top-level field before publishing. Single-player / Multiplayer remain derived from the supported `players` range.

Generate the profile picture automatically before the first publish; do not ask for permission or wait for public-publish authorization. Keep an existing icon during edit drafts; when finalizing an update to an already-public tile, regenerate it automatically only when it is missing or materially stale.

In a Creator session, where the `generate_image` tool is present, make the icon with the `image-generation` skill's **Icon** section before you end any turn that invites public listing — for an integrated prototype, in staging before `promote_conversion` — so the creator sees it before they publish, and do not run `regenerate-screenshot` for it. That section replaces item 6's image work, and `publish` checks it again at listing. When finalizing an update to a tile that is already public, make a missing or materially stale icon with `generate_image` and the recipe in the `image-generation` skill's **Icon** section. Outside a Creator session, item 6 applies as written.

Create screenshots only when the user is ready to present the tile as finished, or when finalizing an update to an established tile. Visibility does not mark this boundary: the gate is the user's readiness to present the tile as finished. At that point, ask whether they want the optional, more expensive video work before starting it.

In a Creator session, the `publish` skill owns the gallery screenshots of item 7. It captures missing ones when it lists or promotes the tile, and asks before it replaces ones that look stale. Do not capture them at readiness there unless the creator asks. Outside a Creator session, item 7 applies as written.

6. **`.poe-tile.json` → `profilePicture`** — before the first publish, commit a square image that reflects the tile's actual theme and visual identity, then point `profilePicture` at the committed PNG/JPG/WEBP file (≤512 KB). Do not leave the scaffold's starter image or omit the field.

   The scaffold ships a generator for this — **do not hand-roll a screenshot script**. `bun run regenerate-screenshot` builds the app, boots it in a square 360×360 viewport at 2× DPR, and writes a 720×720 `assets/screenshot.png`; point `profilePicture` at that file. It drives `tests/screenshot.test.playwright.ts`, which is skipped in the normal test suite and exists only to produce this asset. It needs a Playwright browser, so run `bunx playwright install chromium` first if you have never done so in this environment.

   Prefer a first frame that actually reads as the tile: set up whatever board, lobby, or start state best represents it before the capture rather than shipping an empty screen.

   **The icon art must be full-bleed: a square image with opaque, edge-to-edge artwork — no baked-in rounded corners, no transparent margin, no framing border.** The listing/detail card renders the icon with `object-cover` inside an `overflow-hidden` rounded shell, so the *card* supplies the rounded corners. An icon that bakes in its own rounded background (transparent corners around a rounded rect) renders as a rounded card inside the card's rounding → a visible "double-rounded", inset look, unlike well-behaved tiles whose square art rounds cleanly at the card edge. A `regenerate-screenshot` capture is already full-bleed; just make sure the captured state fills the frame.

   If the tile's UI itself is the strongest icon, generate a 720x720 square UI capture with `bun run regenerate-screenshot`, update `.poe-tile.json → profilePicture` to `./assets/screenshot.png`, and commit the file. The test loads the tile inside the iframe sandbox and writes that file. If the default `body` readiness check produces a blank or half-rendered image, edit `tests/screenshot.test.playwright.ts` to wait for a specific selector (matching what the existing `e2e.test.playwright.ts` waits for is usually the right move). For canvas/3D apps, expose a deterministic scene-ready marker after the first rendered frame and wait for that marker. Re-run after meaningful UI changes only if the screenshot is being used as `profilePicture`.

   **Mobile viewport / DPR.** The scaffold sets `viewport: { width: 360, height: 360 }, deviceScaleFactor: 2`. The CSS viewport stays under Tailwind's `sm` breakpoint (640px) so apps render their true mobile layout (single column, no desktop side-panels), while the 2x DPR still produces a 720x720 PNG. Do not raise the CSS width to 720+ to "see more" — that triggers `sm:`/`md:` styles and the captured image will misrepresent the mobile app.

7. **`.poe-tile.json` → `screenshots`** — when the user is ready to present the tile as finished, capture and commit 1–3 representative gallery images (each PNG/JPG/WEBP ≤512 KB), then add their ordered paths to the manifest. At least one image must show genuine gameplay or a meaningfully populated primary state — not merely a title screen, empty lobby, pristine starting board, or first frame. Add a setup/start image only when it explains something the in-action image cannot. For an established tile, update only missing or materially stale screenshots.

8. **`.poe-tile.json` → `video` (optional)** — when the user is ready to present the tile as finished, explain that video work costs more than screenshots. Ask whether they want a preview video and poster before creating them. If they decline, continue publishing without new video work. If they accept, capture a representative 10–15 second muted gameplay loop as a local MP4 (≤8 MB), create a local poster image (PNG/JPG/WEBP, ≤512 KB), set `video` to `{ "src": "<path>", "poster": "<path>" }`, and use `$schema` v6 or later. For an already-public tile, ask only when its video is missing or materially stale; never create or regenerate it without an explicit yes.

While iterating, complete item 6 and defer items 7–8 until the user is ready to present the tile as finished — visibility does not mark this boundary, so the gate is the user's readiness to present the tile as finished. Only after that proceed to Step 6.

---

## Step 6: Publish

**Publishing is your HOST's, not this step's.** If your system prompt says how
publishing works here — who uploads, when, and what the creator's buttons do —
follow it and skip the rest of this step; a host that publishes for you records
a duplicate version for every upload you run yourself. The commands below are
for a creator driving the CLI with no such host. See
[publishing.md](publishing.md) for the full mechanics.

Build + publish using a browser-login session from `poe-tiles login`. Publish every iteration:

```bash
cd <app-dir> && bun run publish-to-poe-tiles -- --change-summary "<concise user-facing summary>"
```

**Publishing never sets visibility.** A tile is unlisted when first published and stays wherever it is on every publish after that, so iterating can never move it in or out of discovery.

Listing it is a separate, explicit command, never a question you ask them, and only ever run on their request:

```bash
poe-tiles tiles visibility <tileHandleOrId> public
```

Use `unlisted` to take it back out. Unlisting removes a live tile from discovery and the user does not necessarily see it happen, so never run it as a step in ordinary iteration.

If publishing reports missing auth, run `poe-tiles login` in the background, post the approval URL it prints as a clickable markdown link along with its `Enter code:` value, and wait for the user to approve the browser prompt. Do not ask first-time creators to paste a Poe API key into chat. `POE_TILES_SESSION_TOKEN` and legacy API keys are still supported for automation, but they are not the primary creator path.

Report the `appUrl` from the output as a clickable markdown link the user can try.

---


---

## Final step: Report

Tell the user what was built and where the project lives. Hand them the preview link.

