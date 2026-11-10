import type { Plan } from "../game/autopilot";
import { TURNPOINT_FX_DURATION } from "../game/constants";
import type { Sim } from "../game/flight";
import { idealPath, PATH_BUFFER_LENGTH } from "../game/ideal-path";
import type { Turnpoint } from "../game/task";
import { surfaceHeight } from "../game/terrain";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import { type Palette, rgba } from "./palette";
import { beamSprite } from "./sprites";

const SEGMENTS = 28;
const pts = new Float32Array((SEGMENTS + 1) * 3);
const tmp = [0, 0, 0];
const top = [0, 0, 0];
/** Beacons drawn past the next one. */
const BEACONS_SHOWN = 3;
/** The beam rises this high above the ground (m): above the clouds, so it shows over hills. */
const BEAM_HEIGHT = 1100;
/** Beam width (m), and the narrowest it is drawn (px) so a far beacon still shows. */
const BEAM_WIDTH = 28;
const BEAM_MIN_PX = 5;

export interface BeaconItem { kind: 1; z: number; tp: Turnpoint; index: number; next: boolean; fx: number | null }

/** Label widths by font and text: measured once, not every frame. */
const widths = new Map<string, number>();
function textWidth(ctx: CanvasRenderingContext2D, text: string): number {
	const key = `${ctx.font}|${text}`;
	let w = widths.get(key);
	if (w === undefined) {
		if (widths.size > 400) widths.clear();
		w = ctx.measureText(text).width;
		widths.set(key, w);
	}
	return w;
}

/** "850 m" or "1.4 km". */
export function distanceText(m: number): string {
	return m < 995 ? `${Math.max(0, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Upcoming turnpoints, plus the one just reached: green and widening as it fades. */
export function queueBeacons(sim: Sim, cam: Camera, items: BeaconItem[]): void {
	const end = Math.min(sim.turnpoints.length, sim.next + BEACONS_SHOWN);
	for (let i = sim.next; i < end; i++) {
		const tp = sim.turnpoints[i];
		if (!tp) continue;
		cam.point(tp.x, sim.plane.y, tp.z, tmp);
		if ((tmp[2] ?? 0) < -tp.r) continue;
		items.push({ kind: 1, z: Math.max(tmp[2] ?? 0, NEAR), tp, index: i, next: i === sim.next, fx: null });
	}
	for (const f of sim.fx) {
		cam.point(f.tp.x, sim.plane.y, f.tp.z, tmp);
		items.push({ kind: 1, z: Math.max(tmp[2] ?? 0, NEAR), tp: f.tp, index: -1, next: true, fx: f.t / TURNPOINT_FX_DURATION });
	}
}

/** A level circle of radius `rad` around the beacon at height y, filled and outlined. */
function groundRing(ctx: CanvasRenderingContext2D, cam: Camera, tp: Turnpoint, y: number, rad: number, fill: string, line: string): void {
	let ok = true;
	for (let k = 0; k <= SEGMENTS; k++) {
		const a = (k / SEGMENTS) * Math.PI * 2;
		cam.point(tp.x + Math.cos(a) * rad, y, tp.z + Math.sin(a) * rad, pts, k * 3);
		if ((pts[k * 3 + 2] ?? 0) < NEAR) ok = false;
	}
	if (ok) {
		ctx.fillStyle = fill;
		ctx.beginPath();
		for (let k = 0; k < SEGMENTS; k++) {
			if (k === 0) ctx.moveTo(cam.sx(pts, 0), cam.sy(pts, 0));
			else ctx.lineTo(cam.sx(pts, k * 3), cam.sy(pts, k * 3));
		}
		ctx.closePath();
		ctx.fill();
	}
	ctx.strokeStyle = line;
	for (let k = 0; k < SEGMENTS; k++) {
		const z0 = pts[k * 3 + 2] ?? 0, z1 = pts[k * 3 + 5] ?? 0;
		if (z0 < NEAR || z1 < NEAR) continue;
		ctx.lineWidth = Math.max(1.5, Math.min(8, (3 * cam.F) / ((z0 + z1) / 2)));
		ctx.beginPath();
		ctx.moveTo(cam.sx(pts, k * 3), cam.sy(pts, k * 3));
		ctx.lineTo(cam.sx(pts, k * 3 + 3), cam.sy(pts, k * 3 + 3));
		ctx.stroke();
	}
}

/**
 * A turnpoint: a tall beam of light from a ring on the ground that marks how
 * close counts, with a numbered marker at the glider's height and, for the
 * next one, the distance to it. The next beacon is bright, later ones dim.
 */
export function drawBeacon(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, it: BeaconItem, pal: Palette): void {
	const tp = it.tp;
	const ground = surfaceHeight(sim.terrain, tp.x, tp.z);
	const hit = it.fx !== null;
	const k = it.fx ?? 0;
	const col = hit ? pal.beaconHitRgb : pal.beaconRgb;
	const strong = it.next ? 1 : 0.4;
	const fade = hit ? 1 - k : 1;
	groundRing(ctx, cam, tp, ground + 3, tp.r * (1 + k * 0.8), rgba(col, 0.2 * strong * fade), rgba(col, 0.85 * strong * fade));
	// The beam.
	cam.point(tp.x, ground, tp.z, tmp);
	cam.point(tp.x, ground + BEAM_HEIGHT, tp.z, top);
	if ((tmp[2] ?? 0) > NEAR && (top[2] ?? 0) > NEAR) {
		const bx = cam.sx(tmp), by = cam.sy(tmp), tx = cam.sx(top), ty = cam.sy(top);
		const len = Math.hypot(tx - bx, ty - by);
		const w = Math.max(BEAM_MIN_PX, (BEAM_WIDTH * (1 + k) * cam.F) / it.z);
		ctx.save();
		ctx.globalAlpha = (it.next ? 0.95 : 0.4) * fade;
		ctx.translate(bx, by);
		ctx.rotate(Math.atan2(tx - bx, -(ty - by)));
		ctx.drawImage(beamSprite(pal, col, hit ? "hit" : "next"), -w / 2, -len, w, len);
		ctx.restore();
	}
}

/** The numbered markers, drawn over the scene so a hill never hides them. */
export function drawBeaconMarkers(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, pal: Palette): void {
	const end = Math.min(sim.turnpoints.length, sim.next + BEACONS_SHOWN);
	for (let i = end - 1; i >= sim.next; i--) {
		const tp = sim.turnpoints[i];
		if (tp) drawMarker(ctx, cam, sim, tp, i, i === sim.next, pal);
	}
}

/** The numbered badge on the beam at the glider's height, facing the camera, with the distance under it. */
function drawMarker(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, tp: Turnpoint, index: number, next: boolean, pal: Palette): void {
	const p = sim.plane;
	cam.point(tp.x, p.y + 40, tp.z, tmp);
	const z = tmp[2] ?? 0;
	if (z < NEAR * 10) return;
	const x = cam.sx(tmp), y = cam.sy(tmp);
	if (x < -40 || x > cam.W + 40 || y < -40 || y > cam.H + 40) return;
	const r = next ? 15 : 11;
	ctx.globalAlpha = next ? 1 : 0.6;
	ctx.fillStyle = next ? pal.beacon : "rgba(40,40,40,0.55)";
	ctx.strokeStyle = next ? "#fff" : pal.beacon;
	ctx.lineWidth = 2.5;
	ctx.beginPath();
	ctx.arc(x, y, r, 0, 6.283);
	ctx.fill();
	ctx.stroke();
	ctx.fillStyle = next ? "#2a1a00" : "#fff";
	ctx.font = `800 ${next ? 15 : 11}px system-ui, sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(String(index + 1), x, y + 1);
	if (next) {
		const label = distanceText(Math.hypot(tp.x - p.x, tp.z - p.z));
		ctx.font = "700 13px system-ui, sans-serif";
		const w = textWidth(ctx, label) + 12;
		ctx.fillStyle = "rgba(20,30,40,0.6)";
		ctx.beginPath();
		ctx.roundRect(x - w / 2, y + r + 4, w, 18, 9);
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.fillText(label, x, y + r + 13.5);
	}
	ctx.globalAlpha = 1;
}

/** Edge arrow toward the next beacon when it is off screen, with the distance beside it. */
export function drawBeaconArrow(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, pal: Palette): void {
	const tp = sim.turnpoints[sim.next];
	if (!tp) return;
	const p = sim.plane;
	cam.point(tp.x, p.y, tp.z, tmp);
	const ahead = (tmp[2] ?? 0) > NEAR;
	if (ahead) {
		const X = cam.sx(tmp);
		if (X > 40 && X < cam.W - 40) return;
	}
	// Direction on screen: sideways by the beacon's bearing, never up or down.
	const side = (tmp[0] ?? 0) >= 0 ? 1 : -1;
	const behind = !ahead;
	const ang = behind ? (side > 0 ? 0.5 : Math.PI - 0.5) : side > 0 ? 0 : Math.PI;
	const ex = side > 0 ? cam.W - 34 : 34;
	const ey = Math.min(cam.H * 0.62, cam.horizonY + (behind ? cam.H * 0.12 : 0));
	ctx.save();
	ctx.translate(ex, ey);
	ctx.rotate(ang);
	ctx.fillStyle = pal.beacon;
	ctx.strokeStyle = "rgba(0,0,0,0.4)";
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(18, 0);
	ctx.lineTo(-9, -14);
	ctx.lineTo(-3, 0);
	ctx.lineTo(-9, 14);
	ctx.closePath();
	ctx.fill();
	ctx.stroke();
	ctx.restore();
	const label = `${sim.next + 1} · ${distanceText(Math.hypot(tp.x - p.x, tp.z - p.z))}`;
	ctx.font = "700 12px system-ui, sans-serif";
	ctx.textAlign = side > 0 ? "right" : "left";
	ctx.textBaseline = "middle";
	const w = textWidth(ctx, label) + 12;
	const lx = side > 0 ? ex - 24 : ex + 24;
	ctx.fillStyle = "rgba(20,30,40,0.6)";
	ctx.beginPath();
	ctx.roundRect(side > 0 ? lx - w + 6 : lx - 6, ey - 10, w, 20, 10);
	ctx.fill();
	ctx.fillStyle = "#fff";
	ctx.fillText(label, lx, ey + 0.5);
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
