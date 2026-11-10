# Schema and bindings

Use named row and input schemas so table wrappers stay shallow and input/output
types remain concrete. Adapt this syntax example to the existing scaffold's
names and declarations; it supplies no application rules or authorization.

`synced-store/schema.ts`:

```ts
import { z } from "zod";
import { defineSchema, table } from "poe-tiles-sdk/v1/backend.js";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const recordRow = z.object({ text: z.string().max(500) });
const updateRecordInput = z.object({
  id: z.string().min(1).max(100),
  text: z.string().max(500),
});

export const tileSchema = defineSchema({
  schemaVersion: TILE_SCHEMA_VERSION,
  tables: { records: { schema: table(recordRow) } },
  mutators: { updateRecord: { input: updateRecordInput } },
});
export type TileSchema = typeof tileSchema;
```

A table entry wraps `table(rowSchema)` in `{ schema: ... }`; mutator input
takes the Zod schema directly. Keep the scaffold's version constant in its
client-safe file. Browser code imports `TileSchema` as a type, never the
backend schema as a runtime value. Preserve existing declarations and migrations.
For changes to persisted shapes, follow [schema migrations](schema-migrations.md).

Type handlers with `InferMutatorHandlers<TileSchema>` and readers with
`InferReadContext<TileSchema>` from `poe-tiles-sdk/v1/client.js`. Read the
authenticated actor from `ctx.userId`, not `store.userId`. Table calls:

```ts
const current = await ctx.table("records").get(input.id);
await ctx.table("records").set({ itemKey: input.id, value: { text: input.text } });
await ctx.table("records").delete(input.id);
const records = await ctx.table("records").scan().values().toArray();
```

These are separate operation examples, not one handler. Validate actor,
membership, action and expected round/revision before committing game changes.
`itemKey` cannot contain `:`. Schema defaults do not make fields optional in
typed output rows: update affected seed data, fixtures and UI props together.
Decide public/private/server-only visibility and whether each table is bounded;
use [sort keys](sort-keys.md) for accumulating ordered history.

Keep the same browser-safe mutators and hooks in both configurations:

```ts
// synced-store/client-config.ts
import { defineClientConfig } from "poe-tiles-sdk/v1/client.js";
import type { TileSchema } from "./schema";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";
import { tileMutators } from "./mutators";
import { tileHooks } from "./hooks";

export const tileClientConfig = defineClientConfig<TileSchema>({
  schemaVersion: TILE_SCHEMA_VERSION,
  mutators: tileMutators,
  hooks: tileHooks,
});
```

```ts
// synced-store/backend-config.ts
import { defineBackendConfig } from "poe-tiles-sdk/v1/backend.js";
import { tileSchema } from "./schema";
import { tileMutators } from "./mutators";
import { tileHooks } from "./hooks";

export const tileBackendConfig = defineBackendConfig({
  schema: tileSchema,
  mutators: tileMutators,
  hooks: tileHooks,
});
```

Merge the scaffold's other configuration fields, actions and hooks; these
examples show the schema/mutator/hook connection only. Do not import backend
configuration into the UI.
