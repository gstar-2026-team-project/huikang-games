import { defineSchema, table } from "poe-tiles-sdk/v1/backend.js";
import { z } from "zod";
import { MAX_TRACE_SAMPLES } from "../game/constants";
import { TILE_SCHEMA_VERSION } from "./tile-schema-version";

const trace = z.array(z.number().int()).max(MAX_TRACE_SAMPLES * 3);
const splits = z.array(z.number().int().nonnegative()).max(16);

// Each player's best finished run per day, public so anyone can watch it.
// itemKey: `${day}/${userId}`. Pruned to the last few days on every finish.
const runRow = z.object({
	userId: z.string(),
	day: z.string(),
	timeMs: z.number().int().positive(),
	splits,
	trace,
	finishedAt: z.number(),
});

// The run a player is sailing right now, checkpointed at every mark so a
// reload resumes it. Private to the player; itemKey "current".
const activeRunRow = z.object({
	runId: z.string(),
	day: z.string(),
	startedAt: z.number(),
	markIndex: z.number().int().nonnegative(),
	x: z.number(),
	y: z.number(),
	heading: z.number(),
	speed: z.number(),
	splits,
	trace,
});

// Per-player presentation preferences; itemKey "prefs".
const prefsRow = z.object({
	muted: z.boolean(),
	tutorialDone: z.boolean().optional(),
	// Whether the ideal path is drawn on the water and the map during a race.
	showPath: z.boolean().optional(),
});

export const tileSchema = defineSchema({
	schemaVersion: TILE_SCHEMA_VERSION,
	tables: {
		runs: { schema: table(runRow) },
		activeRun: { schema: table(activeRunRow) },
		prefs: { schema: table(prefsRow) },
	},
	mutators: {
		startRun: {
			description: "Begin a timed run on the day's course",
			input: z.object({
				runId: z.string().min(1).max(64),
				day: z.string(),
				startedAt: z.number(),
				heading: z.number(),
			}),
		},
		checkpointRun: {
			description: "Save progress after rounding a mark",
			input: z.object({
				runId: z.string(),
				markIndex: z.number().int().positive(),
				x: z.number(),
				y: z.number(),
				heading: z.number(),
				speed: z.number(),
				splits,
				trace,
			}),
		},
		finishRun: {
			description: "Record a finished run and update the day's leaderboard",
			input: z.object({
				runId: z.string(),
				day: z.string(),
				timeMs: z.number().int().positive(),
				splits,
				trace,
				finishedAt: z.number(),
			}),
		},
		abandonRun: {
			description: "Drop the in-progress run without scoring it",
			input: z.object({ runId: z.string() }),
		},
		completeTutorial: {
			description: "Remember that this player finished the sailing lesson",
			input: z.object({}),
		},
		setMuted: {
			description: "Mute or unmute sound for this player",
			input: z.object({ muted: z.boolean() }),
		},
		setShowPath: {
			description: "Show or hide the ideal path for this player",
			input: z.object({ showPath: z.boolean() }),
		},
	},
});

export type AppSchema = typeof tileSchema;
