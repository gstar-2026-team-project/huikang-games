# File uploads — `store.files.upload()` + the `_requestUploadUrl` grant handler

User-file uploads (photos, attachments) into a store are **app-controlled**:
nothing can be uploaded until the app's schema declares the reserved
`_requestUploadUrl` action and the backend implements it. The platform runs
that handler server-side before minting every upload ticket, so it is the
app's policy gate — who may upload, what, and when. Platform quotas and rate
limits apply on top.

Managed uploads support files up to 100 MiB through a signed storage PUT and an
authenticated completion step. The platform handles both steps behind
`store.files.upload()`. Files up to 10 MiB keep full inspection and image
sanitization. Larger PDFs and validated UTF-8 text retain their content type;
other large formats are served as downloads.

`ctx.files.store(bytes)` is for small files generated inside an action or the
server-only [live-data-limit hook](live-data-limit-hook.md). The hook publishes
the file and its reference atomically with its row changes. Its
4 MiB host payload ceiling is separate from the action's 8 MiB guest heap,
which also holds app state and base64/JSON copies. An action can exhaust memory
well below the payload ceiling. Use `store.files.upload()` for large user files;
their bytes do not pass through the guest VM.

Use the regular synced-store client type:

```typescript
import type { InferSyncedStoreClient } from "poe-tiles-sdk/v1/client.js";
import type { TileSchema } from "./synced-store/schema";

export type TileStoreClient = InferSyncedStoreClient<TileSchema>;
```

`InferSyncedStoreClient` includes the complete `files` namespace returned by
`Poe.setupStore()`: quota reads, uploads, and served-URL resolution. Do not add a
manual extension intersection or search generated `.d.ts` files.

## 1. Declare the reserved action in the schema

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

The leading `_` marks it platform-invoked: it is excluded from the client's
`store.action` surface and cannot be dispatched by clients.

## 2. Implement the grant handler (backend actions)

The handler runs on a **read-only** action context: table reads and
`ctx.files.generateUploadUrl` only — `ctx.mutate`, `ctx.enqueueAction`,
external dispatch, and `ctx.platform.call` all throw. Approve by calling
`ctx.files.generateUploadUrl(...)` exactly once; deny by throwing an
`ActionError` whose bounded code the client receives as `error.appCode`:

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

- `ctx.userId` is the platform-verified uploading member.
- `generateUploadUrl` takes two DISTINCT optional size params: `sizeBytes`
  (as in the example above) re-asserts the request's declared size — a
  mismatch rejects the grant — while `maxBytes` is an approval CEILING the
  completion enforces, not a size selector. Neither replaces size policy:
  enforce that by throwing before minting.
- Returning without minting, or minting twice, invalidates the grant
  (`app_grant_invalid` client-side).
- Handlers may read the clock (actions are server-only), unlike mutators.

### Read exact quota usage

Client code can read the exact store-instance usage and limits plus the
acting user's attributed usage:

```typescript
const usage = await store.files.getQuotaUsage();
// usage.instance: { bytes, count, limitBytes, limitCount }
// usage.user: { userId, bytes, count }
```

The client method is scoped to the authenticated user. Backend actions,
including the read-only `_requestUploadUrl` handler, can additionally select
another user:

```typescript
const usage = await ctx.files.getQuotaUsage();
// usage.instance: { bytes, count, limitBytes, limitCount }
// usage.user: { userId: ctx.userId, bytes, count }

const other = await ctx.files.getQuotaUsage({ userId: anotherUserId });
```

Omitting `userId` selects the acting user. Supplying one lets app backend code
inspect another user's usage in the same store instance; this does not check
that the selected ID is currently a member, and an unknown user has zero usage.
The user counters are informational and are not quota limits. The instance and
user counters come from one atomic snapshot. They include
published uploads in `ready`, `active`, and `released` state until lifecycle
cleanup removes the upload record, so they match quota enforcement rather than
only currently claimed `$files` rows.

## 3. Upload from the client and claim the file

```typescript
const file = await store.files.upload({
  data: photoBlob,              // Blob | Uint8Array
  name: "capture.jpg",          // optional display metadata
  contentType: "image/jpeg",    // hint; bytes are inspected server-side
});
// file: { status: "staged", fileId, fileKey: null, url: null,
//         sizeBytes, contentType, width, height }
```

`upload()` resolves after the host durably stages canonical bytes and records
its upload task. It works offline. Store the returned `fileId`, then write it
into a field declared under the table's `fileRefs` (`string[]`). The mutation
appears optimistically; the host holds its server push until publication is
proven. The server derives the `$files` claim when it accepts the mutation.
Use `store.files.uploads.get(fileId)` to observe pending or failed uploads.

Local staging accepts up to 60 files or 256 MiB per store. Browser staging also
has a shared ceiling of 100 files or 256 MiB for the signed-in account across
stores and tabs on the same browser profile and origin. An upload that would
exceed either limit rejects with `code: "quota_exceeded"` and `quotaScope:
"store_staging"` or `"device_staging"`. The error message identifies the scope,
and `retryable: true` means a later retry can succeed after capacity is freed.
Pending files remain protected, including published files awaiting claim
settlement. Terminal failure records do not consume pending capacity.

Resolve a display URL with `store.files.url(fileId)`. Local staged and cached
bytes are available without a network download, including after reopening on
the same device. Cold reads fetch verified bytes and attempt cache admission.
Display URLs belong to the consuming client and remain readable until the
store is disposed, even if the disk entry is evicted. Persist only file IDs in
application rows. The current SDK Node environment uses memory for its file
caches and task ledger; pending uploads and cached bytes do not survive a
process restart.

Use `store.files.url(fileId, { target: "external" })` for an HTTP URL that can
be handed to a document opener or another process. An external URL requires
publication and connectivity when opened.

The device cache has a fixed size per store and evicts the least recently used
files first. To keep some files longer, pass `cachePriorityKey` to
`loadFile()` or `loadImage()`; pass `cache: false` to load a file without
caching it. Keyed files are kept over unkeyed ones, and larger keys are kept
longest, so the row's `sortKey` keeps recent rows' files over older ones.
`store.files.cache.pin(fileId, { priorityKey })` ranks the same way.
`unpin(fileId)` removes the original and every resized copy but leaves display
URLs already returned to this client readable.

Both resolve `{ url }`, a device URL for the bytes. For images, use
`store.files.loadImage(fileId, { size: "small" })`. `size` is
`thumbnail`, `small`, `medium`, or `large`: exactly 128, 384, 768, or 1536
pixels wide, not scaled by the screen's pixel density. It keeps the aspect
ratio and caches the copy on the device, so calling it before display preloads
the image. It rejects for a source that is not a JPEG, PNG, or WebP image, or
when the image is not on the device and cannot be downloaded; fall back to
`store.files.loadFile()`. Omit `size` for the original. `cache.unpin(fileId)`
removes the original and every resized copy. Check
`Poe.has("store.files.loadImage.url")` on older hosts. The older
`store.files.imageUrl(fileId, { displayWidth })` is deprecated.

Published unclaimed uploads retain their local staged bytes until an
authoritative claim or terminal absence is observed. A network or status
outage does not authorize deleting them. The server eventually expires files
that no row claims; a claim of an unknown or expired `fileId` rejects the
mutation that makes it, not the other mutations pushed with it. Publication
failures after staging are reported by `uploads.get()`; keep the user's draft
available until its claim is confirmed.

`failure.reason` names the last failure. Retryable reasons are `network` (no
usable server answer), `server_error` (the server answered with a 5xx), and
`rate_limited`. Refusals are `uploads_disabled`, `denied_by_app` (+`appCode`),
`quota_exceeded`, `file_too_large`, `not_authorized`, and `invalid_request`.
Local or lifecycle reasons are `integrity`, `expired`, and `too_many_attempts`.
New hosts can add reasons, so give unknown reasons a generic message and use
`failure.retryable` to decide whether the upload is still retrying.

Failures reject with a `FileUploadError` (guard with `isFileUploadError` from
`poe-tiles-sdk/v1/client.js`): `uploads_not_enabled` (no handler declared),
`upload_denied_by_app` (+`appCode`), `quota_exceeded` (+`quotaScope`:
`"instance"` for server quota, `"store_staging"` or `"device_staging"` for
local staging), `rate_limited`, `file_too_large`,
`idempotency_conflict`, `uploads_disabled` /
`upload_failed` (deployment or transient; `retryable` marks safe re-invokes).

The current `bun run dev` browser host does not authenticate the managed
upload-ticket route, so an upload there fails with an expected local 401. Do
not debug that 401 by searching bundled SDK JavaScript.
