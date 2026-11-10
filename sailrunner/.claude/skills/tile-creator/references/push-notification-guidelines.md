# Push notification guidelines

Push notifications borrow attention from outside the tile. Use them only when a
specific recipient is likely to value the interruption; noisy tiles teach
people to mute the room or disable the app's notifications at the OS level.

The platform suppresses pushes and foreground banners for muted rooms. Treat
that as user control, not as permission to generate noise. Apple also advises
against multiple notifications for the same event because people may disable
all notifications; Android gives people per-category and app-wide controls.

## Design rules

1. **Give each semantic event one push owner.** Inventory `setTurn`,
   `notifyActivity({ push })`, `notifyUsersAddedToTile`, and automatic
   `setLeaderboardScore` notifications. If custom copy or targeting replaces an
   automatic notification, disable the automatic path first.
2. **Target the smallest useful audience.** Prefer the next player, invited
   player, mentioned person, or overtaken record-holder. Broadcast only when
   every active member would reasonably care about the event.
3. **Reserve push for action or high signal.** Use `unread: "increment"` without
   push for passive progress. Use a preview refresh without unread for routine
   state changes.
4. **Make delivery event-driven and idempotent.** A replayed mutation must not
   push again. Nudges need a server-enforced cooldown and a terminal condition;
   never repeat merely because the earlier notification was not opened.
5. **Make the message useful and the tap truthful.** Say what happened and why
   it matters. Attach a small entry context only when it improves the landing,
   and revalidate that stale-able hint against authoritative state.
6. **Never rely on engagement copy alone.** Generic reminders such as "Come
   back and play" are promotional interruptions. Do not add them without an
   explicit opt-in product design and corresponding user controls.

## Notification-aggressiveness score

Score the **busiest plausible recipient**, not global send volume. Sum that
person's pushes across all active rooms and instances of the tile. Estimate both
normal use and a plausible worst-case 24-hour window. Add the four dimensions:

| Dimension | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| Pushes to one recipient in 24h | 0–2 | 3–5 | 6–10 | More than 10 or unbounded |
| Relevance and targeting | Direct action or explicitly requested event | High-signal milestone for an active small room | Broad social update that may not affect the recipient | Generic engagement or promotion without explicit opt-in and user controls, or an unrelated broadcast |
| Delivery-path overlap | Exactly one path per semantic event | Separate nearby events can feel repetitive | Two paths can notify for substantially the same outcome | Known duplicate push paths |
| Cadence and fan-out | Idempotent one-shot event | Rate-limited user-invoked nudge | Automatic fan-out on every participant action | Timer loop, cascade, or no effective bound |

Interpret the total:

- **0–3 — Low:** acceptable only when no dimension is scored 3.
- **4–6 — Moderate:** narrow the audience or frequency where possible; record
  why the remaining interruptions are valuable.
- **7–9 — Aggressive:** redesign before publishing.
- **10–12 — Very aggressive:** do not publish this notification design.

Any dimension scored 3 blocks publishing until that dimension is reduced. A
known duplicate path or an unbounded loop is therefore a hard block regardless
of the numeric total. Explicitly opted-in promotional notifications may score
lower on relevance, but still use their actual frequency, overlap, and cadence.

## Worked examples

### Turn-based move

`setTurn` pushes only the next player after a confirmed move. A companion
`notifyActivity` refreshes the room preview without `push` or `unread`. Count
the recipient's turns across every active match, not just one match.

- Up to two turns in 24 hours score **0 (Low)**: 0 + 0 + 0 + 0. Six to ten
  turns score **2 (Low)**: 2 + 0 + 0 + 0, though the creator should still
  report that plausible volume. More than ten turns score frequency 3 and
  block publishing until the design adds an effective bound or aggregation.
- Adding a second `notifyActivity({ push })` for the same turn creates a known
  duplicate and must be removed even if the total otherwise looks low.

### Daily group puzzle completion

Assume the tile allows one completion per participant each day and makes exactly
one notifying leaderboard write for that completion. The automatic notification
broadcasts every finisher to every other active member. In a two-person room,
each recipient receives at most one peer completion per day and scores **3
(Low)**: frequency 0 + relevance 1 + overlap 0 + fan-out 2. In an eight-person
room, seven completion pushes score **5 (Moderate)**: frequency 2 + relevance 1
+ overlap 0 + fan-out 2. In a 20-person room, 19 broad completion pushes score
**7 (Aggressive)**: 3 + 2 + 0 + 2. Target only a meaningful rival, aggregate
the event, or suppress push for broad rooms. Do not add a tile-owned completion
push on top of the leaderboard path. If a participant can improve their score
more than once per day, count every notifying improvement in the 24-hour volume.


### Repeated nudge

A waiting player explicitly nudges the current player once, with a persisted
server-side cooldown tied to the authoritative turn. That scores **1 (Low)**:
frequency 0 + relevance 0 + overlap 0 + cadence 1. An automatic hourly reminder
until the turn changes scores **6 (Moderate but hard-blocked)**: 3 + 0 + 0 + 3.
Replace that timer loop with a single user-invoked nudge.

## Review checklist

Before declaring the tile complete, report:

- Every code path that can create a push, including platform defaults.
- The semantic event and exact recipients for each path.
- Expected and plausible worst-case pushes to one recipient in 24 hours.
- The four dimension values, total score, and rating.
- Any Moderate-score rationale and the concrete mitigation considered.

Platform references: [Apple notifications](https://developer.apple.com/design/human-interface-guidelines/notifications),
[Apple notification management](https://developer.apple.com/design/human-interface-guidelines/managing-notifications),
and [Android notifications](https://developer.android.com/design/ui/mobile/guides/home-screen/notifications).
