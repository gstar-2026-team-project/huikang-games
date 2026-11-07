import type { InferSystemHooks } from "poe-tiles-sdk/v1/client.js";
import type { AppSchema } from "./schema";

// Every player races solo against the shared daily leaderboard, so joining
// needs no seating. Deterministic hooks belong in this shared client-safe
// module and must be wired into both client-config.ts and backend-config.ts.
export const tileHooks: InferSystemHooks<AppSchema> = {};
