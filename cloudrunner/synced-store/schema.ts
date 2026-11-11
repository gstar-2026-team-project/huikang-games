import { defineSchema, table } from "poe-tiles-sdk/v1/backend.js";
import { z } from "zod";
import { DAILY_SECONDS } from "../game/modes";
import { DAY_PATTERN, MAX_TURNPOINTS_PER_RUN, RUN_END_REASONS, RUN_MODES } from "./constants";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const turnpoints = z.number().int().min(0).max(MAX_TURNPOINTS_PER_RUN);

// Public: each pilot's lifetime numbers, keyed by userId.
const pilotRow = z.object({
	userId: z.string(),
	/** Free-flight record: most turnpoints in one flight. */
	best: turnpoints,
	flights: z.number().int().min(0),
	totalTurnpoints: z.number().int().min(0),
	lastTurnpoints: turnpoints,
	updatedAt: z.number(),
});

// Private to its pilot: the current or most recent flight, itemKey "current".
const runRow = z.object({
	runId: z.string(),
	seed: z.number().int(),
	turnpoints,
	status: z.enum(["flying", "done"]),
	startedAt: z.number(),
	endedAt: z.number().nullable(),
	reason: z.enum(RUN_END_REASONS).nullable(),
	mode: z.enum(RUN_MODES),
	day: z.string().regex(DAY_PATTERN).optional(),
});

export const tileSchema = defineSchema({
	schemaVersion: TILE_SCHEMA_VERSION,
	tables: {
		pilots: { schema: table(pilotRow) },
		run: { schema: table(runRow) },
	},
	mutators: {
		startRun: {
			description: "Launch on a new flight",
			input: z.object({
				runId: z.string().min(1).max(64),
				seed: z.number().int(),
				startedAt: z.number(),
				mode: z.enum(RUN_MODES).optional(),
				day: z.string().regex(DAY_PATTERN).optional(),
			}),
		},
		reachTurnpoint: {
			description: "Checkpoint the beacon count of the current flight",
			input: z.object({ runId: z.string().min(1).max(64), turnpoints }),
		},
		finishRun: {
			description: "End the current flight and record its score",
			input: z.object({
				runId: z.string().min(1).max(64),
				turnpoints,
				endedAt: z.number(),
				reason: z.enum(RUN_END_REASONS),
				// Daily only: seconds into the flight when the last turnpoint was reached (tie-break).
				seconds: z.number().min(0).max(DAILY_SECONDS).optional(),
			}),
		},
	},
});

export type AppSchema = typeof tileSchema;
export type PilotRow = z.infer<typeof pilotRow>;
export type RunRow = z.infer<typeof runRow>;
