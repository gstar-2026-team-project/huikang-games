import { CRASH_DURATION } from "../game/constants";
import type { Sim } from "../game/flight";
import { surfaceHeight } from "../game/terrain";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import { buildJet, JET_NOZZLE_Z } from "./jet-model";
import type { Paint, Tri, V3 } from "./model-kit";
import { buildProp } from "./prop-model";
import type { Palette, RGB } from "./palette";

const tmp = [0, 0, 0];
/** Drawn size relative to the model's metres, so the jet reads on a phone from the chase camera. */
const JET_SCALE = 1.3;
const BURST_COLORS = ["#ffb03b", "#ff6a2b", "#5a5a5a"];
const SUN: V3 = (() => {
	const v = [-0.45, 0.8, 0.35];
	const l = Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0);
	return [(v[0] ?? 0) / l, (v[1] ?? 0) / l, (v[2] ?? 0) / l];
})();

interface Face { z: number; pts: [number, number, number, number, number, number]; color: string; disc: boolean }
const tris: Tri[] = [];
const faces: Face[] = [];
const cam3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];

function paintOf(pal: Palette, p: Paint): RGB {
	switch (p) {
		case "body": return pal.jetBody;
		case "trim": return pal.jetTrim;
		case "glass": return pal.jetGlass;
		case "white": return pal.propWhite;
		default: return pal.jetDark;
	}
}

const DISC_COLOR = "rgba(225,228,232,0.3)";
const PROP_IDLE_SPIN = 18; // rad/s on the menus
const PROP_SPIN = 28; // rad/s at closed throttle…
const PROP_SPIN_THROTTLE = 30; // …plus this much at full

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
 * The player's plane, flat-shaded and depth-sorted: the fighter jet in the
 * canyon levels, the prop plane in the open valley. Control surfaces follow the
 * stick; the afterburner or the propeller follows the throttle.
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
	const k = JET_SCALE;
	const toWorld = (v: V3): V3 => [
		ox + k * (r[0] * v[0] + u[0] * v[1] + f[0] * v[2]),
		oy + k * (r[1] * v[0] + u[1] * v[1] + f[1] * v[2]),
		oz + k * (r[2] * v[0] + u[2] * v[1] + f[2] * v[2]),
	];

	const jet = !!sim.spec.canyon;
	const pose = { roll: flying ? sim.stick.roll : 0, pitch: flying ? sim.stick.pitch : 0 };
	if (jet) buildJet(pose, tris);
	else {
		// Propeller angle from the sim clock while flying, the ambient clock at rest.
		const clock = flying ? -sim.timeLeft * (PROP_SPIN + sim.throttle * PROP_SPIN_THROTTLE) : idleT * PROP_IDLE_SPIN;
		buildProp({ ...pose, prop: clock }, tris);
	}
	drawShadow(ctx, cam, sim, ox, oz, p.yaw, jet);
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
		const disc = t.paint === "disc";
		faces.push({
			z: ((cam3[2] ?? 0) + (cam3[5] ?? 0) + (cam3[8] ?? 0)) / 3,
			pts: [cam.sx(cam3, 0), cam.sy(cam3, 0), cam.sx(cam3, 3), cam.sy(cam3, 3), cam.sx(cam3, 6), cam.sy(cam3, 6)],
			color: disc ? DISC_COLOR : `rgb(${Math.min(255, col[0] * lit) | 0},${Math.min(255, col[1] * lit) | 0},${Math.min(255, col[2] * lit) | 0})`,
			disc,
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
		if (fc.disc) continue; // translucent: a stroke would draw spokes
		ctx.strokeStyle = fc.color;
		ctx.stroke(); // a few dozen small faces: the stroke closes seams cheaply here
	}
	if (flying && jet) drawAfterburner(ctx, cam, sim, toWorld);
}

/** The plane's shadow fades out and spreads by this height above the ground (m). */
const SHADOW_FADE = 170;
/** The sun sits low behind the chase camera, so the shadow falls ahead where the player can see it: metres forward per metre of height. */
const SHADOW_LEAD = 1.3;
const shadowPts = [0, 0, 0];
// Footprints in plane-local x/z (metres): nose, wingtips, tail.
const JET_FOOT: readonly [number, number][] = [[0, 6.8], [1.0, 1.6], [5.0, -2.4], [2.6, -5.2], [0, -5.6], [-2.6, -5.2], [-5.0, -2.4], [-1.0, 1.6]];
const PROP_FOOT: readonly [number, number][] = [[0, 3.4], [0.7, 0.9], [5.2, 0.5], [5.2, -0.5], [0.6, -0.7], [1.9, -4.2], [0, -4.8], [-1.9, -4.2], [-0.6, -0.7], [-5.2, -0.5], [-5.2, 0.5], [-0.7, 0.9]];

/** The plane's shadow on the ground ahead: it closes in, darkens and tightens as the plane gets lower. */
function drawShadow(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, px: number, pz: number, yaw: number, jet: boolean): void {
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
	const k = JET_SCALE * (1 + h / 180);
	const c = Math.cos(yaw), s = Math.sin(yaw);
	ctx.beginPath();
	const foot = jet ? JET_FOOT : PROP_FOOT;
	for (let i = 0; i < foot.length; i++) {
		const [lx, lz] = foot[i] as [number, number];
		cam.point(ox + k * (lx * c + lz * s), ground + 0.6, oz + k * (-lx * s + lz * c), shadowPts);
		if ((shadowPts[2] ?? 0) < NEAR) return;
		if (i === 0) ctx.moveTo(cam.sx(shadowPts), cam.sy(shadowPts));
		else ctx.lineTo(cam.sx(shadowPts), cam.sy(shadowPts));
	}
	ctx.closePath();
	ctx.fillStyle = `rgba(0,0,0,${(0.45 * (1 - h / SHADOW_FADE)).toFixed(3)})`;
	ctx.fill();
}

const FLAME_BASE = 1.2; // m of flame at idle throttle
const FLAME_GROWTH = 4.5; // extra m at full throttle

/** Flame from the nozzle; its length follows the throttle and flickers with sim time. */
function drawAfterburner(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, toWorld: (v: V3) => V3): void {
	const t = sim.timeLeft * 37; // sim-driven flicker: stops when the sim stops
	const len = FLAME_BASE + sim.throttle * FLAME_GROWTH * (0.85 + 0.15 * Math.sin(t) * Math.sin(t * 1.7));
	const n0 = toWorld([0, 0.05, JET_NOZZLE_Z]), tip = toWorld([0, 0.05, JET_NOZZLE_Z - len]);
	const w0 = toWorld([0.6, 0.05, JET_NOZZLE_Z]);
	cam.point(n0[0], n0[1], n0[2], cam3, 0);
	cam.point(tip[0], tip[1], tip[2], cam3, 3);
	cam.point(w0[0], w0[1], w0[2], cam3, 6);
	if ((cam3[2] ?? 0) < NEAR || (cam3[5] ?? 0) < NEAR || (cam3[8] ?? 0) < NEAR) return;
	const cx = cam.sx(cam3, 0), cy = cam.sy(cam3, 0), tx = cam.sx(cam3, 3), ty = cam.sy(cam3, 3);
	const rad = Math.hypot(cam.sx(cam3, 6) - cx, cam.sy(cam3, 6) - cy) * 0.8;
	const hot = 0.3 + sim.throttle * 0.5;
	ctx.globalAlpha = hot;
	ctx.fillStyle = "#ff8a2a";
	ctx.beginPath();
	ctx.ellipse((cx + tx) / 2, (cy + ty) / 2, Math.max(rad, Math.hypot(tx - cx, ty - cy) / 2), rad, Math.atan2(ty - cy, tx - cx), 0, 6.283);
	ctx.fill();
	ctx.fillStyle = "#ffe08a";
	ctx.beginPath();
	ctx.arc(cx, cy, rad * 0.7, 0, 6.283);
	ctx.fill();
	ctx.globalAlpha = 1;
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
