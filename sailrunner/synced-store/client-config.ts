import { defineClientConfig } from "poe-tiles-sdk/v1/client.js";
import { tileHooks } from "./hooks";
import { tileMutators } from "./mutators/index";
import type { tileSchema } from "./schema";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

export const tileClientConfig = defineClientConfig<typeof tileSchema>({
	mutators: tileMutators,
	hooks: tileHooks,
	schemaVersion: TILE_SCHEMA_VERSION,
});
