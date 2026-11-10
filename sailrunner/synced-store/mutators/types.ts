import type { InferMutatorHandlers } from "poe-tiles-sdk/v1/client.js";
import type { AppSchema } from "../schema";

export type TileMutators = InferMutatorHandlers<AppSchema>;
export type TileMutator<Name extends keyof TileMutators> = TileMutators[Name];
