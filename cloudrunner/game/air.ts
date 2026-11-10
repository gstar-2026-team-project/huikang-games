/**
 * The whole vertical air field the glider flies through: the thermals, a
 * gentle sink that drifts across the valley between them, and slope lift
 * where the wind blows up a hillside. Pure and stateless, like the thermals.
 */
import { terrainHeight, type TerrainPhases } from "./terrain";
import { cloudFade, type ThermalAir, thermalAirAt, windOf } from "./thermals";

/** Sink in the open air between thermals (m/s, down): from SINK_MIN to SINK_MIN + SINK_SPREAD. */
export const SINK_MIN = 0.2;
export const SINK_SPREAD = 1.0;
/** Sink fades out under this much thermal lift (m/s), so a thermal's core is clean. */
const SINK_MASK = 2.5;
/** Size of the sink patches (rad per metre) and how fast they shift (rad/s). */
const SINK_SCALE_A = 0.0019;
const SINK_SCALE_B = 0.0027;
const SINK_DRIFT = 0.02;

/** Slope lift: up-slope wind times RIDGE_GAIN (m/s per m/s of wind into the slope), capped. */
export const RIDGE_GAIN = 5;
export const RIDGE_MAX = 3.2;
/** Slope lift is felt up to this height above the hillside (m), strongest low down. */
export const RIDGE_TOP = 200;
/** Step for the slope estimate (m). */
const SLOPE_STEP = 20;

function phase(seed: number, k: number): number {
	let h = Math.imul(seed ^ (k * 0x9e3779b9), 0x85ebca6b);
	h ^= h >>> 13;
	h = Math.imul(h, 0xc2b2ae35);
	return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * Math.PI * 2;
}

/** 0…1: how strong the background sink is here and now. Smooth in space and time. */
export function sinkShare(seed: number, x: number, z: number, t: number): number {
	const a = Math.sin(x * SINK_SCALE_A + z * SINK_SCALE_A * 0.6 + phase(seed, 1) + t * SINK_DRIFT);
	const b = Math.sin(z * SINK_SCALE_B - x * SINK_SCALE_B * 0.4 + phase(seed, 2) - t * SINK_DRIFT * 0.7);
	return 0.5 + 0.25 * (a + b);
}

/** Background sink at a point (m/s, negative), before any thermal masks it. */
export function sinkAt(seed: number, x: number, z: number, t: number): number {
	return -(SINK_MIN + SINK_SPREAD * sinkShare(seed, x, z, t));
}

/** Wind blowing up the slope at (x, z) (m/s): the wind along the uphill direction, 0 on lee slopes. */
export function upslopeWind(seed: number, terr: TerrainPhases, x: number, z: number): number {
	const w = windOf(seed);
	const gx = (terrainHeight(terr, x + SLOPE_STEP, z) - terrainHeight(terr, x - SLOPE_STEP, z)) / (2 * SLOPE_STEP);
	const gz = (terrainHeight(terr, x, z + SLOPE_STEP) - terrainHeight(terr, x, z - SLOPE_STEP)) / (2 * SLOPE_STEP);
	// Air moving with the wind climbs a slope whose ground rises downwind.
	return Math.max(0, w.x * gx + w.z * gz);
}

/** Slope lift at a point (m/s, up): only near a windward hillside, fading with height above it. */
export function ridgeLiftAt(seed: number, terr: TerrainPhases, x: number, y: number, z: number): number {
	const agl = y - terrainHeight(terr, x, z);
	if (agl >= RIDGE_TOP || agl < 0) return 0;
	const up = upslopeWind(seed, terr, x, z);
	if (up <= 0) return 0;
	const f = 1 - agl / RIDGE_TOP;
	return Math.min(RIDGE_MAX, up * RIDGE_GAIN) * f * f;
}

/** The air's motion at a point: vertical speed (m/s, up) and horizontal drift (m/s, wind plus thermal inflow). */
export interface Air { up: number; vx: number; vz: number }

const th: ThermalAir = { lift: 0, vx: 0, vz: 0 };

/** The air at a point and time: thermals, sink between them, slope lift, wind and inflow. Writes into `out`. */
export function airAt(seed: number, terr: TerrainPhases, x: number, y: number, z: number, t: number, out: Air): Air {
	thermalAirAt(seed, x, y, z, t, th);
	const mask = Math.max(0, 1 - th.lift / SINK_MASK);
	// Above the cloud base the air is still: no thermals and no sink.
	const sink = sinkAt(seed, x, z, t) * mask * cloudFade(y);
	const w = windOf(seed);
	out.up = th.lift + sink + ridgeLiftAt(seed, terr, x, y, z);
	out.vx = w.x + th.vx;
	out.vz = w.z + th.vz;
	return out;
}

const scratchAir: Air = { up: 0, vx: 0, vz: 0 };
/** Just the vertical speed of the air (m/s, up). */
export function airUpAt(seed: number, terr: TerrainPhases, x: number, y: number, z: number, t: number): number {
	return airAt(seed, terr, x, y, z, t, scratchAir).up;
}
