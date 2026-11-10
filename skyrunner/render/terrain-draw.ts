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
/** The sun's compass bearing, for the glint on water. */
const SUN_AZ = Math.atan2(SUN[0], SUN[2]);

/**
 * The far ring: a coarse grid out to the haze, so the valley runs on to the
 * horizon instead of stopping at the edge of the detailed ground. Its lattice
 * is every FAR_STEP-th point of the detailed one, so heights come from the
 * same cache.
 */
const FAR_STEP = 5;
const FAR_CELL = CELL * FAR_STEP;
const FAR_GRID = 30;
const FAR_NV = FAR_GRID + 1;
const FAR_DIST = (FAR_GRID / 2) * FAR_CELL;
/** Distance (m) at which the ground has faded fully into the haze. */
const HAZE_DIST = FAR_DIST * 1.05;
/** Haze starts thickening past this distance (m). */
const HAZE_START = 700;

const GORGE_DX = [2, -2, 0, 0];
const GORGE_DZ = [0, 0, 2, -2];

/** Camera-space vertices of the terrain grids, rebuilt every frame. */
const vc = new Float32Array(NV * NV * 3);
const vh = new Float32Array(NV * NV);
const fc = new Float32Array(FAR_NV * FAR_NV * 3);
const fh = new Float32Array(FAR_NV * FAR_NV);

export interface QuadItem { kind: 0; z: number; a: number; b: number; c: number; d: number; col: string; far: boolean }

/** What the shading needs to know about the level. */
interface Look { snow: number; rim: number; camX: number; camZ: number; gorge: boolean }

function waterColor(pal: Palette, look: Look, wx: number, wz: number, dist: number): RGB {
	// A glint on the water along the line toward the sun, strongest at a grazing angle.
	const bearing = Math.atan2(wx - look.camX, wz - look.camZ);
	const toward = Math.cos(bearing - SUN_AZ);
	if (toward <= 0.5) return pal.water;
	const g = ((toward - 0.5) / 0.5) ** 2 * Math.min(1, dist / 500);
	return mix(pal.water, pal.waterHi, g * 0.5);
}

function shade(pal: Palette, look: Look, h: [number, number, number, number], dist: number, wx: number, wz: number, cell: number): string {
	const [h0, h1, h2, h3] = h;
	const hm = (h0 + h1 + h2 + h3) / 4;
	const haze = dist < HAZE_START ? (0.12 * dist) / HAZE_START : 0.12 + 0.88 * Math.sqrt(Math.min(1, (dist - HAZE_START) / (HAZE_DIST - HAZE_START)));
	if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0) return rgb(mix(waterColor(pal, look, wx, wz, dist), pal.haze, haze));
	let col: RGB;
	if (hm < 70) col = mix(pal.low, pal.mid, hm / 70);
	else col = mix(pal.mid, pal.high, Math.min(1, (hm - 70) / 240));
	const dhx = (h1 - h0 + (h2 - h3)) / (2 * cell);
	const dhz = (h3 - h0 + (h2 - h1)) / (2 * cell);
	const slope = Math.hypot(dhx, dhz);
	// Steep ground is bare rock, banded into strata.
	const rocky = Math.max(0, Math.min(1, (slope - 0.62) / 0.5));
	if (rocky > 0) {
		const band = 0.5 + 0.5 * Math.sin(hm * 0.06 + Math.sin(hm * 0.017) * 2);
		col = mix(col, mix(pal.rock, pal.rockDark, band * 0.7), rocky);
	}
	if (hm > look.snow && slope < 1.1) col = mix(col, pal.snow, Math.min(1, (hm - look.snow) / 60) * (1 - slope / 1.1));
	const nl = Math.hypot(dhx, 1, dhz);
	const diffuse = Math.max(0, (-dhx * SUN[0] + SUN[1] - dhz * SUN[2]) / nl);
	let lit = 0.56 + 0.56 * diffuse;
	// Deep in a canyon the light falls off toward the river.
	if (look.rim > 0 && hm < look.rim) lit *= 0.8 + 0.2 * (hm / look.rim);
	col = [col[0] * lit, col[1] * lit, col[2] * lit];
	return rgb(mix(col, pal.haze, haze));
}

/** Project the grid around the camera and queue each visible quad. */
export function queueTerrain(sim: Sim, cam: Camera, pal: Palette, items: QuadItem[]): void {
	const gorge = !!(sim.spec.canyon || sim.spec.authored);
	const look: Look = { snow: sim.terrain.snowLine, rim: sim.spec.canyon?.rim ?? 0, camX: cam.x, camZ: cam.z, gorge };
	const gx0 = Math.floor(cam.x / CELL) - GRID / 2;
	const gz0 = Math.floor(cam.z / CELL) - GRID / 2;
	for (let j = 0; j < NV; j++) {
		for (let i = 0; i < NV; i++) {
			const h = latticeHeight(sim.terrain, gx0 + i, gz0 + j);
			const k = j * NV + i;
			vh[k] = h;
			cam.point((gx0 + i) * CELL, h, (gz0 + j) * CELL, vc, k * 3);
		}
	}
	for (let j = 0; j < GRID; j++) {
		for (let i = 0; i < GRID; i++) {
			const a = j * NV + i, b = a + 1, c = a + NV + 1, d = a + NV;
			const za = vc[a * 3 + 2] ?? 0, zb = vc[b * 3 + 2] ?? 0, zc = vc[c * 3 + 2] ?? 0, zd = vc[d * 3 + 2] ?? 0;
			if (za < NEAR && zb < NEAR && zc < NEAR && zd < NEAR) continue;
			const wx = (gx0 + i + 0.5) * CELL, wz = (gz0 + j + 0.5) * CELL;
			const dist = Math.hypot(wx - cam.x, wz - cam.z);
			if (dist > MAX_DIST) continue;
			const col = shade(pal, look, [vh[a] ?? 0, vh[b] ?? 0, vh[c] ?? 0, vh[d] ?? 0], dist, wx, wz, CELL);
			items.push({ kind: 0, z: Math.max((za + zb + zc + zd) / 4, 0.1) + 0.0001 * dist, a, b, c, d, col, far: false });
		}
	}
	queueFar(sim, cam, pal, look, items);
}

/** The coarse far ring, skipping the cells the detailed grid already covers. */
function queueFar(sim: Sim, cam: Camera, pal: Palette, look: Look, items: QuadItem[]): void {
	const gx0 = Math.floor(cam.x / FAR_CELL) - FAR_GRID / 2;
	const gz0 = Math.floor(cam.z / FAR_CELL) - FAR_GRID / 2;
	for (let j = 0; j < FAR_NV; j++) {
		for (let i = 0; i < FAR_NV; i++) {
			// Sunk a little, so where the rings meet the detailed ground always wins.
			const lx = (gx0 + i) * FAR_STEP, lz = (gz0 + j) * FAR_STEP;
			let h = latticeHeight(sim.terrain, lx, lz);
			// A gorge is narrower than a far cell: take the lowest nearby point, so it carries on into the haze.
			if (look.gorge) {
				for (let q = 0; q < 4; q++) h = Math.min(h, latticeHeight(sim.terrain, lx + (GORGE_DX[q] ?? 0), lz + (GORGE_DZ[q] ?? 0)));
			}
			const k = j * FAR_NV + i;
			fh[k] = h;
			cam.point((gx0 + i) * FAR_CELL, h - 4, (gz0 + j) * FAR_CELL, fc, k * 3);
		}
	}
	for (let j = 0; j < FAR_GRID; j++) {
		for (let i = 0; i < FAR_GRID; i++) {
			const a = j * FAR_NV + i, b = a + 1, c = a + FAR_NV + 1, d = a + FAR_NV;
			const za = fc[a * 3 + 2] ?? 0, zb = fc[b * 3 + 2] ?? 0, zc = fc[c * 3 + 2] ?? 0, zd = fc[d * 3 + 2] ?? 0;
			if (za < NEAR || zb < NEAR || zc < NEAR || zd < NEAR) continue;
			const wx = (gx0 + i + 0.5) * FAR_CELL, wz = (gz0 + j + 0.5) * FAR_CELL;
			const dist = Math.hypot(wx - cam.x, wz - cam.z);
			if (dist > FAR_DIST || dist < MAX_DIST - FAR_CELL * 0.5) continue;
			const hs: [number, number, number, number] = [fh[a] ?? 0, fh[b] ?? 0, fh[c] ?? 0, fh[d] ?? 0];
			const col = shade(pal, look, hs, dist, wx, wz, FAR_CELL);
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

const SEAM_PX = 0.6;
const sx: number[] = new Array(8).fill(0);
const sy: number[] = new Array(8).fill(0);
const quad: number[] = new Array(12).fill(0);
const idx = [0, 0, 0, 0];

export function drawQuad(ctx: CanvasRenderingContext2D, cam: Camera, it: QuadItem): void {
	idx[0] = it.a; idx[1] = it.b; idx[2] = it.c; idx[3] = it.d;
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
