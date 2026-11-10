import type { Sim } from "../game/flight";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import { mix, type Palette, type RGB, rgb, rgba } from "./palette";
import { CLOUD_BASE_Y, CLOUD_H, CLOUD_VARIANTS, CLOUD_W, cloudSprite, glowSprite, skySprite } from "./sprites";

const a = [0, 0, 0];
const b = [0, 0, 0];
const down = [0, 0, 0];
const p = [0, 0, 0];

/** Where the sun sits in the sky: low enough to see, on the side the hills are lit from. */
const SUN_DIR = (() => {
	const az = Math.atan2(-0.45, 0.35);
	const el = 0.32;
	return [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)] as const;
})();

/** Far ranges on the horizon: distance (m), base height, relief and the haze they sit in. */
const RANGES = [
	{ dist: 14000, base: 300, relief: 1500, haze: 0.5, far: true },
	{ dist: 8500, base: 100, relief: 820, haze: 0.3, far: false },
] as const;
const RIDGE_STEPS = 96;
/** Half the arc of horizon drawn either side of the heading (rad): wider than any view. */
const RIDGE_ARC = 1.7;
const footX = new Float32Array(RIDGE_STEPS + 1);
const footY = new Float32Array(RIDGE_STEPS + 1);

function ridgeHeight(seed: number, k: number, th: number): number {
	const s = (seed % 997) * 0.37 + k * 11.3;
	// Peaks and saddles: a few broad swells with sharper crests on top.
	const swell = 0.5 + 0.25 * Math.sin(th * 4 + s) + 0.15 * Math.sin(th * 9.3 + s * 1.7);
	const crest = Math.abs(Math.sin(th * 21.7 + s * 2.3)) * 0.18 + Math.abs(Math.sin(th * 47.1 + s * 0.7)) * 0.07;
	return Math.max(0, swell + crest - 0.15);
}

/** Sky gradient tied to the horizon, the sun, far ridges and the hazy ground beyond the terrain. */
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
	// The baked gradient, stretched from the horizon up past the top of the screen.
	// (A negative height would not flip it: canvas normalises the rectangle, which
	// put the gradient under the ground and left the sky one flat colour.)
	// Short enough that the deeper blue reaches the top of the screen behind the clouds.
	const span = Math.max(cam.H * 0.75, cam.F * 0.6);
	const ratio = ctx.getTransform().a;
	ctx.save();
	// Local x runs along the horizon and local y points down, so the strip's top
	// (the zenith colour) lands `span` above the horizon and its bottom on it.
	ctx.setTransform(ux * ratio, uy * ratio, nx * ratio, ny * ratio, ax * ratio, ay * ratio);
	ctx.imageSmoothingEnabled = true;
	ctx.drawImage(skySprite(pal), -E, -span, 2 * E, span);
	ctx.restore();

	drawSun(ctx, cam, pal);
	// Hazy ground beyond the drawn terrain.
	ctx.fillStyle = rgb(mix(pal.haze, pal.ridgeNear, 0.3));
	ctx.beginPath();
	ctx.moveTo(ax - ux * E, ay - uy * E);
	ctx.lineTo(ax + ux * E, ay + uy * E);
	ctx.lineTo(ax + ux * E + nx * E, ay + uy * E + ny * E);
	ctx.lineTo(ax - ux * E + nx * E, ay - uy * E + ny * E);
	ctx.fill();
	// Canyon country stands taller: lift the far ranges by the canyon rim.
	const lift = (sim.spec.canyon?.rim ?? 0) * 0.8;
	for (const r of RANGES) drawRange(ctx, cam, sim, pal, r, lift);
}

function drawSun(ctx: CanvasRenderingContext2D, cam: Camera, pal: Palette): void {
	cam.dir(SUN_DIR[0], SUN_DIR[1], SUN_DIR[2], p);
	if ((p[2] ?? 0) <= 0.05) return;
	const x = cam.sx(p), y = cam.sy(p);
	const s = Math.min(cam.W, cam.H) * 0.9;
	if (x < -s || x > cam.W + s || y < -s || y > cam.H + s) return;
	ctx.globalAlpha = 0.55;
	ctx.drawImage(glowSprite(pal, pal.sun, "sun"), x - s / 2, y - s / 2, s, s);
	ctx.globalAlpha = 1;
	ctx.fillStyle = rgba(mix(pal.sun, [255, 255, 255], 0.6), 0.95);
	ctx.beginPath();
	ctx.arc(x, y, Math.max(8, s * 0.035), 0, 6.283);
	ctx.fill();
}

function drawRange(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, pal: Palette, r: (typeof RANGES)[number], lift: number): void {
	const col: RGB = mix(r.far ? pal.ridgeFar : pal.ridgeNear, pal.haze, r.haze);
	ctx.fillStyle = rgb(col);
	ctx.beginPath();
	let n = 0;
	const yaw = sim.plane.yaw;
	for (let k = 0; k <= RIDGE_STEPS; k++) {
		const th = yaw - RIDGE_ARC + (2 * RIDGE_ARC * k) / RIDGE_STEPS;
		const h = lift + r.base + r.relief * ridgeHeight(sim.seed, r.far ? 1 : 2, th);
		const wx = cam.x + Math.sin(th) * r.dist, wz = cam.z + Math.cos(th) * r.dist;
		cam.point(wx, h, wz, p);
		if ((p[2] ?? 0) < NEAR) continue;
		const x = cam.sx(p), y = cam.sy(p);
		if (n === 0) ctx.moveTo(x, y);
		else ctx.lineTo(x, y);
		// The foot of the range, at the valley floor: the silhouette closes along it.
		cam.point(wx, 0, wz, p);
		footX[n] = cam.sx(p);
		footY[n] = cam.sy(p) + 2;
		n++;
	}
	if (n === 0) return;
	for (let k = n - 1; k >= 0; k--) ctx.lineTo(footX[k] ?? 0, footY[k] ?? 0);
	ctx.closePath();
	ctx.fill();
}

export interface CloudItem { kind: 2; z: number; x: number; y: number; w: number; variant: number; alpha: number }

const tmp = [0, 0, 0];
const CLOUD_CELL = 900;
/** Farther than this (m) a cloud is lost in the haze. */
const CLOUD_RANGE = 5200;

/** Static clouds hashed from world cells, so they never animate on their own. */
export function queueClouds(sim: Sim, cam: Camera, items: CloudItem[]): void {
	const bz = Math.floor(cam.z / CLOUD_CELL), bx = Math.floor(cam.x / CLOUD_CELL);
	for (let j = -5; j <= 5; j++) {
		for (let i = -5; i <= 5; i++) {
			const cx = bx + i, cz = bz + j;
			const h = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233 + sim.seed) * 43758.5453) % 1;
			if (h > 0.35) continue;
			const wx = cx * CLOUD_CELL + h * 700, wz = cz * CLOUD_CELL + ((h * 1700) % 700);
			const dist = Math.hypot(wx - cam.x, wz - cam.z);
			if (dist > CLOUD_RANGE) continue;
			cam.point(wx, 650 + h * 900, wz, tmp);
			const z = tmp[2] ?? 0;
			if (z < 40) continue;
			// Clouds are 250…450 m across.
			const w = ((250 + h * 570) * cam.F) / z;
			const x = cam.sx(tmp), y = cam.sy(tmp);
			if (w < 3 || x + w < 0 || x - w > cam.W || y + w < 0 || y - w > cam.H) continue;
			const haze = Math.max(0, (dist - CLOUD_RANGE * 0.6) / (CLOUD_RANGE * 0.4));
			items.push({ kind: 2, z, x, y, w, variant: Math.floor(h * 1000) % CLOUD_VARIANTS, alpha: 1 - haze });
		}
	}
}

/** A cumulus billboard, turned with the horizon, fading into the far haze. */
export function drawCloud(ctx: CanvasRenderingContext2D, cam: Camera, it: CloudItem, pal: Palette): void {
	const hgt = (it.w * CLOUD_H) / CLOUD_W;
	ctx.save();
	ctx.globalAlpha = it.alpha * 0.96;
	ctx.translate(it.x, it.y);
	ctx.rotate(cam.screenRoll);
	ctx.drawImage(cloudSprite(pal, it.variant), -it.w / 2, -hgt * CLOUD_BASE_Y, it.w, hgt);
	ctx.restore();
}
