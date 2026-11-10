---
name: help-me-build
description: "Interview the creator about what they want to build until you both reach a single shared understanding, before any code is written. Use when the creator types /help-me-build, or asks to be grilled or interviewed about an idea. Maps the idea as a design tree, asks each round of open decisions with a recommended answer, looks facts up itself, and waits for the creator to confirm before building anything."
allowed-tools: Glob, Grep, Read, Agent, AskUserQuestion
user-invocable: true
---

# Help me build

The creator's idea is the text after this skill block or command. If there is none, the first round asks what they want to build.

Grill the creator about their ideas.

Interview the creator until you get a shared understanding with questions. Map this as a design tree: every decision branches into the decisions that hang off it.

Work the tree in rounds. Invoking this skill asks for an interview, so it deliberately runs several rounds of questions, even where your other instructions say to ask once rather than in a back-and-forth. The frontier is every decision whose prerequisites are already settled: the questions you can ask now without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the creator's answers before the next round. When your question tool holds fewer questions than the frontier, a round is as much of the frontier as the tool holds; see **Asking a round**.

Each round the creator answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a later round, not this one.

Finding facts is your job, never the creator's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the creator for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The decisions are the creator's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the creator confirms you have reached a shared understanding.

## Asking a round

- **Four questions or fewer:** ask them all in one call to your structured question tool (`ask_user` in a Creator session, `AskUserQuestion` in Claude Code). Number each question in its question text (`1. …`) and put any context there too, because some hosts do not show a header. Give each question two to four options with your recommended answer first, its label ending in ` (Recommended)` and its description giving the one-line reason. For an open decision such as a name, offer your best candidates; the creator can always type their own answer.
- **More than four questions:** the question tool holds four at a time, so ask the four that unblock the most of the tree in one call, the most upstream decisions first. Carry the rest of the frontier to the next round and list them under **Up next** in your reply, so the creator sees what is coming. Keep using the tool for every round; do not switch to a text list because the frontier is large, and do not split one round across several tool calls.
- **No question tool:** write the whole frontier as a numbered list in your reply, each question followed by **Recommended:** your answer and a one-line reason, tell the creator they can answer by number, and end your turn to wait.
- **Nobody to answer** (a background, scheduled, or otherwise automated run): do not interview. Say that this skill needs the creator to answer its questions, and stop without building anything.

Open every round's reply with a short **Settled so far** summary of the tree: the decisions made, the assumptions still awaiting confirmation, any lookup still running, and the questions **Up next**. It keeps the tree intact when earlier turns are summarized or compacted away.

## Reading the answers

- An answer can settle more than was asked, open a branch you had not seen, or overturn an earlier decision. Update the tree, and re-open every decision downstream of anything that changed.
- **A skipped question is not settled.** This holds even when the host tells you to decide unanswered questions yourself, as Creator's answer prompt does. Carry your recommended answer forward as an assumption, list it under **Settled so far** as an assumption, and have the creator confirm or change it before the interview ends.
- A question the creator hands back ("you decide", "whatever you think") is settled by your recommendation, and you record it that way.

## Looking facts up

- **With a sub-agent tool** (such as `Agent`): dispatch read-only lookups, in parallel when there are several, and post the rest of the round without waiting for them.
- **Without one** (Creator sessions have none): do the read-only lookups yourself with `ls`, `rg` or `grep`, `find`, and file reads. Do a quick lookup before you post the round. For a longer one, ask the rest of the frontier now, move the questions that need its result to the next round, and do the lookup at the start of your next turn. Look up only what the current frontier needs.
- Lookups only read. Never write files, install packages, scaffold, run generators, or start a build while interviewing. If the environment refuses a read, do not work around it: work from what you know, or note the fact as still open.
- Report what you found as a fact in the round ("The workspace already has a tile named …"), never as a question.

## What the tree covers

The decisions are about the tile the creator wants: who it is for and how many people use it at once, what they do in it and why they come back, its rules and how a round ends, what each person sees that others do not, how much the interaction between people depends on split-second timing, and how it looks and feels. When the idea depends on fast real-time play between people (a shooter, a race, a fighting game), say as a fact in the round that other players' moves arrive with visible delay on tiles, and ask whether to keep that design or switch to one that holds up, such as turns, asynchronous score chases, or co-op where timing does not decide the outcome. Follow the creator's idea wherever it branches; that list is where a first round usually starts, not a checklist. A Creator build starts as a single-device prototype, so still cover decisions about several people or hidden information, and record them for the full version.

Never ask whether or when to publish or list the tile, or who can discover it. That is not part of this design, and a Creator session handles it separately.

## Finishing

When the frontier is empty, present the whole design tree as a summary: every decision and its answer, grouped by branch, with each assumption marked. Ask the creator to confirm that this is the shared understanding, or to change anything that is off.

Until they confirm, do not write code, scaffold, create project or marker files, or publish anything. Once they confirm, the build goes through the session's normal workflow. If the confirmation already asks you to build, start; otherwise say you are ready and that they can say "build it" whenever they want. If your instructions name a workflow skill you have not loaded yet, read it before you write anything.
