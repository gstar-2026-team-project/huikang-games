import type { Sim } from "../game/flight";
import { surfaceHeight } from "../game/terrain";
import { CLOUD_BASE, THERMAL_CORE, type Thermal, thermalsNear } from "../game/thermals";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import { type Palette, rgba } from "./palette";

/** A thermal's cloud, sitting at the cloud base above it. */
export interface CloudItem { kind: 2; z: number; x: number; y: number; s: number; alpha: number }
/** The rising marks in a thermal's column. */
export interface ColumnItem { kind: 3; z: number; th: Thermal; alpha: number }

/** Grid cells around the camera whose thermals are drawn: clouds read from further off than the hills. */
const REACH = 3;
/** Beyond this distance (m) a column's marks are too small to help; its cloud still shows. */
const COLUMN_RANGE = 2400;
/** Vertical gap between the marks in a column (m), and how many are drawn around the glider's height. */
const MARK_GAP = 80;
const MARKS = 7;
/** Marks rise at this many metres per second for each m/s of lift, so stronger thermals visibly rise faster. */
const MARK_RISE = 3;
/** Thickness of the cloud above the base (m). */
const CLOUD_LIFT = 45;
const SEGMENTS = 20;
const tmp = [0, 0, 0];
const ring = new Float32Array((SEGMENTS + 1) * 3);

/** Every live thermal near the camera: a cloud at the cloud base and marks rising up its core. */
export function queueThermals(sim: Sim, cam: Camera, items: (CloudItem | ColumnItem)[]): void {
	for (const th of thermalsNear(sim.seed, cam.x, cam.z, sim.elapsed, REACH)) {
		if (th.life <= 0.02) continue;
		cam.point(th.x, CLOUD_BASE + CLOUD_LIFT, th.z, tmp);
		const cz = tmp[2] ?? 0;
		// The cloud grows as the thermal builds and thins away as it dies.
		if (cz > 20) items.push({ kind: 2, z: cz, x: cam.sx(tmp), y: cam.sy(tmp), s: (th.radius * (0.5 + 0.5 * th.life) * cam.F) / cz, alpha: th.life });
		cam.point(th.x, sim.plane.y, th.z, tmp);
		const z = tmp[2] ?? 0;
		const dist = Math.hypot(th.x - cam.x, th.z - cam.z);
		if (z < -th.radius || dist > COLUMN_RANGE) continue;
		items.push({ kind: 3, z: Math.max(z, NEAR), th, alpha: th.life * (1 - 0.75 * (dist / COLUMN_RANGE)) });
	}
}

/** A cumulus: a flat shaded base with bright heaps on top. Fades as its thermal dies. */
export function drawCloud(ctx: CanvasRenderingContext2D, it: CloudItem, pal: Palette): void {
	const { x, y, s } = it;
	ctx.fillStyle = rgba(pal.cloudShade, 0.9 * it.alpha);
	ctx.beginPath();
	ctx.ellipse(x, y + s * 0.12, s * 1.05, s * 0.2, 0, 0, 6.283);
	ctx.fill();
	ctx.fillStyle = rgba(pal.cloud, 0.92 * it.alpha);
	ctx.beginPath();
	ctx.ellipse(x, y, s, s * 0.24, 0, 0, 6.283);
	ctx.ellipse(x - s * 0.45, y - s * 0.16, s * 0.42, s * 0.26, 0, 0, 6.283);
	ctx.ellipse(x + s * 0.02, y - s * 0.3, s * 0.48, s * 0.34, 0, 0, 6.283);
	ctx.ellipse(x + s * 0.48, y - s * 0.14, s * 0.4, s * 0.24, 0, 0, 6.283);
	ctx.fill();
}

/**
 * Rings around the thermal's core, stacked around the glider's height and
 * rising with the lift, so the core can be found without looking up at the cloud.
 */
export function drawColumn(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, it: ColumnItem, pal: Palette): void {
	const th = it.th;
	const rad = th.radius * THERMAL_CORE;
	const floor = surfaceHeight(sim.terrain, th.x, th.z) + 15;
	// Marks sit on a ladder that climbs with time; the phase comes from the sim clock, so a paused game holds still.
	const phase = (sim.elapsed * (2 + th.strength) * MARK_RISE) % MARK_GAP;
	const base = Math.floor(sim.plane.y / MARK_GAP) * MARK_GAP + phase;
	ctx.lineCap = "round";
	for (let m = 0; m < MARKS; m++) {
		const y = base + (m - (MARKS - 1) / 2) * MARK_GAP;
		if (y < floor || y > CLOUD_BASE) continue;
		for (let k = 0; k <= SEGMENTS; k++) {
			const a = (k / SEGMENTS) * Math.PI * 2;
			cam.point(th.x + Math.cos(a) * rad, y, th.z + Math.sin(a) * rad, ring, k * 3);
		}
		// Marks near the glider's own height are the ones to steer by: those are boldest.
		const off = Math.abs(y - sim.plane.y) / (MARK_GAP * MARKS * 0.5);
		ctx.strokeStyle = rgba(pal.lift, Math.max(0, it.alpha * (1 - 0.6 * off)));
		ctx.lineWidth = Math.max(1.5, Math.min(5, (2.2 * cam.F) / it.z));
		// Circling inside the core, part of each ring is behind the camera: draw the part in front.
		ctx.beginPath();
		for (let k = 0; k < SEGMENTS; k++) {
			if ((ring[k * 3 + 2] ?? 0) < NEAR || (ring[k * 3 + 5] ?? 0) < NEAR) continue;
			ctx.moveTo(cam.sx(ring, k * 3), cam.sy(ring, k * 3));
			ctx.lineTo(cam.sx(ring, k * 3 + 3), cam.sy(ring, k * 3 + 3));
		}
		ctx.stroke();
	}
}
