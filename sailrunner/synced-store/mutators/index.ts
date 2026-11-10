import { abandonRun } from "./abandon-run";
import { checkpointRun } from "./checkpoint-run";
import { completeTutorial } from "./complete-tutorial";
import { finishRun } from "./finish-run";
import { setMuted } from "./set-muted";
import { setShowPath } from "./set-show-path";
import { startRun } from "./start-run";
import type { TileMutators } from "./types";

export const tileMutators: TileMutators = {
	startRun,
	checkpointRun,
	finishRun,
	abandonRun,
	completeTutorial,
	setMuted,
	setShowPath,
};

export type { TileMutator, TileMutators } from "./types";
