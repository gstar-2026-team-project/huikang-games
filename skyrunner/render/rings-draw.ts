import { RING_FX_DURATION } from "../game/constants";
import type { Ring } from "../game/course";
import type { Sim } from "../game/flight";
import { idealPath, PATH_BUFFER_LENGTH } from "../game/ideal-path";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import type { Palette } from "./palette";

const SEGMENTS = 24;
const pts = new Float32Array((SEGMENTS + 1) * 3);
const tmp = [0, 0, 0];

export interface RingItem { kind: 1; z: number; ring: Ring; color: string; scale: number; alpha: number }

/** Upcoming rings, plus the ones just passed: green and growing if hit, red and sinking if missed. */
export function queueRings(sim: Sim, cam: Camera, pal: Palette, items: RingItem[]): void {
	const end = Math.min(sim.rings.length, sim.next + 3);
	for (let i = sim.next; i < end; i++) {
		const ring = sim.rings[i];
		if (!ring) continue;
		cam.point(ring.x, ring.y, ring.z, tmp);
		if ((tmp[2] ?? 0) < -ring.r) continue;
		items.push({ kind: 1, z: tmp[2] ?? 0, ring, color: ringColor(pal, ring, i === sim.next), scale: 1, alpha: 1 });
		// The target wears a second, inner ring so it reads as a bullseye.
		if (ring.target) items.push({ kind: 1, z: (tmp[2] ?? 0) - 0.01, ring, color: pal.planeWhite, scale: 0.55, alpha: 1 });
	}
	for (const f of sim.fx) {
		cam.point(f.ring.x, f.ring.y, f.ring.z, tmp);
		const k = f.t / RING_FX_DURATION;
		items.push({
			kind: 1,
			z: tmp[2] ?? 0,
			ring: f.ring,
			color: f.ring.hit ? pal.ringHit : pal.ringMiss,
			scale: f.ring.hit ? 1 + k * 0.6 : 1 - k * 0.3,
			alpha: 1 - k,
		});
	}
}

export function drawRing(ctx: CanvasRenderingContext2D, cam: Camera, it: RingItem): void {
	const r = it.ring;
	const rad = r.r * it.scale;
	const rx = Math.cos(r.yaw), rz = -Math.sin(r.yaw);
	for (let k = 0; k <= SEGMENTS; k++) {
		const a = (k / SEGMENTS) * Math.PI * 2;
		cam.point(r.x + rx * rad * Math.cos(a), r.y + rad * Math.sin(a), r.z + rz * rad * Math.cos(a), pts, k * 3);
	}
	ctx.strokeStyle = it.color;
	ctx.globalAlpha = Math.max(0, it.alpha);
	ctx.lineCap = "round";
	for (let k = 0; k < SEGMENTS; k++) {
		const z0 = pts[k * 3 + 2] ?? 0, z1 = pts[k * 3 + 5] ?? 0;
		if (z0 < NEAR || z1 < NEAR) continue;
		ctx.lineWidth = Math.max(1.5, (3.2 * cam.F) / ((z0 + z1) / 2));
		ctx.beginPath();
		ctx.moveTo(cam.sx(pts, k * 3), cam.sy(pts, k * 3));
		ctx.lineTo(cam.sx(pts, k * 3 + 3), cam.sy(pts, k * 3 + 3));
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

/** Edge arrow toward the next ring when it is off screen. */
export function drawRingArrow(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, pal: Palette): void {
	const r = sim.rings[sim.next];
	if (!r) return;
	cam.point(r.x, r.y, r.z, tmp);
	if ((tmp[2] ?? 0) > NEAR) {
		const X = cam.sx(tmp), Y = cam.sy(tmp);
		if (X > 30 && X < cam.W - 30 && Y > 80 && Y < cam.H - 30) return;
	}
	const ang = Math.atan2(-(tmp[1] ?? 0), tmp[0] ?? 0);
	const R = Math.min(cam.W, cam.H) * 0.32;
	ctx.save();
	ctx.translate(cam.W / 2 + Math.cos(ang) * R, cam.horizonY + Math.sin(ang) * R);
	ctx.rotate(ang);
	ctx.fillStyle = pal.ring;
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

const pathWorld = new Float32Array(PATH_BUFFER_LENGTH);
const pathCam = new Float32Array(PATH_BUFFER_LENGTH);

/** The ideal line through the next rings, as dashes that thin with distance. */
export function drawIdealPath(ctx: CanvasRenderingContext2D, cam: Camera, sim: Sim, pal: Palette): void {
	const count = idealPath(sim.plane, sim.rings, sim.next, pathWorld);
	for (let k = 0; k < count; k++) {
		cam.point(pathWorld[k * 3] ?? 0, pathWorld[k * 3 + 1] ?? 0, pathWorld[k * 3 + 2] ?? 0, pathCam, k * 3);
	}
	ctx.strokeStyle = pal.planeWhite;
	ctx.globalAlpha = 0.8;
	ctx.lineCap = "round";
	// Every other segment, so the line reads as dashes flowing toward the rings.
	for (let k = 1; k + 1 < count; k += 2) {
		const z0 = pathCam[k * 3 + 2] ?? 0, z1 = pathCam[k * 3 + 5] ?? 0;
		if (z0 < NEAR || z1 < NEAR) continue;
		ctx.lineWidth = Math.max(1.5, (1.6 * cam.F) / ((z0 + z1) / 2));
		ctx.beginPath();
		ctx.moveTo(cam.sx(pathCam, k * 3), cam.sy(pathCam, k * 3));
		ctx.lineTo(cam.sx(pathCam, k * 3 + 3), cam.sy(pathCam, k * 3 + 3));
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

export function ringColor(pal: Palette, ring: Ring, next: boolean): string {
	if (ring.target) return next ? pal.ringTarget : pal.ringTargetDim;
	return next ? pal.ring : pal.ringDim;
}
