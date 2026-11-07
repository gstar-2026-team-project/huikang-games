// Shared, dependency-free constants. Imported by the simulation, the renderer,
// and the synced-store mutators, so keep this file free of SDK and Zod imports.

/** Fixed simulation step; identical inputs give identical runs at any refresh rate. */
export const SIM_DT = 1 / 60;
/** Largest wall-clock gap one animation frame may feed into the simulation. */
export const MAX_FRAME_DT = 0.1;

/** Top boat speed on the best point of sail, in world units per second. */
export const MAX_SPEED = 16;
/** Heading closer to the wind than this (radians) stalls the boat: "in irons". */
export const NO_GO_ANGLE = (38 * Math.PI) / 180;
/** Turn rate when stopped and the extra rate gained at full speed (rad/s). */
export const TURN_RATE_MIN = 0.65;
export const TURN_RATE_SPEED_BONUS = 0.7;
/** Fraction of speed bled per second while the rudder is hard over. */
export const TURN_SPEED_BLEED = 0.12;

/** A mark counts as rounded once the boat's centre is inside this radius. */
export const MARK_RADIUS = 16;
/** The finish gate is wider than a mark so the last leg ends cleanly. */
export const FINISH_RADIUS = 22;

/** Replay traces sample the boat this often. */
export const TRACE_INTERVAL_MS = 500;
/** A run that takes longer than this is abandoned and never scored. */
export const MAX_RUN_MS = 6 * 60 * 1000;
/** Hard cap on stored replay samples (x, y, heading triples). */
export const MAX_TRACE_SAMPLES = Math.ceil(MAX_RUN_MS / TRACE_INTERVAL_MS) + 2;

/** Runs older than this many days are pruned whenever someone finishes. */
export const RUN_RETENTION_DAYS = 2;
