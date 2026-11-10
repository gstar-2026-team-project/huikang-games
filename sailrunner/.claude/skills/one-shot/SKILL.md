---
name: one-shot
description: Build directly on the Joiner platform when the creator explicitly types /one-shot to skip the default prototype-first workflow. If a prototype already exists, integrate it through the prototype workflow instead of replacing it.
allowed-tools: Bash, Glob, Grep, Read, Edit, Write
user-invocable: true
---

# One-shot

The creator explicitly chose to build with platform integration from the start. Workflow selection is complete. Locate existing work as part of implementation, then start building; do not add a workflow-selection step to the plan or announce a chosen path. Progress updates should describe what you are building.

If a `.poe-prototype` marker already exists, or platform integration is already in progress, preserve that work. Read `prototype` and follow its **Integrate with Joiner** section, including `begin_conversion` and `promote_conversion`. This command authorizes integration, not deleting the prototype or bypassing its checkpoint and promotion process.

If a `.poe-tile.json` manifest exists without a prototype marker, continue in that existing tile. Follow `tile-creator` and `synced-store` to implement the requested changes in place; do not scaffold a replacement project.

Only scaffold when the workspace is empty. Follow `tile-creator` and `synced-store` to implement the requested tile with saved progress, shared state, and multiplayer where appropriate. If other project files exist without a manifest or marker, read and preserve them as you implement the request.

Do not create a `.poe-prototype` marker or spend a turn building a separate prototype. The host's preview and public-listing rules still apply.

If the creator has supplied no tile request yet, ask what they want to build and keep the direct workflow for their answer. If the conversation shows a `/help-me-build` interview the creator has not confirmed yet, continue the interview and keep the direct workflow for the design they confirm.

To build directly on Joiner but defer `tile-creator`'s definition of done until the tile is ready to publish, the creator types `/platform-prototype` instead; that skill carries the deferral rules.
