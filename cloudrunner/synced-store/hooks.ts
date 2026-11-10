import type { InferSystemHooks } from "poe-tiles-sdk/v1/client.js";
import type { AppSchema } from "./schema";

// Cloudrunner has no seats: every member flies their own runs, and a pilot row
// appears with their first finished flight. Kept so client and backend share
// one hook map if one is added later.
export const tileHooks: InferSystemHooks<AppSchema> = {};
