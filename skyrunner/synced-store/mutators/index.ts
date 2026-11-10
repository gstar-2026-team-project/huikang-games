import { finishRun } from "./finish-run";
import { passRing } from "./pass-ring";
import { startRun } from "./start-run";
import type { TileMutators } from "./types";

export const tileMutators: TileMutators = { startRun, passRing, finishRun };

export type { TileMutator, TileMutators } from "./types";
