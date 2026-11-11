import type { Plan } from "../game/autopilot";
import { TURNPOINT_FX_DURATION } from "../game/constants";
import type { Sim } from "../game/flight";
import { idealPath, PATH_BUFFER_LENGTH } from "../game/ideal-path";
import type { Turnpoint } from "../game/task";
import { surfaceHeight } from "../game/terrain";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import { type Palette, rgba } from "./palette";

const SEGMENTS = 28;
const pts = new Float32Array((SEGMENTS + 1) * 3);
const tmp = [0, 0, 0];
const top = [0, 0, 0];
/** Beacons drawn past the next one. */
const BEACONS_SHOWN = 3;
/**
 * The next beacon's mast stands at least this high above the ground (m), and
 * always reaches a little above the glider, so its board is at eye level
 * however high you fly. Later beacons are short, thin and faint.
 */
const MAST_HEIGHT = 260;
const MAST_OVER_GLIDER = 30;
/** Roughly how tall each red or white band is (m). */
const BAND_HEIGHT = 36;
/** Mast width (m), and the narrowest the next one is drawn (px) so it still shows from far off. */
const MAST_WIDTH = 16;
const MAST_MIN_PX = 4;
const MAST_MAX_PX = 30;
/** The numbered board on top (m wide). */
const BOARD_WIDTH = 90;
/** The next beacon's board (with its distance tag) never rises above this (CSS px from the top): the HUD and chips live there. */
const BOARD_TOP_CLEAR = 128;

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

/** Upcoming beacons, plus the one just reached: green and widening as it fades. */
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

/** Height (m) of the top of a beacon's mast standing on ground at `ground`. */
function mastTopY(sim: Sim, ground: number, next: boolean): number {
	return next ? Math.max(ground + MAST_HEIGHT, sim.plane.y + MAST_OVER_GLIDER) : ground + MAST_HEIGHT * 0.6;
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
 * A beacon: a tall red-and-white striped mast standing in a red ring on the
 * ground that marks how close counts. The next beacon is bright; later ones
 * are dim. One just reached turns green and its ring widens as it fades.
 */
export function drawBeacon(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, it: BeaconItem, pal: Palette): void {
	const tp = it.tp;
	const ground = surfaceHeight(sim.terrain, tp.x, tp.z);
	const hit = it.fx !== null;
	const k = it.fx ?? 0;
	const col = hit ? pal.beaconHitRgb : pal.beaconRgb;
	const strong = it.next ? 1 : 0.4;
	const fade = hit ? 1 - k : 1;
	groundRing(ctx, cam, tp, ground + 3, tp.r * (1 + k * 0.8), rgba(col, 0.22 * strong * fade), rgba(col, 0.95 * strong * fade));
	cam.point(tp.x, ground, tp.z, tmp);
	// A beacon just reached keeps only its widening green ring: you are right over it.
	if (hit) return;
	const mastTop = mastTopY(sim, ground, it.next);
	cam.point(tp.x, mastTop, tp.z, top);
	if ((tmp[2] ?? 0) <= NEAR || (top[2] ?? 0) <= NEAR) return;
	const bx = cam.sx(tmp), by = cam.sy(tmp), tx = cam.sx(top), ty = cam.sy(top);
	const len = Math.hypot(tx - bx, ty - by);
	if (len < 2) return;
	const w = it.next ? Math.max(MAST_MIN_PX, Math.min(MAST_MAX_PX, (MAST_WIDTH * cam.F) / it.z)) : Math.max(1.5, (MAST_WIDTH * 0.6 * cam.F) / it.z);
	ctx.save();
	ctx.globalAlpha = (it.next ? 1 : 0.35) * fade;
	ctx.translate(bx, by);
	ctx.rotate(Math.atan2(tx - bx, -(ty - by)));
	// A dark edge so the white bands show against pale sky and snow.
	ctx.fillStyle = "rgba(20,24,30,0.45)";
	ctx.fillRect(-w / 2 - 1, -len - 1, w + 2, len + 1);
	const bands = Math.max(6, 2 * Math.round((mastTop - ground) / (2 * BAND_HEIGHT)));
	const band = len / bands;
	for (let i = 0; i < bands; i++) {
		ctx.fillStyle = i % 2 === 0 ? rgba(col, 1) : rgba(pal.mast, 1);
		ctx.fillRect(-w / 2, -(i + 1) * band, w, band + 0.5);
	}
	ctx.restore();
}

/** The numbered boards at the mast tops, drawn over the scene so a hill never hides the next one. */
export function drawBeaconMarkers(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, pal: Palette): void {
	const end = Math.min(sim.turnpoints.length, sim.next + BEACONS_SHOWN);
	for (let i = end - 1; i >= sim.next; i--) {
		const tp = sim.turnpoints[i];
		if (tp) drawBoard(ctx, cam, sim, tp, i, i === sim.next, pal);
	}
}

/**
 * A numbered board on top of the mast, facing the camera: big and red for the
 * next beacon with its distance under it, small and grey for later ones.
 */
function drawBoard(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, tp: Turnpoint, index: number, next: boolean, pal: Palette): void {
	const p = sim.plane;
	const ground = surfaceHeight(sim.terrain, tp.x, tp.z);
	cam.point(tp.x, mastTopY(sim, ground, next), tp.z, tmp);
	const z = tmp[2] ?? 0;
	if (z < NEAR * 10) return;
	const x = cam.sx(tmp), y0 = cam.sy(tmp);
	const bw = next ? Math.max(40, Math.min(84, (BOARD_WIDTH * cam.F) / z)) : Math.max(20, Math.min(40, (BOARD_WIDTH * 0.7 * cam.F) / z));
	const bh = bw * 0.72;
	// The board sits on the mast top; close by, the next one slides down the mast to stay clear of the HUD.
	const y = next ? Math.max(y0 - bh / 2, BOARD_TOP_CLEAR + bh / 2) : y0 - bh / 2;
	if (x < -bw || x > cam.W + bw || y < -bh || y > cam.H + bh) return;
	ctx.globalAlpha = next ? 1 : 0.45;
	ctx.fillStyle = "rgba(10,14,20,0.35)";
	ctx.beginPath();
	ctx.roundRect(x - bw / 2 + 2, y - bh / 2 + 3, bw, bh, 6);
	ctx.fill();
	ctx.fillStyle = next ? pal.beacon : "rgba(60,64,70,0.9)";
	ctx.strokeStyle = next ? "#fff" : pal.beacon;
	ctx.lineWidth = next ? 3 : 2;
	ctx.beginPath();
	ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 6);
	ctx.fill();
	ctx.stroke();
	ctx.fillStyle = "#fff";
	ctx.font = `800 ${Math.round(bh * 0.66)}px system-ui, sans-serif`;
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(String(index + 1), x, y + 1);
	if (next) {
		const label = distanceText(Math.hypot(tp.x - p.x, tp.z - p.z));
		ctx.font = "700 13px system-ui, sans-serif";
		const w = textWidth(ctx, label) + 12;
		ctx.fillStyle = "rgba(20,30,40,0.7)";
		ctx.beginPath();
		ctx.roundRect(x - w / 2, y - bh / 2 - 24, w, 19, 9);
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.fillText(label, x, y - bh / 2 - 14);
	}
	ctx.globalAlpha = 1;
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
