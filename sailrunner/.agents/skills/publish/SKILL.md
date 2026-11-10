---
name: publish
description: Publish a Joiner tile from a Creator session. List an unlisted tile publicly, or push the current test version to its players. Use when the creator presses a publish button or types /publish.
allowed-tools: Bash, Glob, Grep, Read, Edit, Write
user-invocable: true
---

# Publish

The creator asked to publish. That request authorizes exactly one of the two actions below, chosen by the tile's current state — never both, and never anything else. Text after the command is part of the request: a title, a version number, or a condition. Honor it.

This skill is for a Creator session on Joiner, where the host publishes an unlisted preview at the end of every turn that changed files and owns listing and release. If you are not in one — there is no `request_listing` tool and `$CREATOR_V2_BOUND_TILE_ID` is unset — say that this command does not apply here and follow `tile-creator`'s publishing reference instead.

Nothing here is a build step: the preview the creator is looking at is already built and uploaded. The only new work is the icon and the gallery screenshots that players see. Capturing screenshots can take several minutes.

## Decide what "publish" means right now

Read the tile's state before acting; do not infer it from earlier in the conversation, because the creator can change visibility from the UI while you work:

```
poe-tiles tiles get "$CREATOR_V2_BOUND_TILE_ID"
```

- **A `.poe-prototype` marker exists in the workspace.** The tile is a prototype, and the next step is finishing the prototyping phase and building the full version, not publishing. Say so in one sentence and invite that step; do not list or promote anything, and do not treat this as a request to integrate.
- **`visibility` is `unlisted` or `dev`.** Nobody can find the tile yet. Follow **List the tile** below.
- **`visibility` is `public`.** People are playing the pinned live version, and the creator wants the current test version to reach them. Follow **Publish a version to players** below.
- **Any other value.** This host does not recognize it; the tile may already be listed. Report the value and stop rather than guess.

An empty `$CREATOR_V2_BOUND_TILE_ID` in a Creator session means the tile has no preview yet; a preview must exist before anything can be listed or promoted. Say so and end the turn.

## List the tile

Listing puts the tile in front of people who did not go looking for it. It is also when the tile gets its real name.

1. **Settle the title.** A listing request does not authorize an invented name. Use the title the creator supplied or accepted in this conversation, including a title given after `/publish`. If there is none, use `ask_user` to propose one they can accept or replace, then end the turn. When step 4 also has a question, check the gallery first and put both questions in the same `ask_user` call. Do not rename or request listing before their answer; their answer resumes this request, and asking for the missing title is a complete response to a publish request.
2. **Apply the accepted title.** Set `.poe-tile.json → displayName` to that exact title. Set the handle to a slug of the same title (lowercase, digits, single hyphens — `Texas Hold'em` → `texas-holdem`). Set it with the rename command, not by editing the manifest — `poe-tiles tiles rename "$CREATOR_V2_BOUND_TILE_ID" <slug>` — then put the same value in `.poe-tile.json → handle`. If the slug is taken, take the closest free variant, say which one you used, and never report a rename you did not see succeed. Set the handle only on this first naming; changing it later breaks shared links.
3. **Give it an icon.** Read the `image-generation` skill from the Skills section and follow its **Icon** section, with `<tileDir>` the directory of the `.poe-tile.json` that step 2 edited: `.` for a root tile, or for example `chess` for `/workspace/chess/`. The icon usually exists already from the turn that invited listing; that section keeps it. If the `generate_image` tool is absent, take that section's failure action wherever its table says generate. This step never blocks listing.
4. **Check the gallery.** Follow **Gallery screenshots** below. A question there ends the turn the same way the title question does: do not request listing before the answer, and the answer resumes this request.
5. **Finish with `request_listing`, passing the accepted title, and end your turn.** Do not run public visibility yourself. The host builds and uploads the accepted identity first, confirms the new version reached live, pins it, and only then lists it. This also runs when no source changed. A build, upload, or release-verification failure leaves visibility unchanged and produces a notice without another creator message; the one-shot request is consumed so a later edit cannot unexpectedly list the tile. Fix the reported issue and request listing again when the creator asks. If the tool is unavailable, explain that listing is unavailable in this session and keep the tile unlisted; do not fall back to changing visibility before an upload.

## Publish a version to players

The people playing the tile are on the pinned `live` version. Every turn since has produced a test version they do not have, and the creator wants the newest one to reach them.

1. **Warn first if there is anything they should know.** You know what is in the version and the button does not: a half-finished change, a schema change that saved data has not migrated past, a feature they described as experimental. If a warning is warranted, give it and end the turn without promoting; they can ask again. If nothing warrants one, do not turn the request into a question — they already said what they want.
2. **Name the version.** Run `poe-tiles tiles channels "$CREATOR_V2_BOUND_TILE_ID"`. The `test` channel's version is the build the creator has been previewing; `live` is what players have. Pick the target first: the version the creator named, after `/publish` or in their request, when they gave one — the command rolls back as well as forward, so a named older version is a deliberate rollback — and otherwise the `test` channel's version. If the target is already what `live` points at, there is nothing to publish: say so and stop, since the promote command has no same-version guard and would report a publish that moved nothing. A rollback is not that case, even when `test` and `live` match.
3. **Promote it.** Run `poe-tiles tiles promote "$CREATOR_V2_BOUND_TILE_ID" <version>` and leave live pinned afterwards so the next edit stays a test version. Never run `auto-advance` or `set-channel`: pinning live and maintaining the test channel belong to the platform. Report the command's result, and never report a promotion you did not see succeed. Players receive the new version on their next open, not instantly; do not say everyone has it now.
4. **Check the gallery after the promotion.** Do this only when you promoted the `test` channel's version, which is the build of the current workspace. Then follow **Gallery screenshots** below. It never delays or replaces the promotion, so ask any question there after you report the result. On a rollback to an older version, skip the gallery check: the workspace does not show that version, so its screenshots cannot be checked against it. Say that the gallery was left alone.

## Gallery screenshots

The gallery is the 1–3 images on the tile's detail card in discovery. Both actions put it in front of players, so check it every time, except after a rollback (see step 4 of **Publish a version to players**). Read `.poe-tile.json → screenshots` and open each image it lists. Then pick the one case that applies:

- **No screenshots are declared.** Capture them now. Do not ask. Run the tile and capture 1–3 images (PNG, JPG or WEBP, each ≤512 KB). At least one must show real play or a well-populated main state. A title screen, empty lobby, untouched starting board or first frame is not enough. Save them in the tile directory, but not under `.visual-checks/`, because uploads exclude that folder and it is temporary. Measure each file in bytes (`wc -c < <path>`). Re-encode any file over 524,288 bytes as WEBP, or downscale it, and measure it again. Delete a file that stays over 524,288 bytes. The upload rejects it and fails the whole publish, which also consumes a listing request. Then add the paths of the files that remain, in order, to `.poe-tile.json → screenshots`. Never add a path to a file over 524,288 bytes. `tile-creator`'s scaffolding reference, Step 5.5 item 7, has the full method. A capture that fails, or that stays over the size limit, does not block the action. Add no path for it. If no image remains, say that the tile still has no gallery.
- **The screenshots probably show a different tile than players will get.** Compare the images with what the tile looks like now: its current UI code and what changed in this conversation. Treat them as stale when the art, theme or palette changed, the layout was rebuilt, the main screen or core mechanic is different, or an image shows UI that no longer exists. Then use `ask_user` to ask whether to capture new ones. Name what changed. Capture again only if they say yes, the same way as above, including the size check. Replace a listed path only with a new image that is within the limit; keep the old image when its replacement is not. If they say no, keep the current images.
- **The screenshots still match.** Keep them and do not ask. Copy edits, balance changes, bug fixes and small style changes do not make screenshots stale.

Before you capture, in either case, call `update_plan` with the steps that remain in this turn. Capturing takes minutes, and without a plan the creator sees only command rows and cannot tell what is taking so long. For example: run the tile, capture the screenshots, add them to `.poe-tile.json`, then request listing. After a promotion you already reported the result, so that plan ends with the manifest edit. Update the plan as each step finishes.

Keep each capture run short. Playing the tile in real time, one player after another, can take ten minutes or more per run, and 3D renders slowly in a sandbox with no graphics card:

- Write one script that opens every player at the same time and captures all the images in one run. For two players, use `openTwoUserTile` from the scaffold's `tests/multiplayer.ts` when the tile has it. To retake one image, do not play the whole flow again for the others.
- Get to each state you show with the fewest actions that produce it. When the tile waits on a timer that runs in the browser, such as a round countdown or a walk animation, advance it with Playwright's `page.clock` instead of waiting in real time. The clock controls only timers that start after `page.clock.install()`. It belongs to the browser context, not the page: every page in one context shares one clock, so each player needs a context of their own. `openTwoUserTile` opens one per player; call `install()` on each page it returns, after it resolves and before the action that starts the timer, then call `page.clock.runFor()`. A timer that starts when the page loads needs pages you open yourself. Create one `browser.newContext()` per player, admit each player with `server.addUserToInstance` (a shared instance ID alone does not admit the second player), then for each player run `context.newPage()`, then `page.clock.install()`, then `page.goto()`. `tile-creator`'s e2e-tests reference, **Multi-User Sync Tests**, has this two-context recipe. Do not add capture-only code to the tile.
- Wait for the state you expect, with a short timeout for each step (about 15 seconds). Never use fixed sleeps or a timeout of minutes. Listen for page errors, and stop at the first one and read it instead of waiting for a timeout.

New images reach players with the host's next upload: `request_listing` when you list, and the end-of-turn preview after a promotion. Do not upload them yourself.

## What this command never does

- It never changes visibility on its own. Listing goes through `request_listing`; a promotion moves a version, not a listing. Offer no visibility choice at any point — a publish cannot set one.
- It never uploads a build. The host has already published the preview; running the upload yourself records a second version for the same work.
- It never promotes or lists because the work looks finished. Only this explicit request authorizes an action, and it authorizes one.
