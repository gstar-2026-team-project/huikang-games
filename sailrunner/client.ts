import type { InferPoeStoreClient } from "poe-tiles-sdk/v1/client.js";
import type { AppSchema } from "./synced-store/schema";

export type { AppSchema, tileSchema } from "./synced-store/schema";
export type AppStoreClient = InferPoeStoreClient<AppSchema>;
export { tileClientConfig } from "./synced-store/client-config";
export type { AppReadContext, AppTableTypes } from "./synced-store/data/index";
export { tileHooks } from "./synced-store/hooks";
export { tileMutators } from "./synced-store/mutators/index";
