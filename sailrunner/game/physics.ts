import {
	MAX_SPEED,
	NO_GO_ANGLE,
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

/** Fraction of MAX_SPEED reachable at a given true wind angle (the boat's polar). */
export function polar(twa: number): number {
	if (twa < NO_GO_ANGLE) return 0;
	if (twa < 50 * DEG) return lerp(0, 0.78, (twa - NO_GO_ANGLE) / (50 * DEG - NO_GO_ANGLE));
	if (twa < 95 * DEG) return lerp(0.78, 1, (twa - 50 * DEG) / (45 * DEG));
	if (twa < 150 * DEG) return lerp(1, 0.82, (twa - 95 * DEG) / (55 * DEG));
	return lerp(0.82, 0.72, (twa - 150 * DEG) / (30 * DEG));
}

/** Advance one fixed step. Pure: returns a new boat. */
export function stepBoat(boat: Boat, steer: Steer, wind: number, dt: number): Boat {
	const speedFraction = Math.min(1, boat.speed / MAX_SPEED);
	const turnRate = TURN_RATE_MIN + TURN_RATE_SPEED_BONUS * speedFraction;
	const heading = normalizeAngle(boat.heading + steer * turnRate * dt);
	const target = polar(trueWindAngle(heading, wind)) * MAX_SPEED;
	const tau = target === 0 ? 1.3 : target > boat.speed ? 1.7 : 2.6;
	let speed = boat.speed + (target - boat.speed) * (1 - Math.exp(-dt / tau));
	if (steer !== 0) speed *= 1 - TURN_SPEED_BLEED * dt;
	return {
		heading,
		speed,
		x: boat.x + Math.sin(heading) * speed * dt,
		y: boat.y + Math.cos(heading) * speed * dt,
	};
}

/** Side the boom swings to: 1 = right (wind over the left side), -1 = left. */
export function sailSide(heading: number, wind: number): 1 | -1 {
	return normalizeAngle(heading - wind) > 0 ? 1 : -1;
}
