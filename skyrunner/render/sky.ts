import type { Sim } from "../game/flight";
import type { Camera } from "./camera";
import { mix, type Palette, rgb } from "./palette";

const a = [0, 0, 0];
const b = [0, 0, 0];
const down = [0, 0, 0];
const GLOW_STEPS = 14;

/** Sky fill, a glow band toward the horizon, and the hazy ground plane under it. */
export function drawSky(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, pal: Palette): void {
	ctx.fillStyle = rgb(pal.skyTop);
	ctx.fillRect(0, 0, cam.W, cam.H);
	const yaw = sim.plane.yaw;
	cam.dir(Math.sin(yaw - 1.2), 0, Math.cos(yaw - 1.2), a);
	cam.dir(Math.sin(yaw + 1.2), 0, Math.cos(yaw + 1.2), b);
	const ax = cam.sx(a), ay = cam.sy(a), bx = cam.sx(b), by = cam.sy(b);
	let ux = bx - ax, uy = by - ay;
	const L = Math.hypot(ux, uy) || 1;
	// The horizon anchor sits far off-screen on wide views, so reach past both edges from it.
	const E = L + 4 * (cam.W + cam.H);
	ux /= L;
	uy /= L;
	let nx = -uy, ny = ux;
	cam.dir(0, -1, 0, down);
	if (nx * (down[0] ?? 0) + ny * -(down[1] ?? 0) < 0) {
		nx = -nx;
		ny = -ny;
	}
	// Horizon glow as flat stepped bands (no per-frame gradient object).
	const band = cam.H * 0.6;
	for (let k = GLOW_STEPS; k >= 1; k--) {
		const d = (band * k) / GLOW_STEPS;
		ctx.fillStyle = rgb(mix(pal.skyLow, pal.skyTop, (k - 1) / GLOW_STEPS));
		ctx.beginPath();
		ctx.moveTo(ax - ux * E, ay - uy * E);
		ctx.lineTo(ax + ux * E, ay + uy * E);
		ctx.lineTo(ax + ux * E - nx * d, ay + uy * E - ny * d);
		ctx.lineTo(ax - ux * E - nx * d, ay - uy * E - ny * d);
		ctx.fill();
	}
	ctx.fillStyle = rgb(pal.haze);
	ctx.beginPath();
	ctx.moveTo(ax - ux * E, ay - uy * E);
	ctx.lineTo(ax + ux * E, ay + uy * E);
	ctx.lineTo(ax + ux * E + nx * E, ay + uy * E + ny * E);
	ctx.lineTo(ax - ux * E + nx * E, ay - uy * E + ny * E);
	ctx.fill();
}

export interface CloudItem { kind: 2; z: number; x: number; y: number; s: number }

const tmp = [0, 0, 0];
const CLOUD_CELL = 900;

/** A few static clouds hashed from world cells, so they never animate on their own. */
export function queueClouds(sim: Sim, cam: Camera, items: CloudItem[]): void {
	const bz = Math.floor(cam.z / CLOUD_CELL), bx = Math.floor(cam.x / CLOUD_CELL);
	for (let j = -2; j <= 3; j++) {
		for (let i = -2; i <= 2; i++) {
			const cx = bx + i, cz = bz + j;
			const h = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233 + sim.seed) * 43758.5453) % 1;
			if (h > 0.35) continue;
			cam.point(cx * CLOUD_CELL + h * 700, 650 + h * 900, cz * CLOUD_CELL + ((h * 1700) % 700), tmp);
			const z = tmp[2] ?? 0;
			if (z < 20) continue;
			items.push({ kind: 2, z, x: cam.sx(tmp), y: cam.sy(tmp), s: (90 * cam.F) / z });
		}
	}
}

export function drawCloud(ctx: CanvasRenderingContext2D, it: CloudItem, pal: Palette): void {
	ctx.fillStyle = pal.cloud;
	ctx.beginPath();
	ctx.ellipse(it.x, it.y, it.s * 1.6, it.s * 0.45, 0, 0, 6.283);
	ctx.ellipse(it.x - it.s * 0.5, it.y - it.s * 0.25, it.s * 0.7, it.s * 0.45, 0, 0, 6.283);
	ctx.ellipse(it.x + it.s * 0.4, it.y - it.s * 0.35, it.s * 0.8, it.s * 0.55, 0, 0, 6.283);
	ctx.fill();
}
