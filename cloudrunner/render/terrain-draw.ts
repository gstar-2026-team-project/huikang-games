import { RIDGE_GAIN, RIDGE_MAX } from "../game/air";
import { latticeHeight, TERRAIN_CELL, terrainHeight } from "../game/terrain";
import { windOf } from "../game/thermals";
import type { Sim } from "../game/flight";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import { mix, type Palette, type RGB, rgb } from "./palette";

const CELL = TERRAIN_CELL;
const GRID = 38;
const NV = GRID + 1;
const MAX_DIST = (GRID / 2) * CELL;
/** How strongly slope lift tints a hillside. */
const SLOPE_TINT = 0.4;
const SUN = (() => {
	const v = [-0.45, 0.8, 0.35];
	const l = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
	return v.map((a) => a / l) as [number, number, number];
})();

/**
 * The far ring: a coarse grid out to the haze, so the valley runs on to the
 * horizon instead of stopping at the edge of the detailed ground.
 */
const FAR_CELL = 400;
const FAR_GRID = 30;
const FAR_NV = FAR_GRID + 1;
const FAR_DIST = (FAR_GRID / 2) * FAR_CELL;
/** Distance (m) at which the ground has faded fully into the haze. */
const HAZE_DIST = FAR_DIST * 1.05;
/** Haze starts thickening past this distance (m). */
const HAZE_START = 900;

/** Camera-space vertices of the terrain grids, rebuilt every frame. */
const vc = new Float32Array(NV * NV * 3);
const vh = new Float32Array(NV * NV);
const fc = new Float32Array(FAR_NV * FAR_NV * 3);
const fh = new Float32Array(FAR_NV * FAR_NV);

export interface QuadItem { kind: 0; z: number; a: number; b: number; c: number; d: number; col: string; far: boolean }

function shade(pal: Palette, h: [number, number, number, number], dist: number, snow: number, wx: number, wz: number, cell = CELL): string {
	const [h0, h1, h2, h3] = h;
	const hm = (h0 + h1 + h2 + h3) / 4;
	let col: RGB;
	if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0) col = pal.water;
	else if (hm < 70) col = mix(pal.low, pal.mid, hm / 70);
	else if (hm < snow) col = mix(pal.mid, pal.high, Math.min(1, (hm - 70) / 160));
	else col = mix(pal.high, pal.snow, Math.min(1, (hm - snow) / 60));
	const dhx = (h1 - h0 + (h2 - h3)) / (2 * cell);
	const dhz = (h3 - h0 + (h2 - h1)) / (2 * cell);
	const nl = Math.hypot(dhx, 1, dhz);
	const lit = 0.62 + 0.5 * Math.max(0, (-dhx * SUN[0] + SUN[1] - dhz * SUN[2]) / nl);
	col = [col[0] * lit, col[1] * lit, col[2] * lit];
	// Windward slopes, where the wind is pushed up the hillside and gives slope lift, glow warm.
	const up = wx * dhx + wz * dhz;
	if (up > 0) col = mix(col, pal.slopeLift, Math.min(1, (up * RIDGE_GAIN) / RIDGE_MAX) * SLOPE_TINT);
	// Clear close by, then thickening haze, so the far ring's big facets melt into the distance.
	const haze = dist < HAZE_START ? (0.15 * dist) / HAZE_START : 0.15 + 0.85 * Math.sqrt(Math.min(1, (dist - HAZE_START) / (HAZE_DIST - HAZE_START)));
	return rgb(mix(col, pal.haze, haze));
}

/** Project the grid around the camera and queue each visible quad. */
export function queueTerrain(sim: Sim, cam: Camera, pal: Palette, items: QuadItem[]): void {
	const gx0 = Math.floor(cam.x / CELL) - GRID / 2;
	const gz0 = Math.floor(cam.z / CELL) - GRID / 2;
	const wind = windOf(sim.seed);
	for (let j = 0; j < NV; j++) {
		for (let i = 0; i < NV; i++) {
			const wx = (gx0 + i) * CELL;
			const wz = (gz0 + j) * CELL;
			const h = latticeHeight(sim.terrain, gx0 + i, gz0 + j);
			const k = j * NV + i;
			vh[k] = h;
			cam.point(wx, h, wz, vc, k * 3);
		}
	}
	for (let j = 0; j < GRID; j++) {
		for (let i = 0; i < GRID; i++) {
			const a = j * NV + i, b = a + 1, c = a + NV + 1, d = a + NV;
			const za = vc[a * 3 + 2] ?? 0, zb = vc[b * 3 + 2] ?? 0, zc = vc[c * 3 + 2] ?? 0, zd = vc[d * 3 + 2] ?? 0;
			if (za < NEAR && zb < NEAR && zc < NEAR && zd < NEAR) continue;
			const dist = Math.hypot((gx0 + i + 0.5) * CELL - cam.x, (gz0 + j + 0.5) * CELL - cam.z);
			if (dist > MAX_DIST) continue;
			const col = shade(pal, [vh[a] ?? 0, vh[b] ?? 0, vh[c] ?? 0, vh[d] ?? 0], dist, sim.terrain.snowLine, wind.x, wind.z);
			items.push({ kind: 0, z: Math.max((za + zb + zc + zd) / 4, 0.1) + 0.0001 * dist, a, b, c, d, col, far: false });
		}
	}
	queueFar(sim, cam, pal, items, wind.x, wind.z);
}

/** The coarse far ring, skipping the cells the detailed grid already covers. */
function queueFar(sim: Sim, cam: Camera, pal: Palette, items: QuadItem[], wx: number, wz: number): void {
	const gx0 = Math.floor(cam.x / FAR_CELL) - FAR_GRID / 2;
	const gz0 = Math.floor(cam.z / FAR_CELL) - FAR_GRID / 2;
	for (let j = 0; j < FAR_NV; j++) {
		for (let i = 0; i < FAR_NV; i++) {
			const x = (gx0 + i) * FAR_CELL, z = (gz0 + j) * FAR_CELL;
			// Sunk a little, so where the rings meet the detailed ground always wins.
			const h = terrainHeight(sim.terr, x, z) - 4;
			const k = j * FAR_NV + i;
			fh[k] = h;
			cam.point(x, h, z, fc, k * 3);
		}
	}
	for (let j = 0; j < FAR_GRID; j++) {
		for (let i = 0; i < FAR_GRID; i++) {
			const a = j * FAR_NV + i, b = a + 1, c = a + FAR_NV + 1, d = a + FAR_NV;
			const za = fc[a * 3 + 2] ?? 0, zb = fc[b * 3 + 2] ?? 0, zc = fc[c * 3 + 2] ?? 0, zd = fc[d * 3 + 2] ?? 0;
			if (za < NEAR || zb < NEAR || zc < NEAR || zd < NEAR) continue;
			const dist = Math.hypot((gx0 + i + 0.5) * FAR_CELL - cam.x, (gz0 + j + 0.5) * FAR_CELL - cam.z);
			if (dist > FAR_DIST || dist < MAX_DIST - FAR_CELL * 0.5) continue;
			const hs: [number, number, number, number] = [Math.max(0, fh[a] ?? 0), Math.max(0, fh[b] ?? 0), Math.max(0, fh[c] ?? 0), Math.max(0, fh[d] ?? 0)];
			const col = shade(pal, hs, dist, sim.terrain.snowLine, wx, wz, FAR_CELL);
			items.push({ kind: 0, z: (za + zb + zc + zd) / 4 + 0.0001 * dist, a, b, c, d, col, far: true });
		}
	}
}

function clipNear(pts: number[]): number[] {
	const out: number[] = [];
	const n = pts.length / 3;
	for (let i = 0; i < n; i++) {
		const j = (i + 1) % n;
		const ax = pts[i * 3] ?? 0, ay = pts[i * 3 + 1] ?? 0, az = pts[i * 3 + 2] ?? 0;
		const bx = pts[j * 3] ?? 0, by = pts[j * 3 + 1] ?? 0, bz = pts[j * 3 + 2] ?? 0;
		const ain = az >= NEAR, bin = bz >= NEAR;
		if (ain) out.push(ax, ay, az);
		if (ain !== bin) {
			const t = (NEAR - az) / (bz - az);
			out.push(ax + (bx - ax) * t, ay + (by - ay) * t, NEAR);
		}
	}
	return out;
}

const quad: number[] = new Array(12).fill(0);
export function drawQuad(ctx: CanvasRenderingContext2D, cam: Camera, it: QuadItem): void {
	const idx = [it.a, it.b, it.c, it.d];
	const src = it.far ? fc : vc;
	let behind = false;
	for (let k = 0; k < 4; k++) {
		const v = (idx[k] ?? 0) * 3;
		quad[k * 3] = src[v] ?? 0;
		quad[k * 3 + 1] = src[v + 1] ?? 0;
		quad[k * 3 + 2] = src[v + 2] ?? 0;
		if ((quad[k * 3 + 2] ?? 0) < NEAR) behind = true;
	}
	const pts = behind ? clipNear(quad) : quad;
	if (pts.length < 9) return;
	let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, cx = 0, cy = 0;
	const n = pts.length / 3;
	for (let k = 0; k < n; k++) {
		const x = cam.sx(pts, k * 3), y = cam.sy(pts, k * 3);
		sx[k] = x;
		sy[k] = y;
		cx += x;
		cy += y;
		if (x < minX) minX = x;
		if (x > maxX) maxX = x;
		if (y < minY) minY = y;
		if (y > maxY) maxY = y;
	}
	if (maxX < 0 || minX > cam.W || maxY < 0 || minY > cam.H) return;
	cx /= n;
	cy /= n;
	// Grow each tile by SEAM_PX so neighbours overlap: no hairline gaps, and
	// no per-tile stroke, which roughly doubled the cost of every frame.
	ctx.beginPath();
	for (let k = 0; k < n; k++) {
		const x = sx[k] ?? 0, y = sy[k] ?? 0;
		const dx = x - cx, dy = y - cy;
		const l = Math.hypot(dx, dy) || 1;
		const ex = x + (dx / l) * SEAM_PX, ey = y + (dy / l) * SEAM_PX;
		if (k === 0) ctx.moveTo(ex, ey);
		else ctx.lineTo(ex, ey);
	}
	ctx.closePath();
	ctx.fillStyle = it.col;
	ctx.fill();
}

const SEAM_PX = 0.6;
const sx: number[] = new Array(8).fill(0);
const sy: number[] = new Array(8).fill(0);
