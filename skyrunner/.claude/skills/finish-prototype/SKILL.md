---
name: finish-prototype
description: Finish the prototyping phase of a Creator tile and build the full version on Joiner, with the saved progress, shared state, and multiplayer features the tile needs. Use when the creator presses Finish prototyping or types /finish-prototype. Keeps the tile unlisted.
allowed-tools: Bash, Glob, Grep, Read, Edit, Write
user-invocable: true
---

# Finish prototyping

The creator is done prototyping, or chose to skip the prototype. Finish the prototyping phase and build the full version on Joiner, with the saved progress, shared state, and multiplayer features this tile needs. Finish any pending work. Text after the command is part of the request; honor it.

This command authorizes the full version only. It does not authorize listing or publishing: keep the tile unlisted. The creator decides whether to publish after trying the new preview.

## How

Follow the **Integrate with Joiner** section of [prototype](../prototype/SKILL.md), reading that skill first if it is not already in context. It owns every step: `begin_conversion` first, staging, porting, and `promote_conversion`. Nothing here replaces or shortens it.

- **No prototype exists yet.** The creator typed the command before the first preview, or the workspace holds no tile. Still call `begin_conversion`; it reports `source: empty`, and you build the full version from the creator's request as that section says.
- **The tile already has platform integration.** A `.poe-tile.json` with no `.poe-prototype` beside it, and no conversion in progress. Say in one sentence that this tile is already the full version, then continue with any request text under `tile-creator`. Do not call `begin_conversion`.
- **Not a Creator session.** Without the `begin_conversion` tool, say that this command does not apply here and follow `tile-creator` for the request as it stands.

Describe this step to the creator as finishing the prototyping phase and building the full version. Do not call it integrating with the Joiner platform.
