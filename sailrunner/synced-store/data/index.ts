import type {
	InferReadContext,
	InferSchemaTableTypes,
} from "poe-tiles-sdk/v1/client.js";
import type { AppSchema } from "../schema";

export type AppTableTypes = InferSchemaTableTypes<AppSchema>;
export type AppReadContext = InferReadContext<AppSchema>;
