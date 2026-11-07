# Backend API

The `poe-tiles-sdk/v1/backend.js` module is the single import for everything a Joiner tile needs on the backend side. It wraps `@synced-store/backend` with platform defaults — system tables and hooks are pre-wired so apps don't configure them manually.

```typescript
import {
  defineSchema, table, singletonTable, item,
  defineBackendConfig,
} from "poe-tiles-sdk/v1/backend.js";
```

## Schema Builders

### `defineSchema()`

Define a synced-store schema with platform system tables automatically configured. System tables (`$users`, `$userInfo`) are pre-wired — no need to pass `systemTableTypes`.

```typescript
import { defineSchema, table } from "poe-tiles-sdk/v1/backend.js";
import { z } from "zod";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

export const mySchema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: {
    messages: {
      schema: table(z.object({
        text: z.string(),
        sender: z.string(),
      })),
    },
  },
  mutators: {
    send: {
      description: "Send a message",
      input: z.object({ text: z.string() }),
    },
  },
  actions: {
    summarize: {
      description: "Summarize the conversation with AI",
      input: z.object({}),
    },
  },
});
```

### `table(schema)`

Define a homogeneous table where every row has the same Zod schema.

### `singletonTable(items)`

Define a singleton table with a fixed set of typed keys.

```typescript
import { singletonTable, item } from "poe-tiles-sdk/v1/backend.js";
import { z } from "zod";

const settings = singletonTable({
  theme: item(z.enum(["light", "dark"])),
  language: item(z.string()),
});
```

### `item(schema)`

Define a single item within a `singletonTable`.

## `defineBackendConfig()`

Bundle your schema, mutators, actions, and hooks into a typed backend config. Hook names (`onInit`, `onAddUsersV2`, `onRemoveUser`, `onAnonymizeUser`, `onSetTitle`, `onGrantPermission`, `onRevokePermission`, `onAddTileInstanceToRoom`, `onChangeTileParent`, `onAddChildTile`, `onChildInstancesAdded`, `onRoomMemberInstanceMovedOut`) are pre-wired with their input types.

Every backend hook should also be represented in `defineClientConfig({ hooks })` so `poe-tiles-kernel` can supply matching optimistic startup invocations when opening a fresh prepared store. Put deterministic hook work in a browser-safe shared helper and import that helper into both configs. Keep only truly server-only effects backend-local, or guard them with `if (ctx.isServer)`.

```typescript
import { defineBackendConfig } from "poe-tiles-sdk/v1/backend.js";
import { mySchema } from "./schema";
import { myMutators } from "./mutators/index";
import { myActions } from "./actions";

export const myBackendConfig = defineBackendConfig({
  schema: mySchema,
  mutators: myMutators,
  actions: myActions,
  hooks: {
    onAddUsersV2: async (ctx, { users }) => {
      // Initialize data for every user this batch admitted
    },
    onRemoveUser: async (ctx, { userId }) => {
      // Clean up when a user leaves
    },
  },
});
```

### System Hooks

| Hook | Input | When it fires |
|------|-------|---------------|
| `onInit` | `{ parentRoomUsers }` | A new child-room instance is initialized with parent-room context (`parentRoomUsers` is a read-only roster snapshot) |
| `onAddUsersV2` | `{ users: Array<{ userId: string; batchUserIds?: string[]; addedBatchUserIds?: string[]; poeFeedbackResponder?: boolean }> }` | Users join the store instance; one call per batch |
| `onRemoveUser` | `{ userId: string }` | User leaves the store instance |
| `onAnonymizeUser` | `{ userId: string }` | User is hard-deleted/anonymized |
| `onSetTitle` | `{ userId: string; title: string \| null }` | Store title changes; `title` is `null` when the custom title is cleared/reset to the default — handle the reset case rather than interpolating `null` |
| `onGrantPermission` | `{ userId: string; permission: string }` | Permission granted |
| `onRevokePermission` | `{ userId: string; permission: string }` | Permission revoked |
| `onAddTileInstanceToRoom` | `{ storeTypeId: string; instanceId: string }` | A new app instance is registered as a member of this room (fires on the room store after a new `$room_member_instances` row is written; suppressed on idempotent re-registers) |
| `onChangeTileParent` | `{ previousParent?: PoeTileRoom; parent?: PoeTileRoom }` | This tile instance gains, loses, or changes its parent rootGroup |
| `onAddChildTile` | `{ typeId: string; instanceId: string; room: PoeTileRoom; reason?: "adoption" }` | A rootGroup gains one net-new child tile row |
| `onChildInstancesAdded` | `{ instances: Array<{ typeId: string; instanceId: string; roomTypeId: string; roomId: string; reason?: "adoption" }> }` | A rootGroup gains one or more net-new child tile rows |
| `onRoomMemberInstanceMovedOut` | `{ storeTypeId, instanceId, toRoom, ... }` | A member app instance is removed from this room |

Common hook uses:

- `onInit` is for deterministic one-time bootstrap. Use it to seed app-owned rows such as an initial activity message (`"{name} started the group"`). `parentRoomUsers` is a read-only snapshot of the parent room's roster — never a way to admit members. Membership is platform-owned: the host seats the launcher at genesis (both users when the tile is launched from a 2-person room, i.e. a DM); larger rooms stay picker-driven.
- `onAddUsersV2(ctx, { users })` runs after membership is written, once for every batch of users admitted together (a genesis roster, a multi-person invite), in admission order. Auto-seat users through this hook. Read `$users[userId].addedBy` and `$userInfo` for attribution; each entry's optional `addedBatchUserIds` is that operation’s ordered invitation group, so one call can write one grouped announcement. Retain historical names/IDs in your own message metadata; invitation context is not a membership table.
- `onAddUsers` is deprecated. Use `onAddUsersV2`; a tile that defines both fails to load.

See [historical account erasure](user-erasure.md) for repairing old roster rows with `isUserErased`.

## System Tables

These tables are automatically available in mutators and actions via `ctx.table()`:

| Table | Type | Description |
|-------|------|-------------|
| `$users` | `UserMembership` | Users currently in the store instance |
| `$userInfo` | `PoeUserInfo` | Profile information for each user |

```typescript
// In a mutator or action:
const user = await ctx.table("$users").get(userId);
const info = await ctx.table("$userInfo").get(userId);
```

## `_requestUploadUrl` — app-controlled uploads

File uploads (`store.files.upload()` on the client) are off until your app
opts in by declaring and implementing the reserved `_requestUploadUrl` action
— the platform runs it server-side before minting each upload ticket, so it
is your policy gate: who may upload, what, and when.

Declare it in the schema (the leading `_` marks it platform-invoked; it never
appears on the client's `store.action`):

```typescript
actions: {
  _requestUploadUrl: {
    description: "Approve one photo upload per player per day",
    input: z.object({
      fileId: z.string(),
      sizeBytes: z.number(),
      name: z.string().optional(),
    }),
    output: z.unknown(),
  },
},
```

Implement it with your backend actions. The handler runs on a **read-only**
action context (table reads and `ctx.files.generateUploadUrl` only — no
`ctx.mutate`, no external dispatch). Approve by calling
`ctx.files.generateUploadUrl(...)` exactly once; deny by throwing an
`ActionError` whose code (letters/digits/`_`, bounded) reaches the client as
`error.appCode`:

```typescript
import { ActionError } from "poe-tiles-sdk/v1/backend.js";

const actions = {
  _requestUploadUrl: async (ctx, input) => {
    if (input.sizeBytes > 5 * 1024 * 1024) {
      throw new ActionError("photo_too_large");
    }
    await ctx.files.generateUploadUrl({ sizeBytes: input.sizeBytes });
    return null;
  },
};
```

**Enforce app rules in the CLAIMING MUTATOR, not here.** The handler is
read-only and records nothing, so it cannot serialize concurrent uploads —
any grant-time rule (one photo per day, one entry per round) is advisory at
best, and the mutator that writes the `fileRefs` claim is the authoritative
gate anyway (a rejected claim just lets the unclaimed upload expire). Gate
here only what must be decided BEFORE the bytes are uploaded: the size cap,
or whether uploads are open at all.

`ctx.userId` is the uploading member (platform-verified). `generateUploadUrl`
accepts two distinct optional size params: `sizeBytes` re-asserts the
request's declared size (a mismatch rejects the grant), while `maxBytes` is
an approval CEILING the receiver enforces — not a way to pick the size; to
enforce a size policy, throw before minting.
Returning without minting (or minting twice) invalidates the grant. Platform
quotas and rate limits still apply on top of your policy.

Backend actions can inspect the exact platform counters with
`ctx.files.getQuotaUsage()`. It returns store-instance usage and byte/count
limits plus the acting user's attributed usage. Pass `{ userId }` to select
another user in the same store instance:

```typescript
const mine = await ctx.files.getQuotaUsage();
const anotherUser = await ctx.files.getQuotaUsage({ userId });
// { instance: { bytes, count, limitBytes, limitCount },
//   user: { userId, bytes, count } }
```

The call is allowed inside the read-only `_requestUploadUrl` handler, so an app
can reject against exact aggregate usage before transferring bytes. The
publish-time platform check remains authoritative under concurrent grants.

## Platform Capabilities

Actions and guarded server-side mutator code have access to server-side services via `ctx.platform.call()` — AI streaming, hosted image generation, environment variables, and more. Prefer actions; mutator platform calls are discouraged, must be awaited, must be idempotent/read-only because optimistic-lock conflicts can retry the server mutator attempt, and should be rare because mutators are processed one at a time. See [Platform](../../synced-store/references/platform.md) for the full guidance.

```typescript
const actions = {
  summarize: async (ctx, input) => {
    const stream = await ctx.platform.call("poe.modelProxy.stream", {
      model: input.model,
      request: { messages: [{ role: "user", text: input.prompt }] },
    });
    await stream.cancel();
  },
};
```

### Calling a model from an action

**An action is the only place a tile can reach a model.** There is no client
model API, so prompts, model ids and replies never enter your shipped bundle,
and a tile can never hold a Poe credential. Two helpers, both from
`poe-tiles-sdk/v1/backend.js`:

`createModelStream` for text — `model` is the model's catalog root, `lab/model`
(every `Poe.listModels()` entry carries it as `root`; pass one in from the
client, or pin one), **not** a Poe bot handle:

```typescript
import { createModelStream } from "poe-tiles-sdk/v1/backend.js";

const actions = {
  generateQuestions: async (ctx, input) => {
    const openModelStream = createModelStream(ctx.platform);
    let text = "";
    for await (const delta of openModelStream({
      model: input.model,
      prompts: [{ role: "user", text: "Five trivia questions about space." }],
    })) {
      text += delta.text;
    }
    // ...validate and write results via tables
  },
};
```

A failed round throws `ModelStreamError` (with a `code` and a `retryable`
hint) rather than ending the loop quietly, so one `try` around the `for await`
catches every failure mode. Types: `ModelMessage`, `ModelStreamErrorCode` — both
from `poe-tiles-sdk/v1/backend.js`.

Most actions want the whole reply rather than the deltas — to parse JSON from
it, validate it, or store it. `collectModelText` is that case, so you don't
hand-roll an accumulator:

```typescript
import { collectModelText, createModelStream } from "poe-tiles-sdk/v1/backend.js";

const openModelStream = createModelStream(ctx.platform);
const text = await collectModelText(
  openModelStream({ model: input.model, prompts: "Five trivia questions." }),
);
```

Keep your own `for await` loop only when you need the deltas as they arrive
(rendering progress, counting chunks).

`createImageGenerator` for images. It resolves a `fileId`, not bytes — the
platform stores the generated image and has your store claim it, so the result
is the same kind of handle a file a player uploaded has.

**Write that id into a `fileRefs`-declared field.** The reference is what keeps
the file alive; an id you read and never store leaves a file nothing will ever
release, and a row that holds a URL instead references nothing at all. Render it
with `store.files.url(fileId)`.

```typescript
import { createImageGenerator } from "poe-tiles-sdk/v1/backend.js";

const actions = {
  drawScene: async (ctx, input) => {
    const generateImage = createImageGenerator(ctx.platform);
    const { fileId } = await generateImage({
      model: "openai/gpt-image-2",
      prompt: input.prompt,
    });
    // `scenes.imageFileId` must be declared in the table's `fileRefs`.
    await ctx.mutate.setScene({ id: input.id, imageFileId: fileId });
  },
};
```

Generating for someone ELSE to see — a turn-based app where one player's turn
draws the picture another player opens — passes `claimFor: theirUserId`, because
a `privateOfUser(them)` row may only reference a file they own. The store checks
that the named user is actually a member.

Model calls belong in **actions**, not mutators (mutators must stay
deterministic).

## Type Exports

### Type Inference Utilities

```typescript
import type {
  InferActionContext,       // Action context type from schema
  InferActionHandlers,      // Action handler types from schema
  InferMutationContext,     // Mutation context type from schema
  InferMutatorHandlers,     // Mutator handler types from schema
  InferReadContext,         // Read-only context type from schema
  InferSchemaTableTypes,    // Table types from schema
  InferSchemaActionSchemas, // Action input schemas from schema
  InferSchemaMutatorSchemas,// Mutator input schemas from schema
} from "poe-tiles-sdk/v1/backend.js";
```

### Core Types

```typescript
import type {
  ActionContext, ActionFn,      // Server-side action context
  MutationContext, MutationFn,  // Shared mutation context (client + server)
  QueryContext, QueryFn,        // Query context
  JSONValue,                    // JSON-serializable value
  ScanResult,                   // Table scan result
  TableReader, TableWriter,     // Table operation interfaces
} from "poe-tiles-sdk/v1/backend.js";
```

### Shared Table Contracts

```typescript
import type {
  EntryKey,
  ExternalStoreTableReader,
  TablePageOptions,
  TablePageResult,
} from "poe-tiles-sdk/v1/shared.js";
import { MAX_TABLE_PAGE_CURSOR_LENGTH } from "poe-tiles-sdk/v1/shared.js";
```

- `EntryKey` has a required `itemKey` and optional `sortKey`. Within a table, `itemKey` identifies the row; `sortKey` controls ordering, not identity.
- `ExternalStoreTableReader<T>` is a read-only table interface without `pageByItemKey`. Its `getWithStoreVersion(key)` returns `{ value, storeVersion, synced }`: the value and target store version come from the same snapshot, even when the row is absent. `synced` indicates whether the target has completed at least one sync.
- In a mutator or action, an external `scan` (`ctx.externalStore(...)`) reads one target snapshot per response. A scan with a `limit` gets up to 1,000 rows (and at most 1,048,576 bytes of JSON-serialized rows) per response; a scan without one gets 100 rows per response. If the target commits between two responses of the same scan, the scan throws a version conflict. To read a whole bounded table consistently, pass its maximum row count as the `limit`.

Server current-store table handles expose `pageByItemKey(options)`, using
`TablePageOptions`: required `maxPhysicalRows` (a positive safe integer) and
optional `cursor`. The budget bounds base-storage work, not matching results;
overlay work is counted separately in `overlayEntriesExamined`.
`TablePageResult<T>` contains `entries: Array<[EntryKey, T]>`,
`overlayEntriesExamined`, and either `{ status: "continue", cursor }` or
`{ status: "exhausted" }`. An empty page can still continue; stop only on
`"exhausted"`.

Mutators also run optimistically on clients, where `pageByItemKey` throws despite
being present on the `TableReader` type. In a mutator, guard paging and all dependent
work with `if (ctx.isServer)`. Server actions, including read-only actions, can page
current-store tables; an action is not an atomic replacement for a mutator's
read-and-write operation.

Pass opaque continuation cursors unchanged to the same store and table scope.
They advance by item identity, not `sortKey` order, and do not snapshot future writes.
Use `MAX_TABLE_PAGE_CURSOR_LENGTH` as the serialized cursor length bound when
validating persisted or forwarded cursors. Paging is not available on external
store table handles.

### Poe Platform Types

```typescript
import type {
  PlatformCaller,    // Type for ctx.platform.call()
  PlatformAPI,       // Platform capability types
  PlatformAPIName,   // Platform capability names
  InferSystemHooks, // Schema-aware app hook definitions
  SystemHookMap,     // Platform hook names and inputs
  SystemTableTypes,  // System table type map
  PoeUserInfo,       // User profile data
  UserMembership,    // User membership record
} from "poe-tiles-sdk/v1/backend.js";
```

### Migration Types

```typescript
import type {
  AnyMigration,  // Single migration step
  Migrations,    // Array of migrations for schema versioning
} from "poe-tiles-sdk/v1/backend.js";
```
