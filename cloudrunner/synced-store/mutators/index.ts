import { finishRun } from "./finish-run";
import { reachTurnpoint } from "./reach-turnpoint";
import { startRun } from "./start-run";
import type { TileMutators } from "./types";

export const tileMutators: TileMutators = { startRun, reachTurnpoint, finishRun };

export type { TileMutator, TileMutators } from "./types";
