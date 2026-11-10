/** Fixed simulation step: identical inputs give an identical flight at any refresh rate. */
export const DT = 1 / 60;
/** Longest real time folded into one frame before the simulation is clamped. */
export const MAX_FRAME_TIME = 0.1;

export const START_TIME = 25;
/** Every flight takes off with the throttle wide open. */
export const START_THROTTLE = 1;
/** Throttle the courses are laid out for; a flight starts at this speed and accelerates. */
const CRUISE_THROTTLE = 0.4;
/** Drag coefficient: speed settles where thrust equals DRAG * v². */
export const DRAG = 0.0025;
/** Level-flight speed with the throttle closed (below stall) and wide open, m/s. */
export const IDLE_SPEED = 28;
export const FULL_SPEED = 112;
/** Level-flight speed the throttle settles at (m/s). */
export function levelSpeed(throttle: number): number {
	return Math.sqrt(IDLE_SPEED ** 2 + (FULL_SPEED ** 2 - IDLE_SPEED ** 2) * throttle);
}
export const CRUISE_SPEED = levelSpeed(CRUISE_THROTTLE); // ≈ 73 m/s, 263 km/h
export const MIN_SPEED = 18;
export const MAX_SPEED = 135;
/** Speed gates (m/s): blue rings must be passed below SLOW_GATE, purple ones above FAST_GATE. */
export const SLOW_GATE = 55.6; // 200 km/h
export const FAST_GATE = 91.7; // 330 km/h
export const STALL_SPEED = 34;
export const MAX_YAW_RATE = 0.7; // rad/s
export const MAX_PITCH = 0.95; // rad
export const PITCH_RATE = 0.95; // rad/s at full stick
export const CEILING = 1400;
export const MIN_START_ALTITUDE = 360;
export const START_CLEARANCE = 120;
export const CRASH_CLEARANCE = 1.5;
export const CRASH_DURATION = 1.2;
export const BURST_PARTICLES = 18;
export const RING_FX_DURATION = 0.7;

// Course shape.
export const FIRST_RING_DISTANCE = 450;
export const RING_DISTANCE_MIN = 620;
export const RING_DISTANCE_SPREAD = 220;
export const RINGS_AHEAD = 4;
export const RING_MAX_ALTITUDE = 900;
export const MISS_PAST_DISTANCE = 400;
