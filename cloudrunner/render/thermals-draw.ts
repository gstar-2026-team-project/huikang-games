import type { Sim } from "../game/flight";
import { surfaceHeight } from "../game/terrain";
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
/** Farther than this (m) a column is not drawn; its cloud still shows. */
const COLUMN_RANGE = 3200;
/** Within this range (m) the column carries rising motes. */
const MOTE_RANGE = 1700;
const MOTES = 56;
/** Clouds are this many times wider than their thermal. */
const CLOUD_SPREAD = 1.8;
/** Farther than this (m) a cloud is lost in the haze. */
const CLOUD_RANGE = 6000;
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
	const alpha = Math.min(1, life * 1.6) * (1 - Math.min(1, haze));
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
 * The rising air: a soft glowing column from the ground to the cloud, and
 * motes streaming up it, densest in the core and faster where the lift is
 * stronger. A dying thermal's column fades and its motes thin out.
 */
export function drawColumn(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, it: ColumnItem, pal: Palette): void {
	const th = it.th;
	const floor = surfaceHeight(sim.terrain, th.x, th.z);
	const strength = Math.min(1, th.strength / 12);
	const fade = 1 - Math.min(1, it.dist / COLUMN_RANGE) ** 2;
	// The glowing band, unless the camera is inside it (then the motes all around show the lift).
	const inside = Math.max(0, Math.min(1, (it.dist - th.radius * 1.1) / (th.radius * 0.9)));
	cam.point(th.x, floor, th.z, tmp);
	cam.point(th.x, CLOUD_BASE, th.z, top);
	const z0 = tmp[2] ?? 0, z1 = top[2] ?? 0;
	if (inside > 0 && z0 > NEAR && z1 > NEAR) {
		const bx = cam.sx(tmp), by = cam.sy(tmp), tx = cam.sx(top), ty = cam.sy(top);
		const len = Math.hypot(tx - bx, ty - by);
		const w = (th.radius * 1.5 * cam.F) / it.z;
		if (len > 2 && w > 1) {
			ctx.save();
			ctx.globalAlpha = Math.min(1, 0.85 * th.life * (0.55 + 0.45 * strength) * fade * inside);
			ctx.translate(bx, by);
			ctx.rotate(Math.atan2(tx - bx, -(ty - by)));
			ctx.drawImage(columnSprite(pal), -w / 2, -len, w, len);
			ctx.restore();
		}
	}
	if (it.dist > MOTE_RANGE) return;
	drawMotes(ctx, cam, sim, th, floor, fade, pal);
}

const mote = [0, 0, 0];

function drawMotes(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, th: Thermal, floor: number, fade: number, pal: Palette): void {
	const span = Math.max(50, CLOUD_BASE - floor);
	const count = Math.round(MOTES * Math.min(1, th.life * 1.2));
	const rise = 0.9 * th.strength + 1;
	const t = sim.elapsed;
	ctx.fillStyle = rgb(mix(pal.moteUp, [255, 255, 255], 0.25));
	for (let i = 0; i < count; i++) {
		const id = th.id | 0;
		// Denser toward the core, where the lift is strongest.
		const r = th.radius * 0.8 * h(id, i, 1) ** 1.6;
		const speed = rise * (1 - 0.6 * (r / th.radius));
		const a = h(id, i, 2) * 6.283 + t * 0.08;
		const y = floor + ((h(id, i, 3) * span + t * speed) % span);
		cam.point(th.x + Math.cos(a) * r, y, th.z + Math.sin(a) * r, mote);
		const z = mote[2] ?? 0;
		if (z < NEAR * 2) continue;
		const px = cam.sx(mote), py = cam.sy(mote);
		if (px < -10 || px > cam.W + 10 || py < -40 || py > cam.H + 10) continue;
		const u = (y - floor) / span;
		const ends = Math.min(1, u * 6, (1 - u) * 5);
		const near = Math.min(1, 600 / z);
		const alpha = ends * fade * th.life * (0.45 + 0.55 * near) * (1 - (r / th.radius) * 0.5);
		if (alpha < 0.03) continue;
		const s = Math.max(2.2, Math.min(5, (2.6 * cam.F) / z));
		ctx.globalAlpha = Math.min(0.9, alpha);
		// A small upward chevron: rising air.
		ctx.beginPath();
		ctx.moveTo(px - s, py + s * 0.9);
		ctx.lineTo(px, py - s * 0.6);
		ctx.lineTo(px + s, py + s * 0.9);
		ctx.lineTo(px, py + s * 0.2);
		ctx.closePath();
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}
