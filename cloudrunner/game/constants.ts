/** Fixed simulation step: identical inputs give an identical flight at any refresh rate. */
export const DT = 1 / 60;
/** Longest real time folded into one frame before the simulation is clamped. */
export const MAX_FRAME_TIME = 0.1;

export const GRAVITY = 9.81;
/**
 * The glider's drag, as a deceleration: DRAG_PARASITE * v² + DRAG_INDUCED / v².
 * The two terms are equal at BEST_GLIDE_SPEED, where the glide is BEST_GLIDE : 1;
 * faster or slower than that the glider gives up more height per metre flown.
 */
export const BEST_GLIDE_SPEED = 30;
export const BEST_GLIDE = 9;
const MIN_DRAG = GRAVITY / Math.sqrt(1 + BEST_GLIDE ** 2);
export const DRAG_PARASITE = MIN_DRAG / (2 * BEST_GLIDE_SPEED ** 2);
export const DRAG_INDUCED = (MIN_DRAG * BEST_GLIDE_SPEED ** 2) / 2;

export const MIN_SPEED = 14;
export const MAX_SPEED = 80;
export const STALL_SPEED = 20;
/** Bank at full stick (rad). */
export const MAX_BANK = 1.0;
/**
 * Turn rate at full stick (rad/s) at TURN_REF_SPEED; slower turns a little
 * faster, faster a little slower. Half stick circles about 100 m across at
 * the best-glide speed: well inside a thermal, so holding it keeps you there.
 */
export const MAX_YAW_RATE = 1.1;
export const TURN_REF_SPEED = 30;
/** Extra sink at full bank (m/s), less at half: steep turns cost height. */
export const TURN_SINK = 0.8;
/** The variometer's lag (s): like a real one, it settles over about a second. */
export const VARIO_LAG = 1.5;
export const MAX_PITCH = 0.95; // rad
export const PITCH_RATE = 0.8; // rad/s at full stick
/** How quickly a released stick settles the nose onto the glide that holds the current speed (1/s). */
export const TRIM_RATE = 1.2;
export const CEILING = 1100;
export const MIN_START_ALTITUDE = 450;
export const START_CLEARANCE = 200;
export const CRASH_CLEARANCE = 1.5;
export const CRASH_DURATION = 1.2;
export const BURST_PARTICLES = 18;
export const TURNPOINT_FX_DURATION = 0.9;

// Task shape.
/** A turnpoint is reached within this horizontal distance of its beacon, at any height. */
export const TURNPOINT_RADIUS = 120;
/** The first beacon is dead ahead, past the opening thermal. */
export const FIRST_TURNPOINT_DISTANCE = 900;
export const TURNPOINT_DISTANCE_MIN = 1200;
export const TURNPOINT_DISTANCE_SPREAD = 250;
/** Heading change between legs (rad): never straight on, never a hairpin. */
export const TURNPOINT_TURN_MIN = 0.2;
export const TURNPOINT_TURN_MAX = 0.6;
/** Beacons kept generated ahead of the glider in free flight. */
export const TURNPOINTS_AHEAD = 3;
