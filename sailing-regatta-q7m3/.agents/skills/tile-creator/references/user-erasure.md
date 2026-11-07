# Historical account erasure

`await isUserErased(ctx, userId)` from `poe-tiles-sdk/v1/backend.js` reads
positive account-erasure evidence for this store. Use it in server-side data
migrations to repair app-owned roster rows that predate your `onAnonymizeUser`
hook. Keep that hook for future erasures.

The helper returns `false` on optimistic clients and when this store has no
erasure record. A missing `$users` row alone is not evidence of erasure: a live
parent-room member may not be mirrored here yet. Erasures that predate the
platform's erasure records cannot be inferred from this helper. Do not remove
those ambiguous rows automatically. Evidence is scoped to this store instance;
it is not a global account lookup.

