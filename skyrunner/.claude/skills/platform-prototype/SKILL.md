---
name: platform-prototype
description: Build a small real Joiner platform preview with saved progress, multiplayer and social integration. Use when the creator explicitly types /platform-prototype. Defer optional polish until readiness; preserve and integrate an existing prototype through its conversion workflow.
allowed-tools: Bash, Glob, Grep, Read, Edit, Write
user-invocable: true
---

# Platform prototype

Build the requested interaction with real platform integration, then finish. During fast iteration, this first-preview contract replaces the broad implementation and prerequisite-reading requirements of `tile-creator` and `synced-store`. Their full workflow applies at readiness. The host's publishing rules always apply.

## Starting work

Workflow selection is complete. Inspect the workspace and preserve existing work. If a `.poe-prototype` marker exists or conversion is in progress, read `prototype` and follow its **Integrate with Joiner** section, including `begin_conversion` and `promote_conversion`. Never replace the prototype or bypass promotion; fast iteration applies from the turn after the integrated tile has published once.

With an existing `.poe-tile.json`, edit in place; do not scaffold a replacement project. Preserve other project files. Only scaffold when the workspace is empty. Do not create a `.poe-prototype` marker. If no tile was requested, ask what to build. If the conversation shows a `/help-me-build` interview the creator has not confirmed yet, continue the interview and use this workflow for the design they confirm.

Read the [scaffolding reference's Step 1](../tile-creator/references/scaffolding-a-new-app.md#step-1-scaffold) only when creating a project. Use the host's handle instructions, explicit template and project directory; preserve the scaffold's SDK pin, configuration and checks.

## Implementation references

Read the [platform integration reference](../tile-creator/references/platform-integration.md) once before implementation. It combines the multiplayer API recipe's sections 1–5, schema/bindings and native results, with exact call shapes. These are exact API examples, not additional feature requests. Resolve paths relative to this installed skill's directory in the Skills catalog.

Use documented signatures directly. Inspect the pinned SDK only for an uncovered capability, blocking ambiguity or concrete type/runtime discrepancy; scope the lookup to that symbol. Other references remain available when needed, including migrations for changes to persisted schemas and private/server-only storage for secrets. Do not activate a reference's broad prerequisite reading during fast iteration.

After resolving blocking gaps, batch writes to distinct files whose contents are already determined in the same tool-call response. A successful write acknowledgment alone need not trigger another model response. Keep dependent work sequential, split for new information or errors.

## First-preview contract

Implement the complete requested rules, legal actions, waiting/turn/outcome states and usable continuation.

Apply the seat, turn, score and round requirements to tiles that have those concepts. Do not add them to tiles that do not. Games with completed rounds must retain native results and their leaderboard backing. Preserve these behaviors:

- Persist gameplay, seats, phase, turns, outcomes and round identity in synced-store. Validate the authenticated actor, membership, role, phase, expected round and action legality in the committing mutator. Reject stale/replayed actions without duplicate effects. Generate IDs/times at the caller; keep secrets private. Use the migration reference before changing persisted shapes.
- Create Poe/store once, show loading immediately, await `waitForBootstrap()` and render through live subscriptions. Never reset progress on mount/reload. Keep temporary presentation state in memory; browser storage APIs are unavailable inside the tile iframe.
- Initialize seats deterministically in membership hooks shared by client and backend. Use active `$users` and names/avatars from `$userInfo`, with readable fallbacks and profile links. Preserve offline seats/progress. Explicit removal must safely repair or visibly pause play, with an authorized recovery path. Provide the host member picker for empty seats, including room members who have not opened the tile.
- Every meaningful accepted shared action bumps the actor through `notifyActivity` with `recency: "bump"` and a useful preview; preferences and no-ops do not. Set the next player's platform turn and clear turns on finished/paused paths. Preserve SDK unread defaults and avoid duplicate attention.
- Emit completion activity, context-rich end pushes to relevant other participants, and the appropriate containing-chat announcement once per accepted terminal transition. Include push recipients in activity fan-out; an actor-only call cannot push an opponent.
- Keep native `Poe.room.tileEnd` and its minimal leaderboard backing. Show the decisive in-game result first, open results once for the current finished round, and cancel/dismiss obsolete results when another player restarts. Only `playAgain` requests an authorized expected-round restart. Every client follows the shared round; closing results does not restart or automatically reopen them. Retain retry after an opening failure.
- Keep keyboard/touch accessibility, mobile/desktop fit, legible light/dark themes, safe areas, scrolling, native gesture handling and visible errors. Choose the tile's visual identity; no shared visual shell is required. Prefer existing Tailwind utilities where configured, otherwise use the scaffold's CSS.

Defer unrequested extra modes, computer opponents, sound/haptics systems, decorative animations, character polish, tutorials beyond contextual help, and lifetime/season/streak/achievement systems until readiness. Implement anything explicitly requested or intrinsic to the interaction. These first-preview deferrals apply only to this workflow.

## Fast iteration

Finish metadata: follow [Step 5.5's text metadata](../tile-creator/references/scaffolding-a-new-app.md#step-55-fill-in-app-metadata), set truthful player range and instancing, update README and write `.poe-tile-change-summary` beside the manifest as the host requires. Preserve the handle and SDK pin. Defer listing media until readiness.

A turn whose build fails publishes no preview; fix build errors before finishing.

After the summary, finish for automatic unlisted publication. Invite changes or the readiness pass; do not ask permission for the automatic preview. Do not offer public listing before the readiness pass.

## Readiness pass

When the creator says ready, accepts the tile as finished or requests public listing, read full `tile-creator` and `synced-store` and complete their deferred feature requirements. This authorizes the readiness pass, not the listing itself.

Finish listing fields/assets, including the profile picture. In a Creator session, where the `generate_image` tool is present, make it with the `image-generation` skill's **Icon** section.

Fixes may span turns, each ending in a summary and preview. Follow the host's accepted-title, rename and `request_listing` rules. After readiness the full workflow applies unless `/platform-prototype` is selected again. Across compaction/restarts, continue deferrals only while the creator has not requested readiness.
