# Workspace retention and expiry

**This page applies to managed Creator workspaces** — the hosted sandbox some
products provide for building a tile. If the creator builds locally with
the CLI on their own machine, their files are their own and nothing here
applies.

A managed workspace holds the tile's source files, unpublished changes,
the session transcript, and rollback archives. It is durable but not
permanent; these are the retention rules, stated up front so none of them is a
surprise.

## While you work

- The workspace auto-backs up on a 60-second cadence, and recovery restores
  the last **successful** backup. Normally that means about a minute of work
  at risk if the sandbox is interrupted — but a backup that fails (for
  example, a workspace whose archive exceeds the 2 GiB backup cap) leaves
  everything since the last good backup unprotected until backups succeed
  again.
- Rollback archives are kept on a ladder — the most recent saves at fine
  grain, then 10-minute, hourly, and daily tiers — so recent states can be
  restored precisely and older ones more coarsely.

## Inactivity expiry

- A workspace untouched for **180 days** is deleted: its container, source
  files, rollback archives, and session transcript are all destroyed.
- A deletion warning is delivered into the workspace's session at **166 days**
  of inactivity. Deletion never proceeds until that warning has actually been
  delivered and at least **13 further days** have passed — a warning that
  could not be delivered leaves the workspace alive.
- Returning to the workspace at any point before deletion cancels it and
  resets the inactivity clock.

## What survives expiry

- The **published tile keeps running** for its players, and the source
  uploaded with its most recent publish or preview upload is retained. Editing
  or remixing the tile after expiry seeds a fresh workspace from that
  retained source.
- Only what the uploaded source bundle actually contained is retained: the
  bundle honors ignore rules (`.gitignore` and any configured exclusions), so
  files sitting in an ignored or excluded path are not preserved even after a
  successful upload.
- Everything unpublished is lost: work-in-progress changes since the last
  upload, the session transcript, and the rollback history.

## The practical rule

**Publish to preserve — and verify what was uploaded.** Before a long absence,
anything worth keeping should be uploaded; a preview upload is enough, since
previews stay unlisted and the uploaded source is what outlives the workspace.
Before assuring a creator that their work will survive expiry, confirm that a
source-carrying upload succeeded and that the files they care about are inside
it (not excluded by ignore rules). How an upload happens is your HOST's rule:
a host that records versions automatically needs no extra upload from you —
starting one yourself can record a duplicate version — while a host that
leaves publishing to you should be offered an upload before a long absence
(see [publishing.md](publishing.md) only when your host states no
publishing rules). When a creator asks how long their work is kept, or a
deletion warning appears in a session, state these rules plainly.

