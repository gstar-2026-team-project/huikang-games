import type { Sim } from "../game/flight";
import { surfaceHeight } from "../game/terrain";
import { IN_LIFT_SHARE } from "../game/guide";
import { CLOUD_BASE, type Thermal, thermalsNear } from "../game/thermals";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import { mix, type Palette, rgb, rgba } from "./palette";
import { CLOUD_BASE_Y, CLOUD_H, CLOUD_VARIANTS, CLOUD_W, cloudSprite, columnSprite } from "./sprites";

/** A thermal's cloud, sitting at the cloud base above it. */
export interface CloudItem { kind: 2; z: number; th: Thermal; dist: number }
/** The rising air in a thermal's column. */
export interface ColumnItem { kind: 3; z: number; th: Thermal; dist: number }

/** Grid cells around the camera whose thermals are drawn: clouds read from further off than the hills. */
const REACH = 3;
/** Within this range (m) the column carries streaks rushing up it. */
const STREAK_RANGE = 2600;
const STREAKS = 42;
/** Streaks in a band this tall (m) around the camera, when it is in or beside the column. */
const LOCAL_SPAN = 260;
const LOCAL_STREAKS = 40;
const MAX_STREAK_PX = 46;
/** Core lift (m/s) drawn as the densest, brightest column. */
const FULL_STRENGTH = 17;
/** Clouds are this many times wider than their thermal. */
const CLOUD_SPREAD = 1.8;
/** Farther than this (m) a cloud, and the column under it, is lost in the haze. */
const CLOUD_RANGE = 6000;
const COLUMN_RANGE = CLOUD_RANGE;
const tmp = [0, 0, 0];
const top = [0, 0, 0];
const ring = new Float32Array(17 * 3);

/** Every live thermal near the camera: a cloud at the cloud base and a column of rising air under it. */
export function queueThermals(sim: Sim, cam: Camera, items: (CloudItem | ColumnItem)[]): void {
	for (const th of thermalsNear(sim.seed, cam.x, cam.z, sim.elapsed, REACH)) {
		if (th.life <= 0.02) continue;
		const dist = Math.hypot(th.x - cam.x, th.z - cam.z);
		cam.point(th.x, CLOUD_BASE, th.z, tmp);
		const cz = tmp[2] ?? 0;
		if (cz > -th.radius * CLOUD_SPREAD && dist < CLOUD_RANGE) items.push({ kind: 2, z: Math.max(cz, NEAR) + 1, th, dist });
		if (dist > COLUMN_RANGE) continue;
		cam.point(th.x, sim.plane.y, th.z, tmp);
		const z = tmp[2] ?? 0;
		if (z < -th.radius) continue;
		items.push({ kind: 3, z: Math.max(z, NEAR), th, dist });
	}
}

/** Stable 0…1 numbers per (thermal, mote, slot). */
function h(a: number, b: number, c: number): number {
	let x = Math.imul(a ^ 0x5bd1e995, 0x9e3779b1) + Math.imul(b + 1, 0x85ebca6b) + Math.imul(c + 7, 0xc2b2ae35);
	x ^= x >>> 15;
	x = Math.imul(x, 0x2c1b3c6d);
	x ^= x >>> 12;
	return (x >>> 0) / 4294967296;
}

/**
 * A cumulus at the cloud base. Seen from the side it is a billboard of puffs
 * with a flat grey base; from underneath, its shaded base spreads overhead.
 * It grows as the thermal builds and thins away as it dies.
 */
export function drawCloud(ctx: CanvasRenderingContext2D, cam: Camera, it: CloudItem, pal: Palette): void {
	const th = it.th;
	const life = th.life;
	const width = th.radius * CLOUD_SPREAD * (0.55 + 0.45 * life);
	cam.point(th.x, CLOUD_BASE, th.z, tmp);
	const z = tmp[2] ?? 0;
	// Fully opaque while the thermal lives; thins as it dies and as it fades into the far haze.
	const haze = Math.max(0, (it.dist - CLOUD_RANGE * 0.7) / (CLOUD_RANGE * 0.3));
	const alpha = Math.min(1, life * 1.3) * (1 - Math.min(1, haze));
	// Elevation of the cloud base from the camera: high overhead, show its underside.
	const elev = Math.atan2(CLOUD_BASE - cam.y, Math.max(1, it.dist));
	if (elev > 0.35) drawBase(ctx, cam, th, width * 0.45, alpha * Math.min(1, (elev - 0.35) * 3), pal);
	if (z < NEAR * 4) return;
	const side = alpha * Math.max(0, Math.min(1, (1.1 - elev) * 2.5));
	if (side <= 0.01) return;
	const w = (width * cam.F) / z;
	if (w < 2) return;
	const hgt = (w * CLOUD_H) / CLOUD_W;
	const x = cam.sx(tmp), y = cam.sy(tmp);
	if (x + w < 0 || x - w > cam.W || y - hgt > cam.H || y + hgt < 0) return;
	const variant = ((th.id % CLOUD_VARIANTS) + CLOUD_VARIANTS) % CLOUD_VARIANTS;
	ctx.save();
	ctx.globalAlpha = side;
	ctx.translate(x, y);
	ctx.rotate(cam.screenRoll);
	ctx.drawImage(cloudSprite(pal, variant), -w / 2, -hgt * CLOUD_BASE_Y, w, hgt);
	ctx.restore();
}

/** The cloud's flat underside, as a shaded disc at the cloud base. */
function drawBase(ctx: CanvasRenderingContext2D, cam: Camera, th: Thermal, rad: number, alpha: number, pal: Palette): void {
	if (alpha <= 0.01) return;
	for (let k = 0; k < 16; k++) {
		const a = (k / 16) * Math.PI * 2;
		cam.point(th.x + Math.cos(a) * rad, CLOUD_BASE, th.z + Math.sin(a) * rad, ring, k * 3);
		if ((ring[k * 3 + 2] ?? 0) < NEAR) return;
	}
	ctx.fillStyle = rgba(pal.cloudShade, 0.85 * alpha);
	ctx.beginPath();
	for (let k = 0; k < 16; k++) {
		const x = cam.sx(ring, k * 3), y = cam.sy(ring, k * 3);
		if (k === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
	}
	ctx.closePath();
	ctx.fill();
}

/**
 * The rising air: a cool cyan column from the ground into the cloud, and
 * streaks rushing up it, densest in the core. Stronger lift draws a denser,
 * brighter column; a dying thermal's column fades with its cloud. `clock` is
 * render time (s), so the streaks move on the menu too.
 */
export function drawColumn(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, it: ColumnItem, pal: Palette, clock: number): void {
	const th = it.th;
	const floor = surfaceHeight(sim.terrain, th.x, th.z);
	const power = Math.min(1, th.strength / FULL_STRENGTH);
	const haze = Math.max(0, (it.dist - COLUMN_RANGE * 0.6) / (COLUMN_RANGE * 0.4));
	const fade = 1 - Math.min(1, haze);
	// Close by, a cyan ring on the ground marks where the lift is.
	if (it.dist < RING_RANGE) liftRing(ctx, cam, th, floor + 2, th.radius * IN_LIFT_SHARE, th.life * (1 - it.dist / RING_RANGE) ** 0.5, pal);
	// The band, unless the camera is inside it (then the streaks all around show the lift).
	const inside = Math.max(0, Math.min(1, (it.dist - th.radius * IN_LIFT_SHARE) / (th.radius * 0.5)));
	cam.point(th.x, floor, th.z, tmp);
	cam.point(th.x, CLOUD_BASE, th.z, top);
	const z0 = tmp[2] ?? 0, z1 = top[2] ?? 0;
	if (inside > 0 && z0 > NEAR && z1 > NEAR) {
		const bx = cam.sx(tmp), by = cam.sy(tmp), tx = cam.sx(top), ty = cam.sy(top);
		const len = Math.hypot(tx - bx, ty - by);
		const w = (th.radius * 1.25 * cam.F) / it.z;
		if (len > 2 && w > 1) {
			ctx.save();
			ctx.globalAlpha = Math.min(1, (0.25 + 0.75 * power) * fade * inside);
			ctx.translate(bx, by);
			ctx.rotate(Math.atan2(tx - bx, -(ty - by)));
			ctx.drawImage(columnSprite(pal, false), -w / 2, -len, w, len);
			// The chevrons only from further off: close up they would be huge.
			const fadePx = cam.W * CHEVRON_FADE;
			const up = Math.max(0, Math.min(1, (fadePx - w) / (fadePx * 0.5)));
			if (up > 0.02) {
				ctx.globalAlpha *= up;
				ctx.drawImage(columnSprite(pal, true), -w / 2, -len, w, len);
			}
			ctx.restore();
		}
	}
	if (it.dist > STREAK_RANGE) return;
	const far = power * (1 - Math.min(1, it.dist / STREAK_RANGE) ** 2);
	drawStreaks(ctx, cam, th, floor, CLOUD_BASE, STREAKS, far, pal, clock, 0);
	// In or beside the column, a second set streams past at the glider's own height.
	if (it.dist < th.radius * 1.2) {
		const lo = Math.max(floor, cam.y - LOCAL_SPAN / 2);
		drawStreaks(ctx, cam, th, lo, Math.min(CLOUD_BASE, lo + LOCAL_SPAN), LOCAL_STREAKS, power, pal, clock, 0x5a17);
	}
}

/** Columns wider than this share of the screen lose their chevrons. */
const CHEVRON_FADE = 0.6;
/** Within this range (m) a thermal also shows a ring on the ground around its lift. */
const RING_RANGE = 2400;
const RING_SEGMENTS = 24;
const ringPts = new Float32Array((RING_SEGMENTS + 1) * 3);

/** A level cyan ring of radius `rad` at height y around the thermal: its lift, seen from close by. */
function liftRing(ctx: CanvasRenderingContext2D, cam: Camera, th: Thermal, y: number, rad: number, alpha: number, pal: Palette): void {
	if (alpha <= 0.02) return;
	for (let k = 0; k <= RING_SEGMENTS; k++) {
		const a = (k / RING_SEGMENTS) * Math.PI * 2;
		cam.point(th.x + Math.cos(a) * rad, y, th.z + Math.sin(a) * rad, ringPts, k * 3);
	}
	ctx.strokeStyle = rgba(pal.lift, Math.min(1, 0.9 * alpha));
	for (let k = 0; k < RING_SEGMENTS; k++) {
		const z0 = ringPts[k * 3 + 2] ?? 0, z1 = ringPts[k * 3 + 5] ?? 0;
		if (z0 < NEAR || z1 < NEAR) continue;
		ctx.lineWidth = Math.max(1.5, Math.min(7, (4 * cam.F) / ((z0 + z1) / 2)));
		ctx.beginPath();
		ctx.moveTo(cam.sx(ringPts, k * 3), cam.sy(ringPts, k * 3));
		ctx.lineTo(cam.sx(ringPts, k * 3 + 3), cam.sy(ringPts, k * 3 + 3));
		ctx.stroke();
	}
}

const head = [0, 0, 0];
const tail = [0, 0, 0];

/** Thin bright streaks rushing up the column: they only ever exist inside a thermal. */
function drawStreaks(ctx: CanvasRenderingContext2D, cam: Camera, th: Thermal, floor: number, ceil: number, total: number, power: number, pal: Palette, clock: number, salt: number): void {
	const span = Math.max(50, ceil - floor);
	const count = Math.round(total * Math.min(1, power * 1.3));
	// Drawn faster than the real air, so the column visibly rushes upward.
	const rise = 14 + 2.2 * th.strength;
	const len = 10 + 1.3 * th.strength;
	const id = (th.id | 0) ^ salt;
	const col = rgb(mix(pal.moteUp, [255, 255, 255], 0.3));
	ctx.strokeStyle = col;
	ctx.fillStyle = col;
	ctx.lineCap = "round";
	for (let i = 0; i < count; i++) {
		// Denser toward the core, where the lift is strongest.
		const r = th.radius * 0.75 * h(id, i, 1) ** 1.5;
		const speed = rise * (1 - 0.5 * (r / th.radius));
		const a = h(id, i, 2) * 6.283;
		const y = floor + ((h(id, i, 3) * span + clock * speed) % span);
		const x = th.x + Math.cos(a) * r, z = th.z + Math.sin(a) * r;
		cam.point(x, y, z, head);
		const zz = head[2] ?? 0;
		if (zz < NEAR * 2) continue;
		cam.point(x, y - len, z, tail);
		if ((tail[2] ?? 0) < NEAR * 2) continue;
		const px = cam.sx(head), py = cam.sy(head);
		if (px < -10 || px > cam.W + 10 || py < -60 || py > cam.H + 60) continue;
		const u = (y - floor) / span;
		const ends = Math.min(1, u * 6, (1 - u) * 5);
		const near = Math.min(1, 700 / zz);
		const alpha = ends * power * (0.5 + 0.5 * near) * (1 - (r / th.radius) * 0.4);
		if (alpha < 0.04) continue;
		const lw = Math.max(1, Math.min(2.6, (1.8 * cam.F) / zz));
		// A small upward chevron, the same mark as the column: it reads as "up", never as rain.
		// Its size follows the projected streak length, capped right beside the camera.
		const qy = cam.sy(tail);
		const size = Math.max(3, Math.min(MAX_STREAK_PX / 3, Math.abs(qy - py) / 2));
		ctx.globalAlpha = Math.min(0.95, alpha);
		ctx.lineWidth = lw;
		ctx.beginPath();
		ctx.moveTo(px - size, py + size * 0.75);
		ctx.lineTo(px, py);
		ctx.lineTo(px + size, py + size * 0.75);
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}
