import { defineBackendConfig } from "poe-tiles-sdk/v1/backend.js";
import { tileHooks } from "./hooks";
import { tileMutators } from "./mutators/index";
import { tileSchema } from "./schema";

export const tileBackendConfig = defineBackendConfig({
	schema: tileSchema,
	mutators: tileMutators,
	hooks: tileHooks,
	actions: {},
});
