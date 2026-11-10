import { CRASH_DURATION } from "../game/constants";
import type { Sim } from "../game/flight";
import { surfaceHeight } from "../game/terrain";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import { buildGlider } from "./glider-model";
import type { Paint, Tri, V3 } from "./model-kit";
import type { Palette, RGB } from "./palette";

const tmp = [0, 0, 0];
/** Drawn size relative to the model's metres: the long wings just fit a phone screen from the chase camera. */
const MODEL_SCALE = 1;
const BURST_COLORS = ["#ffb03b", "#ff6a2b", "#5a5a5a"];
const SUN: V3 = (() => {
	const v = [-0.45, 0.8, 0.35];
	const l = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
	return [(v[0] ?? 0) / l, (v[1] ?? 0) / l, (v[2] ?? 0) / l];
})();

interface Face { z: number; pts: [number, number, number, number, number, number]; color: string }
const tris: Tri[] = [];
const faces: Face[] = [];
const cam3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];

function paintOf(pal: Palette, p: Paint): RGB {
	switch (p) {
		case "trim": return pal.gliderTrim;
		case "glass": return pal.gliderGlass;
		default: return pal.gliderBody;
	}
}

/** Plane-local basis in world space: right, up, forward. */
function basis(yaw: number, pitch: number, roll: number) {
	const f: V3 = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
	const r0: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
	const u0: V3 = [-Math.sin(yaw) * Math.sin(pitch), Math.cos(pitch), -Math.cos(yaw) * Math.sin(pitch)];
	const c = Math.cos(roll), s = Math.sin(roll);
	// Positive roll banks right: the right wing dips.
	const r: V3 = [r0[0] * c - u0[0] * s, r0[1] * c - u0[1] * s, r0[2] * c - u0[2] * s];
	const u: V3 = [u0[0] * c + r0[0] * s, u0[1] * c + r0[1] * s, u0[2] * c + r0[2] * s];
	return { r, u, f };
}

/**
 * The player's sailplane, flat-shaded and depth-sorted. It banks and pitches
 * with the flight, and its ailerons, elevator and rudder follow the stick.
 */
export function drawPlane(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, pal: Palette, restT: number | null): void {
	const p = sim.plane;
	cam.point(p.x, p.y, p.z, tmp);
	if ((tmp[2] ?? 0) < NEAR) return;
	if (sim.phase === "crashing" || (sim.phase === "ended" && sim.endReason === "ground")) {
		drawBurst(ctx, sim, cam.sx(tmp), cam.sy(tmp), cam.F / (tmp[2] ?? 1));
		return;
	}
	const flying = restT === null && sim.phase === "flying";
	const idleT = restT ?? 0;
	// Resting bob and a lazy wing-rock on the idle screens, from the ambient frame clock.
	const bobY = flying ? 0 : Math.sin(idleT * 1.7) * 0.25;
	const roll = p.roll + (flying ? 0 : Math.sin(idleT * 1.1) * 0.06);
	const { r, u, f } = basis(p.yaw, p.pitch, roll);
	const ox = p.x, oy = p.y + bobY, oz = p.z;
	const k = MODEL_SCALE;
	const toWorld = (v: V3): V3 => [
		ox + k * (r[0] * v[0] + u[0] * v[1] + f[0] * v[2]),
		oy + k * (r[1] * v[0] + u[1] * v[1] + f[1] * v[2]),
		oz + k * (r[2] * v[0] + u[2] * v[1] + f[2] * v[2]),
	];

	buildGlider({ roll: flying ? sim.stick.roll : 0, pitch: flying ? sim.stick.pitch : 0 }, tris);
	drawShadow(ctx, cam, sim, ox, oz, p.yaw);
	faces.length = 0;
	for (const t of tris) {
		const a = toWorld(t.a), b = toWorld(t.b), c = toWorld(t.c);
		// World normal for lighting and culling.
		const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
		let nx = (e1[1] ?? 0) * (e2[2] ?? 0) - (e1[2] ?? 0) * (e2[1] ?? 0);
		let ny = (e1[2] ?? 0) * (e2[0] ?? 0) - (e1[0] ?? 0) * (e2[2] ?? 0);
		let nz = (e1[0] ?? 0) * (e2[1] ?? 0) - (e1[1] ?? 0) * (e2[0] ?? 0);
		const nl = Math.hypot(nx, ny, nz) || 1;
		nx /= nl; ny /= nl; nz /= nl;
		const toCam = (cam.x - a[0]) * nx + (cam.y - a[1]) * ny + (cam.z - a[2]) * nz;
		if (toCam < 0) {
			if (!t.twoSided) continue;
			nx = -nx; ny = -ny; nz = -nz;
		}
		cam.point(a[0], a[1], a[2], cam3, 0);
		cam.point(b[0], b[1], b[2], cam3, 3);
		cam.point(c[0], c[1], c[2], cam3, 6);
		if ((cam3[2] ?? 0) < NEAR || (cam3[5] ?? 0) < NEAR || (cam3[8] ?? 0) < NEAR) continue;
		const lit = 0.55 + 0.5 * Math.max(0, nx * SUN[0] + ny * SUN[1] + nz * SUN[2]);
		const col = paintOf(pal, t.paint);
		faces.push({
			z: ((cam3[2] ?? 0) + (cam3[5] ?? 0) + (cam3[8] ?? 0)) / 3,
			pts: [cam.sx(cam3, 0), cam.sy(cam3, 0), cam.sx(cam3, 3), cam.sy(cam3, 3), cam.sx(cam3, 6), cam.sy(cam3, 6)],
			color: `rgb(${Math.min(255, col[0] * lit) | 0},${Math.min(255, col[1] * lit) | 0},${Math.min(255, col[2] * lit) | 0})`,
		});
	}
	faces.sort((a, b) => b.z - a.z);
	ctx.lineJoin = "round";
	ctx.lineWidth = 0.6;
	for (const fc of faces) {
		const q = fc.pts;
		ctx.beginPath();
		ctx.moveTo(q[0], q[1]);
		ctx.lineTo(q[2], q[3]);
		ctx.lineTo(q[4], q[5]);
		ctx.closePath();
		ctx.fillStyle = fc.color;
		ctx.fill();
		ctx.strokeStyle = fc.color;
		ctx.stroke(); // a few dozen small faces: the stroke closes seams cheaply here
	}
}

/** The plane's shadow fades out and spreads by this height above the ground (m). */
const SHADOW_FADE = 170;
/** The sun sits low behind the chase camera, so the shadow falls ahead where the player can see it: metres forward per metre of height. */
const SHADOW_LEAD = 1.3;
const shadowPts = [0, 0, 0];
// Footprint in plane-local x/z (metres): nose, wing, boom, tailplane, and back up the other side.
const HALF_FOOT: readonly [number, number][] = [[0, 3], [0.4, 0.8], [7.5, 0.36], [7.5, -0.04], [0.4, -0.3], [0.15, -4.2], [1.5, -4.45], [1.5, -4.95], [0, -5]];
const FOOT: readonly [number, number][] = [...HALF_FOOT, ...HALF_FOOT.slice(1, -1).reverse().map(([x, z]): [number, number] => [-x, z])];

/** The plane's shadow on the ground ahead: it closes in, darkens and tightens as the plane gets lower. */
function drawShadow(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, px: number, pz: number, yaw: number): void {
	let h = sim.plane.y - surfaceHeight(sim.terrain, px, pz);
	if (h > SHADOW_FADE || h < 0) return;
	// Two passes find where the sun's ray meets the ground ahead.
	let ox = px, oz = pz, ground = 0;
	for (let i = 0; i < 2; i++) {
		ox = px + Math.sin(yaw) * h * SHADOW_LEAD;
		oz = pz + Math.cos(yaw) * h * SHADOW_LEAD;
		ground = surfaceHeight(sim.terrain, ox, oz);
		h = Math.max(0, sim.plane.y - ground);
	}
	if (h > SHADOW_FADE || h < 0) return;
	const k = MODEL_SCALE * (1 + h / 180);
	const c = Math.cos(yaw), s = Math.sin(yaw);
	ctx.beginPath();
	for (let i = 0; i < FOOT.length; i++) {
		const [lx, lz] = FOOT[i] as [number, number];
		cam.point(ox + k * (lx * c + lz * s), ground + 0.6, oz + k * (-lx * s + lz * c), shadowPts);
		if ((shadowPts[2] ?? 0) < NEAR) return;
		if (i === 0) ctx.moveTo(cam.sx(shadowPts), cam.sy(shadowPts));
		else ctx.lineTo(cam.sx(shadowPts), cam.sy(shadowPts));
	}
	ctx.closePath();
	ctx.fillStyle = `rgba(0,0,0,${(0.45 * (1 - h / SHADOW_FADE)).toFixed(3)})`;
	ctx.fill();
}

function drawBurst(ctx: CanvasRenderingContext2D, sim: Sim, px: number, py: number, s: number): void {
	const t = Math.min(sim.crashT, CRASH_DURATION);
	const fade = Math.max(0, 1 - t / CRASH_DURATION);
	if (fade <= 0) return;
	ctx.globalAlpha = fade;
	for (const b of sim.burst) {
		const d = t * 14 * b.s * s;
		ctx.fillStyle = BURST_COLORS[b.c] ?? "#888";
		ctx.beginPath();
		ctx.arc(px + Math.cos(b.a) * d, py + Math.sin(b.a) * d - t * t * 8 * s, (1.4 - t * 0.6) * s * (b.c === 2 ? 1.6 : 1), 0, 6.283);
		ctx.fill();
	}
	ctx.globalAlpha = 1;
}
