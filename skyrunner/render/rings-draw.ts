import { RING_FX_DURATION } from "../game/constants";
import type { Ring } from "../game/course";
import type { Sim } from "../game/flight";
import { idealPath, PATH_BUFFER_LENGTH } from "../game/ideal-path";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import { mix, type Palette, type RGB, rgba } from "./palette";

const SEGMENTS = 40;
const outer = new Float32Array((SEGMENTS + 1) * 3);
const inner = new Float32Array((SEGMENTS + 1) * 3);
const tmp = [0, 0, 0];
/** Thickness of a ring's band (m), and the least it may look on screen (px). */
const TUBE = 3.6;
const MIN_TUBE_PX = 3;
const SPARKS = 16;
/** A hit ring's burst is centred this far ahead of the plane (m). */
const HIT_LEAD = 4;
/** …starting this wide (m) and spreading by this much as it fades. */
const HIT_R0 = 5;
const HIT_GROW = 12;
const HIT_TUBE = 1.4;
/** Spark half-length (m). */
const SPARK_SIZE = 0.7;

/** 0 the next ring, 1 a later one, 2 just hit, 3 just missed, 4 a target's bullseye. */
export type RingStyle = 0 | 1 | 2 | 3 | 4;
export interface RingItem { kind: 1; z: number; ring: Ring; style: RingStyle; scale: number; alpha: number; k: number; pulse: number }

/** Upcoming rings, plus the ones just passed: a bright burst if hit, red and sinking if missed. */
export function queueRings(sim: Sim, cam: Camera, items: RingItem[]): void {
	const end = Math.min(sim.rings.length, sim.next + 3);
	const pulse = 0.5 + 0.5 * Math.sin(sim.elapsed * 5);
	for (let i = sim.next; i < end; i++) {
		const ring = sim.rings[i];
		if (!ring) continue;
		cam.point(ring.x, ring.y, ring.z, tmp);
		if ((tmp[2] ?? 0) < -ring.r) continue;
		const z = tmp[2] ?? 0;
		items.push({ kind: 1, z, ring, style: i === sim.next ? 0 : 1, scale: 1, alpha: 1, k: 0, pulse });
		// The target wears a second, inner ring so it reads as a bullseye.
		if (ring.target) items.push({ kind: 1, z: z - 0.01, ring, style: 4, scale: 0.55, alpha: 1, k: 0, pulse });
	}
	const p = sim.plane;
	for (const f of sim.fx) {
		const k = f.t / RING_FX_DURATION;
		const hit = !!f.ring.hit;
		// A ring flown through bursts around the plane and travels with it, so the chase camera sees it.
		const ring = hit ? { ...f.ring, x: p.x + Math.sin(p.yaw) * HIT_LEAD, y: p.y, z: p.z + Math.cos(p.yaw) * HIT_LEAD, yaw: p.yaw } : f.ring;
		cam.point(ring.x, ring.y, ring.z, tmp);
		items.push({ kind: 1, z: tmp[2] ?? 0, ring, style: hit ? 2 : 3, scale: hit ? (HIT_R0 + HIT_GROW * Math.sqrt(k)) / f.ring.r : 1 - k * 0.3, alpha: 1 - k * k, k, pulse });
	}
}

/** Fill colour, rim colour and whether the band gets its highlight. */
function colors(pal: Palette, it: RingItem): [RGB, RGB] {
	const target = !!it.ring.target;
	switch (it.style) {
		case 2: return [mix(pal.ringShine, pal.ringHitRgb, Math.min(1, it.k * 3)), mix(pal.ringHitRgb, [0, 0, 0], 0.35)];
		case 3: return [pal.ringMissRgb, mix(pal.ringMissRgb, [0, 0, 0], 0.4)];
		case 4: return [pal.propWhite, mix(pal.propWhite, [0, 0, 0], 0.35)];
		default: return target ? [pal.ringTargetRgb, pal.ringTargetRim] : [pal.ringRgb, pal.ringRim];
	}
}

/** Project a circle of radius `rad` in the ring's plane; false if any point is behind the camera. */
function circle(cam: Camera, r: Ring, rad: number, out: Float32Array): boolean {
	const rx = Math.cos(r.yaw), rz = -Math.sin(r.yaw);
	let ok = true;
	for (let k = 0; k <= SEGMENTS; k++) {
		const a = (k / SEGMENTS) * Math.PI * 2;
		cam.point(r.x + rx * rad * Math.cos(a), r.y + rad * Math.sin(a), r.z + rz * rad * Math.cos(a), out, k * 3);
		if ((out[k * 3 + 2] ?? 0) < NEAR) ok = false;
	}
	return ok;
}

/** One closed band between two radii: outer loop forward, inner loop back. */
function band(ctx: CanvasRenderingContext2D, cam: Camera, r: Ring, rad: number, half: number): boolean {
	if (!circle(cam, r, rad + half, outer) || !circle(cam, r, Math.max(0.1, rad - half), inner)) return false;
	ctx.beginPath();
	ctx.moveTo(cam.sx(outer, 0), cam.sy(outer, 0));
	for (let k = 1; k <= SEGMENTS; k++) ctx.lineTo(cam.sx(outer, k * 3), cam.sy(outer, k * 3));
	ctx.moveTo(cam.sx(inner, SEGMENTS * 3), cam.sy(inner, SEGMENTS * 3));
	for (let k = SEGMENTS - 1; k >= 0; k--) ctx.lineTo(cam.sx(inner, k * 3), cam.sy(inner, k * 3));
	ctx.fill();
	return true;
}

/**
 * A ring as a shaded gold band: a darker rim, the gold face and a bright
 * highlight along its top. The next ring also wears a soft pulsing halo.
 * All flat fills; a ring the camera is passing through falls back to strokes.
 */
export function drawRing(ctx: CanvasRenderingContext2D, cam: Camera, it: RingItem, pal: Palette): void {
	const r = it.ring;
	const rad = r.r * it.scale;
	const [face, rim] = colors(pal, it);
	const zc = Math.max(NEAR, it.z);
	const thin = it.style === 1 ? 0.7 : 1;
	// A hit's burst is a thin bright hoop that thins as it spreads.
	const tube = it.style === 2 ? HIT_TUBE * (1 - 0.6 * it.k) : TUBE * thin;
	const half = Math.max(tube / 2, (MIN_TUBE_PX * zc) / cam.F / 2);
	const alpha = Math.max(0, it.alpha) * (it.style === 1 ? 0.6 : 1);
	if (alpha <= 0.01) return;
	if (it.style === 0) {
		ctx.fillStyle = rgba(face, 0.18 + 0.14 * it.pulse);
		if (!band(ctx, cam, r, rad, half * 2)) {
			strokeRing(ctx, cam, r, rad, face, alpha);
			return;
		}
	}
	ctx.fillStyle = rgba(rim, alpha);
	if (!band(ctx, cam, r, rad, half)) {
		strokeRing(ctx, cam, r, rad, face, alpha);
		return;
	}
	ctx.fillStyle = rgba(face, alpha);
	band(ctx, cam, r, rad + half * 0.08, half * 0.62);
	if (it.style !== 1 && it.style !== 2) highlight(ctx, cam, r, rad + half * 0.3, half, pal, alpha);
	if (it.style === 2) sparks(ctx, cam, it, rad, half, pal);
}

/** The bright streak along the top of the band, where the sun catches it. */
function highlight(ctx: CanvasRenderingContext2D, cam: Camera, r: Ring, rad: number, half: number, pal: Palette, alpha: number): void {
	if (!circle(cam, r, rad, outer)) return;
	const zc = ((outer[(SEGMENTS >> 2) * 3 + 2] ?? 1) + (outer[2] ?? 1)) / 2;
	ctx.strokeStyle = rgba(pal.ringShine, 0.9 * alpha);
	ctx.lineWidth = Math.max(1, (half * 0.45 * cam.F) / zc);
	ctx.lineCap = "round";
	ctx.beginPath();
	// From a little past the right side, over the top, to a little past the left.
	const k0 = Math.round(SEGMENTS * 0.06), k1 = Math.round(SEGMENTS * 0.44);
	for (let k = k0; k <= k1; k++) {
		if (k === k0) ctx.moveTo(cam.sx(outer, k * 3), cam.sy(outer, k * 3));
		else ctx.lineTo(cam.sx(outer, k * 3), cam.sy(outer, k * 3));
	}
	ctx.stroke();
}

/** Sparks flung off a ring just flown through: one path of small diamonds. */
function sparks(ctx: CanvasRenderingContext2D, cam: Camera, it: RingItem, rad: number, half: number, pal: Palette): void {
	const r = it.ring, k = it.k;
	const rx = Math.cos(r.yaw), rz = -Math.sin(r.yaw);
	ctx.fillStyle = rgba(mix(pal.ringShine, pal.ringRgb, k), Math.max(0, 1 - k));
	ctx.beginPath();
	for (let i = 0; i < SPARKS; i++) {
		const a = (i / SPARKS) * Math.PI * 2 + (i % 2) * 0.2;
		const out = rad + half + k * rad * (0.5 + 0.35 * ((i * 7) % 5) / 5);
		cam.point(r.x + rx * out * Math.cos(a), r.y + out * Math.sin(a) - k * k * 6, r.z + rz * out * Math.cos(a), tmp);
		const z = tmp[2] ?? 0;
		if (z < NEAR) continue;
		const s = Math.max(1.5, (SPARK_SIZE * (1 - k * 0.6) * cam.F) / z);
		const x = cam.sx(tmp), y = cam.sy(tmp);
		ctx.moveTo(x, y - s);
		ctx.lineTo(x + s * 0.6, y);
		ctx.lineTo(x, y + s);
		ctx.lineTo(x - s * 0.6, y);
		ctx.closePath();
	}
	ctx.fill();
}

/** Fallback for a ring crossing the camera plane: per-segment strokes, skipping what is behind. */
function strokeRing(ctx: CanvasRenderingContext2D, cam: Camera, r: Ring, rad: number, face: RGB, alpha: number): void {
	circle(cam, r, rad, outer);
	ctx.strokeStyle = rgba(face, alpha);
	ctx.lineCap = "round";
	for (let k = 0; k < SEGMENTS; k++) {
		const z0 = outer[k * 3 + 2] ?? 0, z1 = outer[k * 3 + 5] ?? 0;
		if (z0 < NEAR || z1 < NEAR) continue;
		ctx.lineWidth = Math.max(1.5, (TUBE * cam.F) / ((z0 + z1) / 2));
		ctx.beginPath();
		ctx.moveTo(cam.sx(outer, k * 3), cam.sy(outer, k * 3));
		ctx.lineTo(cam.sx(outer, k * 3 + 3), cam.sy(outer, k * 3 + 3));
		ctx.stroke();
	}
}

/** Inset of the off-screen ring arrow from the sides and top of the view (px), and its lowest point as a share of the height. */
const ARROW_MARGIN = 36;
const ARROW_TOP = 84;
const ARROW_BOTTOM = 0.6;

/** Edge arrow toward the next ring when it is off screen. */
export function drawRingArrow(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, pal: Palette): void {
	const r = sim.rings[sim.next];
	if (!r) return;
	cam.point(r.x, r.y, r.z, tmp);
	if ((tmp[2] ?? 0) > NEAR) {
		const X = cam.sx(tmp), Y = cam.sy(tmp);
		if (X > 30 && X < cam.W - 30 && Y > 80 && Y < cam.H - 30) return;
	}
	const ang = Math.atan2(-(tmp[1] ?? 0), tmp[0] ?? 0);
	// Pin the arrow to the edge of the view along that direction, inside a box
	// that keeps it below the HUD and above the plane and the controls.
	const cx = cam.W / 2, cy = cam.horizonY;
	const dx = Math.cos(ang), dy = Math.sin(ang);
	const left = ARROW_MARGIN, right = cam.W - ARROW_MARGIN;
	const top = ARROW_TOP, bottom = Math.max(top + 40, cam.H * ARROW_BOTTOM);
	let t = Number.POSITIVE_INFINITY;
	if (dx > 1e-6) t = Math.min(t, (right - cx) / dx);
	if (dx < -1e-6) t = Math.min(t, (left - cx) / dx);
	if (dy > 1e-6) t = Math.min(t, (bottom - cy) / dy);
	if (dy < -1e-6) t = Math.min(t, (top - cy) / dy);
	let x = cx + dx * t, y = cy + dy * t;
	// A ring below the plane would put the arrow on the plane itself: show it at
	// the nearer side edge instead, still pointing down toward it.
	if (dy > 0.3) {
		x = dx >= 0 ? right : left;
		y = bottom;
	}
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(ang);
	ctx.fillStyle = r.target ? rgba(pal.ringTargetRgb, 1) : pal.ring;
	ctx.strokeStyle = rgba(r.target ? pal.ringTargetRim : pal.ringRim, 0.9);
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(16, 0);
	ctx.lineTo(-8, -12);
	ctx.lineTo(-3, 0);
	ctx.lineTo(-8, 12);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}

const pathWorld = new Float32Array(PATH_BUFFER_LENGTH);
const pathCam = new Float32Array(PATH_BUFFER_LENGTH);

/** The ideal line through the next rings, as dashes that thin with distance. */
export function drawIdealPath(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, pal: Palette): void {
	const count = idealPath(sim.plane, sim.rings, sim.next, pathWorld);
	for (let k = 0; k < count; k++) {
		cam.point(pathWorld[k * 3] ?? 0, pathWorld[k * 3 + 1] ?? 0, pathWorld[k * 3 + 2] ?? 0, pathCam, k * 3);
	}
	ctx.strokeStyle = pal.planeWhite;
	ctx.globalAlpha = 0.8;
	ctx.lineCap = "round";
	// Every other segment, so the line reads as dashes flowing toward the rings.
	for (let k = 1; k + 1 < count; k += 2) {
		const z0 = pathCam[k * 3 + 2] ?? 0, z1 = pathCam[k * 3 + 5] ?? 0;
		if (z0 < NEAR || z1 < NEAR) continue;
		ctx.lineWidth = Math.max(1.5, (1.6 * cam.F) / ((z0 + z1) / 2));
		ctx.beginPath();
		ctx.moveTo(cam.sx(pathCam, k * 3), cam.sy(pathCam, k * 3));
		ctx.lineTo(cam.sx(pathCam, k * 3 + 3), cam.sy(pathCam, k * 3 + 3));
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

/** A ring's colour on the map: full for the next one, faded for later ones. */
export function ringColor(pal: Palette, ring: Ring, next: boolean): string {
	const c = ring.target ? pal.ringTargetRgb : pal.ringRgb;
	return rgba(c, next ? 1 : ring.target ? 0.55 : 0.45);
}
