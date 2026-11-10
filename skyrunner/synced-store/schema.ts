import { defineSchema, table } from "poe-tiles-sdk/v1/backend.js";
import { z } from "zod";
import { LEVEL_COUNT } from "../game/modes";
import { DAY_PATTERN, MAX_RINGS_PER_RUN, RUN_END_REASONS, RUN_MODES } from "./constants";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const rings = z.number().int().min(0).max(MAX_RINGS_PER_RUN);

// Public: each pilot's lifetime numbers, keyed by userId.
const pilotRow = z.object({
	userId: z.string(),
	best: rings,
	flights: z.number().int().min(0),
	totalRings: z.number().int().min(0),
	lastRings: rings,
	updatedAt: z.number(),
});

// Private to its pilot: the current or most recent flight, itemKey "current".
const runRow = z.object({
	runId: z.string(),
	seed: z.number().int(),
	rings,
	status: z.enum(["flying", "done"]),
	startedAt: z.number(),
	endedAt: z.number().nullable(),
	reason: z.enum(RUN_END_REASONS).nullable(),
	// Added with daily challenges and levels; rows written before then are free flights.
	mode: z.enum(RUN_MODES).optional(),
	day: z.string().regex(DAY_PATTERN).optional(),
	level: z.number().int().min(1).max(LEVEL_COUNT).optional(),
});

// Public: each pilot's best stars per level (index 0 = level 1), keyed by userId.
const levelsRow = z.object({
	userId: z.string(),
	stars: z.array(z.number().int().min(0).max(3)).max(LEVEL_COUNT),
	// Retired: written only by the former standalone mission; kept optional so old rows parse.
	mission: z.number().int().min(0).max(3).optional(),
	missionBest: z.number().positive().optional(),
	updatedAt: z.number(),
});

export const tileSchema = defineSchema({
	schemaVersion: TILE_SCHEMA_VERSION,
	tables: {
		pilots: { schema: table(pilotRow) },
		run: { schema: table(runRow) },
		levels: { schema: table(levelsRow) },
	},
	mutators: {
		startRun: {
			description: "Take off on a new flight",
			input: z.object({
				runId: z.string().min(1).max(64),
				seed: z.number().int(),
				startedAt: z.number(),
				mode: z.enum(RUN_MODES).optional(),
				day: z.string().regex(DAY_PATTERN).optional(),
				level: z.number().int().min(1).max(LEVEL_COUNT).optional(),
			}),
		},
		passRing: {
			description: "Checkpoint the ring count of the current flight",
			input: z.object({ runId: z.string().min(1).max(64), rings }),
		},
		finishRun: {
			description: "End the current flight and record its score",
			input: z.object({
				runId: z.string().min(1).max(64),
				rings,
				endedAt: z.number(),
				reason: z.enum(RUN_END_REASONS),
				// Finale level only: whether the target ring was hit.
				targetHit: z.boolean().optional(),
				// Daily only: seconds into the run when the last ring was hit (tie-break).
				lastRingAt: z.number().min(0).max(3600).optional(),
			}),
		},
	},
});

export type AppSchema = typeof tileSchema;
export type PilotRow = z.infer<typeof pilotRow>;
export type RunRow = z.infer<typeof runRow>;
export type LevelsRow = z.infer<typeof levelsRow>;
