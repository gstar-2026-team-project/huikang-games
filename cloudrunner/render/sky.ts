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
