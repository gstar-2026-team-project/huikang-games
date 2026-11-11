import {
	FALL_OFF_LIMIT,
	FALL_OFF_RATE,
	LEEWAY_ANGLE,
	LEEWAY_DRIFT,
	MAX_SPEED,
	NO_GO_ANGLE,
	STEERAGE_SPEED,
	TURN_RATE_MIN,
	TURN_RATE_SPEED_BONUS,
	TURN_SPEED_BLEED,
} from "./constants";
import type { Course } from "./course";

export interface Boat {
	x: number;
	y: number;
	/** Direction of travel in radians (0 = +y, clockwise). */
	heading: number;
	speed: number;
}

/** -1 steer left, 0 straight, 1 steer right. */
export type Steer = -1 | 0 | 1;

const TWO_PI = Math.PI * 2;
const DEG = Math.PI / 180;

export function normalizeAngle(angle: number): number {
	const wrapped = angle % TWO_PI;
	return wrapped < -Math.PI
		? wrapped + TWO_PI
		: wrapped > Math.PI
			? wrapped - TWO_PI
			: wrapped;
}

/** Wind direction (FROM) at race time `t` seconds. Same for every player. */
export function windAt(course: Course, t: number): number {
	let wind = course.baseWind;
	for (const shift of course.shifts) {
		wind += shift.amplitude * Math.sin((TWO_PI * t) / shift.period + shift.phase);
	}
	return wind;
}

/** True wind angle: 0 = pointing straight into the wind, PI = dead downwind. */
export function trueWindAngle(heading: number, wind: number): number {
	return Math.abs(normalizeAngle(heading - wind));
}

function lerp(a: number, b: number, t: number): number {
	return a + (b - a) * t;
}

/**
 * The boat's polar: fraction of MAX_SPEED at each true wind angle (degrees,
 * fraction). Shaped like a real keelboat's: nothing inside the no-go zone,
 * best progress upwind at about 50°, fastest on a beam to broad reach, and
 * slow dead downwind, so the quickest way down is a broad reach at about
 * 150° with gybes, as racers sail it.
 */
const POLAR: ReadonlyArray<readonly [number, number]> = [
	[38, 0],
	[45, 0.7],
	[52, 0.8],
	[75, 0.95],
	[105, 1],
	[135, 0.92],
	[150, 0.85],
	[165, 0.72],
	[180, 0.6],
];

/** Fraction of MAX_SPEED reachable at a given true wind angle (the boat's polar). */
export function polar(twa: number): number {
	if (twa < NO_GO_ANGLE) return 0;
	const deg = (twa * 180) / Math.PI;
	for (let i = 1; i < POLAR.length; i++) {
		const [a1, v1] = POLAR[i]!;
		if (deg <= a1) {
			const [a0, v0] = POLAR[i - 1]!;
			return lerp(v0, v1, (deg - a0) / (a1 - a0));
		}
	}
	return POLAR[POLAR.length - 1]![1];
}

/**
 * Advance one fixed step. Pure: returns a new boat.
 *
 * - Steering needs way on: a stopped boat barely turns.
 * - Speed builds and fades with momentum, so a quick tack carries the boat
 *   through the wind while a slow one stalls in irons.
 * - Slow and pointing high, the bow blows off to the side it is already on
 *   until the sail fills.
 * - The boat slips to leeward: a little when sailing, more when slow.
 */
export function stepBoat(boat: Boat, steer: Steer, wind: number, dt: number): Boat {
	const steerage = Math.min(1, boat.speed / STEERAGE_SPEED);
	const turnRate = TURN_RATE_MIN + TURN_RATE_SPEED_BONUS * steerage;
	const off = normalizeAngle(boat.heading - wind);
	const stalled = Math.abs(off) < FALL_OFF_LIMIT ? 1 - steerage : 0;
	const fallOff = (off >= 0 ? 1 : -1) * FALL_OFF_RATE * stalled;
	const heading = normalizeAngle(boat.heading + (steer * turnRate + fallOff) * dt);
	const twa = trueWindAngle(heading, wind);
	const target = polar(twa) * MAX_SPEED;
	// Accelerating takes a while; coasting through the wind takes longer still.
	const tau = target === 0 ? 3 : target > boat.speed ? 2 : 3;
	let speed = boat.speed + (target - boat.speed) * (1 - Math.exp(-dt / tau));
	if (steer !== 0) speed *= 1 - TURN_SPEED_BLEED * dt;
	// Leeway: pushed sideways, away from the wind.
	const leeward = heading + (normalizeAngle(heading - wind) >= 0 ? Math.PI / 2 : -Math.PI / 2);
	const beam = Math.sin(twa);
	const slip = (LEEWAY_DRIFT * (1 - steerage) + speed * Math.tan(LEEWAY_ANGLE)) * beam;
	return {
		heading,
		speed,
		x: boat.x + (Math.sin(heading) * speed + Math.sin(leeward) * slip) * dt,
		y: boat.y + (Math.cos(heading) * speed + Math.cos(leeward) * slip) * dt,
	};
}

/** Side the boom swings to: 1 = right (wind over the left side), -1 = left. */
export function sailSide(heading: number, wind: number): 1 | -1 {
	return normalizeAngle(heading - wind) > 0 ? 1 : -1;
}
