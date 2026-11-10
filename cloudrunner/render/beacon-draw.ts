import type { Plan } from "../game/autopilot";
import { TURNPOINT_FX_DURATION } from "../game/constants";
import type { Sim } from "../game/flight";
import { idealPath, PATH_BUFFER_LENGTH } from "../game/ideal-path";
import type { Turnpoint } from "../game/task";
import { surfaceHeight } from "../game/terrain";
import { CLOUD_BASE } from "../game/thermals";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import type { Palette } from "./palette";

const SEGMENTS = 24;
const pts = new Float32Array((SEGMENTS + 1) * 3);
const tmp = [0, 0, 0];
const top = [0, 0, 0];
/** Beacons drawn past the next one. */
const BEACONS_SHOWN = 3;

export interface BeaconItem { kind: 1; z: number; tp: Turnpoint; color: string; scale: number; alpha: number; next: boolean }

/** Upcoming turnpoints, plus the one just reached: green and widening as it fades. */
export function queueBeacons(sim: Sim, cam: Camera, pal: Palette, items: BeaconItem[]): void {
	const end = Math.min(sim.turnpoints.length, sim.next + BEACONS_SHOWN);
	for (let i = sim.next; i < end; i++) {
		const tp = sim.turnpoints[i];
		if (!tp) continue;
		cam.point(tp.x, sim.plane.y, tp.z, tmp);
		if ((tmp[2] ?? 0) < -tp.r) continue;
		const next = i === sim.next;
		items.push({ kind: 1, z: Math.max(tmp[2] ?? 0, NEAR), tp, color: next ? pal.beacon : pal.beaconDim, scale: 1, alpha: 1, next });
	}
	for (const f of sim.fx) {
		cam.point(f.tp.x, sim.plane.y, f.tp.z, tmp);
		const k = f.t / TURNPOINT_FX_DURATION;
		items.push({ kind: 1, z: Math.max(tmp[2] ?? 0, NEAR), tp: f.tp, color: pal.beaconHit, scale: 1 + k * 0.8, alpha: 1 - k, next: true });
	}
}

/** A level circle of radius `rad` around the beacon at height y. */
function circle(ctx: CanvasRenderingContext2D, cam: Camera, tp: Turnpoint, y: number, rad: number, width: number): void {
	for (let k = 0; k <= SEGMENTS; k++) {
		const a = (k / SEGMENTS) * Math.PI * 2;
		cam.point(tp.x + Math.cos(a) * rad, y, tp.z + Math.sin(a) * rad, pts, k * 3);
	}
	for (let k = 0; k < SEGMENTS; k++) {
		const z0 = pts[k * 3 + 2] ?? 0, z1 = pts[k * 3 + 5] ?? 0;
		if (z0 < NEAR || z1 < NEAR) continue;
		ctx.lineWidth = Math.max(1.5, Math.min(7, (width * cam.F) / ((z0 + z1) / 2)));
		ctx.beginPath();
		ctx.moveTo(cam.sx(pts, k * 3), cam.sy(pts, k * 3));
		ctx.lineTo(cam.sx(pts, k * 3 + 3), cam.sy(pts, k * 3 + 3));
		ctx.stroke();
	}
}

/**
 * A turnpoint: a pillar of light from the ground to the cloud base, a circle
 * on the ground, and for the next one a circle at the glider's own height that
 * shows exactly where "reached" is.
 */
export function drawBeacon(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, it: BeaconItem): void {
	const tp = it.tp;
	const ground = surfaceHeight(sim.terrain, tp.x, tp.z);
	ctx.strokeStyle = it.color;
	ctx.globalAlpha = Math.max(0, it.alpha);
	ctx.lineCap = "round";
	cam.point(tp.x, ground, tp.z, tmp);
	cam.point(tp.x, CLOUD_BASE, tp.z, top);
	if ((tmp[2] ?? 0) > NEAR && (top[2] ?? 0) > NEAR) {
		ctx.lineWidth = Math.max(2, Math.min(9, (5 * cam.F) / it.z));
		ctx.beginPath();
		ctx.moveTo(cam.sx(tmp), cam.sy(tmp));
		ctx.lineTo(cam.sx(top), cam.sy(top));
		ctx.stroke();
	}
	circle(ctx, cam, tp, ground + 4, tp.r * it.scale, 2.6);
	if (it.next) circle(ctx, cam, tp, sim.plane.y, tp.r * it.scale, 3.2);
	ctx.globalAlpha = 1;
}

/** Edge arrow toward the next beacon when it is off screen. */
export function drawBeaconArrow(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, pal: Palette): void {
	const tp = sim.turnpoints[sim.next];
	if (!tp) return;
	cam.point(tp.x, sim.plane.y, tp.z, tmp);
	if ((tmp[2] ?? 0) > NEAR) {
		const X = cam.sx(tmp);
		if (X > 30 && X < cam.W - 30) return;
	}
	const ang = Math.atan2(-(tmp[1] ?? 0), tmp[0] ?? 0);
	const R = Math.min(cam.W, cam.H) * 0.32;
	ctx.save();
	ctx.translate(cam.W / 2 + Math.cos(ang) * R, cam.horizonY + Math.sin(ang) * R);
	ctx.rotate(ang);
	ctx.fillStyle = pal.beacon;
	ctx.strokeStyle = "rgba(0,0,0,0.35)";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(16, 0);
	ctx.lineTo(-8, -12);
	ctx.lineTo(-3, 0);
	ctx.lineTo(-8, 12);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	ctx.restore();
}

/** How far under the planned line the dashes are drawn (m). */
const PATH_DROP = 12;
const pathWorld = new Float32Array(PATH_BUFFER_LENGTH);
const pathCam = new Float32Array(PATH_BUFFER_LENGTH);

/** The autopilot's plan as dashes: to the thermal it would use, up it, and on to the beacon. */
export function drawIdealPath(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, plan: Plan, pal: Palette): void {
	const count = idealPath(sim, plan, pathWorld);
	for (let k = 0; k < count; k++) {
		// Drawn a little under the flight line: dead ahead at eye level it would shrink to a dot.
		cam.point(pathWorld[k * 3] ?? 0, (pathWorld[k * 3 + 1] ?? 0) - PATH_DROP, pathWorld[k * 3 + 2] ?? 0, pathCam, k * 3);
	}
	ctx.strokeStyle = pal.path;
	ctx.globalAlpha = 0.85;
	ctx.lineCap = "round";
	// Every other segment, so the line reads as dashes flowing away from the glider.
	for (let k = 1; k + 1 < count; k += 2) {
		const z0 = pathCam[k * 3 + 2] ?? 0, z1 = pathCam[k * 3 + 5] ?? 0;
		if (z0 < NEAR || z1 < NEAR) continue;
		ctx.lineWidth = Math.max(1.5, Math.min(6, (1.8 * cam.F) / ((z0 + z1) / 2)));
		ctx.beginPath();
		ctx.moveTo(cam.sx(pathCam, k * 3), cam.sy(pathCam, k * 3));
		ctx.lineTo(cam.sx(pathCam, k * 3 + 3), cam.sy(pathCam, k * 3 + 3));
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}
