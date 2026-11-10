import type {
	InferMutationContext,
	InferReadContext,
	InferSchemaTableTypes,
} from "poe-tiles-sdk/v1/client.js";
import type { AppSchema, PilotRow, RunRow } from "../schema";

export type AppTableTypes = InferSchemaTableTypes<AppSchema>;
export type AppReadContext = InferReadContext<AppSchema>;
export type AppMutationContext = InferMutationContext<AppSchema>;

export const CURRENT_RUN_KEY = "current";

export async function readMyRun(
	ctx: AppReadContext,
): Promise<RunRow | undefined> {
	return (await ctx
		.privateOfUser(ctx.userId)
		.table("run")
		.get(CURRENT_RUN_KEY)) as RunRow | undefined;
}

export async function readPilot(
	ctx: AppReadContext,
	userId: string,
): Promise<PilotRow | undefined> {
	return (await ctx.table("pilots").get(userId)) as PilotRow | undefined;
}
