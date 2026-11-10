import { latticeHeight, TERRAIN_CELL } from "../game/terrain";
import type { Sim } from "../game/flight";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import { mix, type Palette, type RGB, rgb } from "./palette";

const CELL = TERRAIN_CELL;
const GRID = 38;
const NV = GRID + 1;
const MAX_DIST = (GRID / 2) * CELL;
const SUN = (() => {
	const v = [-0.45, 0.8, 0.35];
	const l = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
	return v.map((a) => a / l) as [number, number, number];
})();

/** Camera-space vertices of the terrain grid, rebuilt every frame. */
const vc = new Float32Array(NV * NV * 3);
const vh = new Float32Array(NV * NV);

export interface QuadItem { kind: 0; z: number; a: number; b: number; c: number; d: number; col: string }

function shade(pal: Palette, h: [number, number, number, number], dist: number, snow: number): string {
	const [h0, h1, h2, h3] = h;
	const hm = (h0 + h1 + h2 + h3) / 4;
	let col: RGB;
	if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0) col = pal.water;
	else if (hm < 70) col = mix(pal.low, pal.mid, hm / 70);
	else if (hm < snow) col = mix(pal.mid, pal.high, Math.min(1, (hm - 70) / 160));
	else col = mix(pal.high, pal.snow, Math.min(1, (hm - snow) / 60));
	const dhx = (h1 - h0 + (h2 - h3)) / (2 * CELL);
	const dhz = (h3 - h0 + (h2 - h1)) / (2 * CELL);
	const nl = Math.hypot(dhx, 1, dhz);
	const lit = 0.62 + 0.5 * Math.max(0, (-dhx * SUN[0] + SUN[1] - dhz * SUN[2]) / nl);
	col = [col[0] * lit, col[1] * lit, col[2] * lit];
	return rgb(mix(col, pal.haze, Math.min(1, (dist / MAX_DIST) ** 1.6)));
}

/** Project the grid around the camera and queue each visible quad. */
export function queueTerrain(sim: Sim, cam: Camera, pal: Palette, items: QuadItem[]): void {
	const gx0 = Math.floor(cam.x / CELL) - GRID / 2;
	const gz0 = Math.floor(cam.z / CELL) - GRID / 2;
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
			const col = shade(pal, [vh[a] ?? 0, vh[b] ?? 0, vh[c] ?? 0, vh[d] ?? 0], dist, sim.terrain.snowLine);
			items.push({ kind: 0, z: Math.max((za + zb + zc + zd) / 4, 0.1) + 0.0001 * dist, a, b, c, d, col });
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
	let behind = false;
	for (let k = 0; k < 4; k++) {
		const v = (idx[k] ?? 0) * 3;
		quad[k * 3] = vc[v] ?? 0;
		quad[k * 3 + 1] = vc[v + 1] ?? 0;
		quad[k * 3 + 2] = vc[v + 2] ?? 0;
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
