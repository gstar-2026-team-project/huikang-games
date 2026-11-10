# Architecture, scaling, and performance

Your tile contains frontend code that runs on each user's Joiner client and
backend code that runs on our servers in datacenters around the world.

## Static assets

Your tile's UI and other static assets are served from the edge network, close
to every player.

## Live synced state

Most user actions in your tile will involve modifying and reading session
state that is persisted to our servers and synced to all members of the
session. We refer to this collection of state as the "synced store".

Four types of server operations interact with the synced store:
1. **Mutations** modify store state. For example, a user sending a message in a
tile that contains messaging might trigger a mutation that appends a row to the
store's message table. Most mutations run both on the acting user's client to
produce an "optimistic" result and on the server to produce an authoritative
result. Mutations run sequentially in the order they enter the mutation queue on the server, and each mutation has a time limit of 30 seconds.
2. **Actions** run only on the server and have a 10 minute time limit. They are good for asynchronous server-side
work, e.g. making a call to an LLM to ask a
question or generate an image. Actions use mutations under the hood to modify
store state, but these mutations are initiated on the server so they do not
produce any optimistic results.
3. **Pokes** are store updates that the server proactively pushes to
connected clients.
4. **Pulls** are the data fetches that clients make when they first
connect to the store, need to catch up after missing pokes, or want to fetch
the next page of data in paginated datasets.

Each tile instance has its own synced store in a single location: the best datacenter for the user who started the instance. Every mutation
updates that store, every poke fans out from it, and every pull is served
from it. Tile instances involving users around the world may have a higher
network latency, especially for sending updates to and receiving requests from
users far away from the synced store's datacenter.

### Each tile instance is single-threaded

The tile instance processes mutations, actions, pokes, and pulls on a single
thread.

Mutations use a queue and run sequentially in the order they arrive at the server. Each mutation must complete before the next mutation can start, so there are never multiple mutations running concurrently against the same store.

On the other hand, actions and pulls can interleave. Mutations triggered by actions
enter the same mutation queue based on the time the mutation was triggered, not
based on the time the action started. Actions can wait for external work like
calling an LLM without occupying the single thread.

Make sure your tile's mutations and actions are fast enough to support the
expected volume of live interactions and number of concurrent players in a
session. If there is more than one second of total work per second occupying the
instance's single thread, state updates can back up and slow down synchronization
between players.

### Tile instance memory

Tile instances have a 128 MiB memory limit. Things that use memory include the following:

- **Queued actions.** Actions waiting to execute still use up server memory to
  hold the actions' inputs.
- **Pending pokes.** Pokes waiting for delivery consume memory, and memory usage
  grows with the number of members in the instance, including offline members.
  Memory usage does NOT grow with the number of connected devices per member.
- **File uploads from actions.** Calling `ctx.files.store(...)` creates an
  in-memory copy of the file bytes for the upload, so that amount of server memory
  is used for the duration of the upload. Note that this is specific to actions and is not the same thing as uploading files from the client.
- **Concurrent actions.** Each action uses memory, so several actions with modest
  individual memory use can add up to a large total.

See [here](limitations.md#tile-instance-memory) for the full list of what uses memory.

Memory pressure can therefore degrade performance even at low throughput. When
the instance is overloaded, pulls retry with backoff and pending mutations stay
saved locally while their uploads slow down.

### Optimistic updates for mutations

Optimistic updates hide network and server latency from the user interacting with the
tile instance. Each user-triggered mutation (i.e. not triggered by an action) runs
immediately on the user's own device against their local copy of the store, and
their UI re-renders using that local "optimistic" result without waiting for a server
response. At the same time, the mutation is sent to the server, which runs it
against the server's authoritative copy of the
store and generates a new authoritative store state. The server pokes all users connected to
the tile instance so they can all update their local store and render the tile
UI based on the most up-to-date state. The user who triggered the mutation also
gets poked and replaces their optimistic local state with the server's
authoritative one.

### Paginated pulls

A joining client does not necessarily download the whole store. The tile can use
pagination to handle a large amount of data while keeping the store
fast for users. It does so by setting a [`sortKey`](sort-keys.md) on data rows to establish
a priority on them; lower priority rows can be hidden behind pagination boundaries (i.e. "paged out"). For example, each message in a
chat tile can have a `sortKey` that indicates its order in the chat history, such that the
oldest messages can be paged out and hidden behind a "load earlier messages" button.

During a pull on a tile that uses pagination, the server first sends the joining client a small chunk of data prioritized by `sortKey` of a size up to
[`firstRenderBytes`](limitations.md#first-render-budget): the default is 25KB but this is configurable by the tile creator. While the client begins rendering the tile UI using that chunk of data, the server gradually streams more store data to the client up to a size of [`initialLocalBudgetBytes`](limitations.md#default-local-pull-budget)
(default of 100KB, also configurable). Anything beyond `initialLocalBudgetBytes` loads on demand as the user
pages; these paging operations are also pulls and contribute to pull traffic.

Store data that is assigned the empty sort key ([`sortKey: ""`](sort-keys.md#the-performance-model-eager-vs-lazy-download)) is always sent to the client,
regardless of `firstRenderBytes` and `initialLocalBudgetBytes` (see
[always-loaded bytes](limitations.md#always-loaded-bytes)). Data written to the store
uses the empty sort key by default, so pagination is disabled unless the tile explicitly
sets [`sortKey`](sort-keys.md) during its store writes.

### Catch-up pulls after missing pokes

Pokes are not guaranteed to deliver to clients. Offline clients do not
receive pokes, and heavy server load may cause some pokes to get dropped.
Data from missed pokes is recovered by the client's next pull. Clients
automatically run recovery pulls immediately when the app
reconnects or returns to the foreground. Clients also pull immediately when
they receive a poke that has a higher version number than expected,
indicating that they missed a poke.

## Tile session user limit: 200 users
A single tile session can hold a maximum of 200 users. Even if your tile seats
much fewer users (e.g. a board game with a maximum of 4 players), additional
users can be added to the session to spectate or participate in the chat.
The server also pokes those spectating users with store updates, regardless of
whether or not those users can mutate the store state themselves. To restrict the
set of viewers to a subset of the session's members (e.g. only the active
players of the game), use [`privateOfUser`](data-visibility.md#method-access-matrix).

## Store size and row operations

We enforce a [live-data byte limit](limitations.md#live-data-quota) per store
but we do not enforce a limit on the number of tables or table rows.
However, mutations and actions that perform many row operations can take
longer to run and may hit the
[50,000 event-loop-tick limit](limitations.md#event-loop-ticks). Ticks count
host operations, such as scan-page reads or row writes, and turns that
process queued promises. CPU-heavy work between host operations can hit the
[30-second guest execution deadline](limitations.md#guest-execution-deadline).
Completing host operations refreshes that deadline for the next guest slice.
A slice that computes without ever awaiting a host operation is not caught by
that deadline; it runs until the store's 300-second CPU limit resets the whole
instance.

Store migrations are treated as mutations and are subject to the same guest
deadline and [event-loop-tick limit](limitations.md#event-loop-ticks). Stores
with many rows may therefore fail a migration that exceeds these budgets.
Migrations are also
subject to the [mutation memory limit](limitations.md#quickjs-guest-heap), so
avoid loading large amounts of store data into memory.

For example, prefer processing rows directly from the
[scan](client-api-reference.md#scanning-table-rows) iterator:

```typescript
const todos = ctx.table("todos");
for await (const [key, value] of todos.scan().entries()) {
  await todos.set({ ...key, value: { ...value, priority: 0 } });
}
```

over collecting the entire scan into an in-memory array before processing it:

```typescript
const todos = ctx.table("todos");
const rows = await todos.scan().entries().toArray();
for (const [key, value] of rows) {
  await todos.set({ ...key, value: { ...value, priority: 0 } });
}
```

Streaming reduces memory use, but both examples still perform a write for
each row and remain subject to the
[event-loop-tick limit](limitations.md#event-loop-ticks).

If you publish a migration that consistently fails, follow the steps in
[Recovering from a failed migration](schema-migrations.md#recovering-from-a-failed-migration).

## Performance tips

- **If you're storing data only one user needs, use [`privateOfUser`](data-visibility.md#method-access-matrix) .** Per-user state in `privateOfUser` tables pokes one user instead of all members of the session.
- **Choose the right row size for your use cases.** A patch carries the full serialized value
  of every key the mutation wrote, not a diff: updating one field of a
  100 KB row pokes all 100 KB to every member. On the other hand, each row read
  or written adds processing overhead, so splitting related data into many tiny rows can make
  mutations and actions do more work than necessary. Keep independently updated
  state in separate rows, and group data that you usually read or update together.
- **Batch logical changes into fewer mutations.** Prefer to batch rapid small
  client-side changes (e.g. strokes in a drawing tile) into fewer large mutations.
- **Use pagination for large stores.** Use [`sortKey`](sort-keys.md)s to take advantage of
  [`firstRenderBytes`](limitations.md#first-render-budget) and
  [`initialLocalBudgetBytes`](limitations.md#default-local-pull-budget).
  Configure those budgets according to the needs of the tile.
- **Avoid waiting on server responses.** For mutations that do not require
  an authoritative answer from the server, rely on optimistic updates to
  make your tile feel more responsive to users: render from store
  subscriptions instead of awaiting a mutation's `confirmed` promise.
- **Offload file contents to file storage.** Use the [file upload API](file-uploads.md)
  to keep large static content like images, attachments, and other files outside
  of the synced store. Only the file references and metadata should be in the
  synced store.

## Server load examples

### 20-player game

20 players make a combined 5 score updates/s. Each mutation reads all 20 player
rows, updates one player's score, and rewrites a shared leaderboard row containing
everyone's scores and ranks.

**Server work:** 100 reads of player rows, 5 leaderboard recalculations, and 10 row
writes per second. Each score change sends the updated player row and the full
leaderboard to all 20 members, for up to 5 × 20 = 100 pokes/s. Each poke
contains both changed rows.

**Improvement:** Update only the affected player's score row and derive the
displayed ranking from the synced scores on the client. The server then performs
5 row reads and 5 writes per second, with no full leaderboard row to
rebuild or send. There are still up to 100 pokes/s, but each carries only the
updated player row.

### 100-member chat with read receipts

100 members exchange one message/s. Each of the other 99 members sends a separate
mutation that creates a public read-receipt row for that message.

**Server work:** One message produces 100 mutations and 100 new rows. Each of the
99 receipt updates fans out to all 100 members. The message and its receipts
produce up to 100 × 100 = 10,000 pokes/s. Catching up on old messages produces
another burst of receipt mutations.

These improvements can be applied independently:

1. **Show receipts only to the message author.** Store each receipt in the author's
   [`privateOfUser`](data-visibility.md#method-access-matrix) rows from a
   server-guarded mutator. Each receipt mutation produces up to two pokes: one
   carrying receipt data to the author and one confirming the mutation to the
   reader. The mutation count stays at 100/s, while pokes fall to up to
   100 + 99 × 2 = 298/s.

   **Product tradeoff:** Other members can no longer see who has read someone
   else's messages.

2. **Batch read progress.** Keep one public "read up to message N" row per reader
   and update it once when they catch up on a group of messages. A reader catching
   up on ten messages needs one mutation, one row write, and up to 100 pokes,
   instead of ten mutations, ten row writes, and up to 1,000 pokes.

   **Product tradeoff:** Read status arrives after each batch, and the tile treats
   every message through N as read rather than tracking each message separately.

### 200-member quiz

One host runs a quiz for 199 players. All players answer within two seconds of
each question. Each answer mutation writes a public answer row, then scans all
answers collected so far for that round to rebuild the shared results.

**Server work:** 199 mutations arrive in a two-second burst. Repeatedly scanning
the answers reads 1 + 2 + … + 199 = 19,900 rows. Public answers and the changing
results fan out to all 200 members, producing up to 199 × 200 = 39,800 pokes
per round.

**Improvement:** Store each answer in that player's
[`privateOfUser`](data-visibility.md#method-access-matrix) rows. Once the round
closes, have the host trigger one server-guarded mutation that reads the 199
answers, computes the results, and publishes one shared summary. This reduces
answer reads from 19,900 to 199 per round and avoids broadcasting individual
answers to the whole group. There are up to 199 private answer pokes plus 200
shared result pokes: 399 pokes per round.

### 10-member drawing tile

10 members draw continuously, each producing 100 points/s. Each point triggers one mutation.

**Server work:** 1,000 mutations per second. All 1,000 updates
fan out to all 10 members, for up to 1,000 × 10 = 10,000 pokes/s.

**Improvement:** Render each point locally right away but batch points, flushing them into a mutation every 500ms. This reduces the load to 20 mutations per second and up to 20 × 10 = 200 pokes/s. This reduces mutation and poke overhead while sending the same points to all 10 members, with the tradeoff of making updates choppier (which can be smoothed via the tile's frontend logic).
