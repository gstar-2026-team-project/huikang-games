import { CRASH_DURATION, CRUISE_SPEED, FULL_SPEED, IDLE_SPEED } from "../game/constants";
import type { Sim } from "../game/flight";
import { surfaceHeight } from "../game/terrain";

export const NEAR = 1.5;
const CHASE_BACK = 28;
const CHASE_UP = 6;
/** After a crash the view eases up to this pitch (rad), so the end screen shows the scene, not the ground. */
const CRASH_VIEW_PITCH = -0.2;
/** …and rises this far (m), clear of the slope the plane went into. */
const CRASH_RISE = 24;
const right = [0, 0, 0];

/** Chase camera behind the plane, and the projection onto the screen. */
export class Camera {
	x = 0; y = 0; z = 0;
	private cYaw = 1; private sYaw = 0;
	private cp = 1; private sp = 0;
	private cr = 1; private sr = 0;
	/** viewport in CSS px and focal length */
	W = 1; H = 1; F = 1;
	private baseF = 1;
	private zoom = 1;
	horizonY = 0;
	/** How far the horizon is tilted on screen (rad): billboards turn with it. */
	screenRoll = 0;

	resize(w: number, h: number): void {
		this.W = w;
		this.H = h;
		this.baseF = Math.max(w, h * 0.75) * 0.95;
		this.F = this.baseF * this.zoom;
		this.horizonY = h * 0.45;
	}

	follow(sim: Sim): void {
		const p = sim.plane;
		// Wider view at speed, tighter when slow: the rush of a fast plane.
		const speedFrac = Math.max(0, Math.min(1, (p.v - CRUISE_SPEED) / (FULL_SPEED - CRUISE_SPEED)));
		const slowFrac = Math.max(0, Math.min(1, (CRUISE_SPEED - p.v) / (CRUISE_SPEED - IDLE_SPEED)));
		this.zoom = 1 - 0.2 * speedFrac + 0.08 * slowFrac;
		this.F = this.baseF * this.zoom;
		// A crash freezes the plane in its dive; the view pulls up and back from it.
		let pitch = p.pitch, rise = 0;
		if (sim.phase !== "flying") {
			let t = Math.min(1, sim.crashT / (CRASH_DURATION * 0.6));
			t = t * t * (3 - 2 * t);
			if (pitch < CRASH_VIEW_PITCH) pitch += (CRASH_VIEW_PITCH - pitch) * t;
			rise = CRASH_RISE * t;
		}
		const cpch = Math.cos(pitch);
		const f = [Math.sin(p.yaw) * cpch, Math.sin(pitch), Math.cos(p.yaw) * cpch] as const;
		const ux = -Math.sin(p.yaw) * Math.sin(pitch);
		const uy = Math.cos(pitch);
		const uz = -Math.cos(p.yaw) * Math.sin(pitch);
		this.x = p.x - f[0] * CHASE_BACK + ux * CHASE_UP;
		this.y = p.y - f[1] * CHASE_BACK + uy * CHASE_UP + rise;
		this.z = p.z - f[2] * CHASE_BACK + uz * CHASE_UP;
		const gh = surfaceHeight(sim.terrain, this.x, this.z) + 2;
		if (this.y < gh) this.y = gh;
		this.cYaw = Math.cos(p.yaw); this.sYaw = Math.sin(p.yaw);
		this.cp = Math.cos(pitch); this.sp = Math.sin(pitch);
		this.cr = Math.cos(sim.camRoll); this.sr = Math.sin(sim.camRoll);
		this.dir(Math.cos(p.yaw), 0, -Math.sin(p.yaw), right);
		this.screenRoll = Math.atan2(-(right[1] ?? 0), right[0] ?? 1);
	}

	/** Rotate a world-space direction into camera space. */
	dir(x: number, y: number, z: number, out: Float32Array | number[], o = 0): void {
		const x1 = this.cYaw * x - this.sYaw * z;
		const z1 = this.sYaw * x + this.cYaw * z;
		const y2 = this.cp * y - this.sp * z1;
		const z2 = this.sp * y + this.cp * z1;
		out[o] = this.cr * x1 - this.sr * y2;
		out[o + 1] = this.sr * x1 + this.cr * y2;
		out[o + 2] = z2;
	}

	/** World point to camera space. */
	point(x: number, y: number, z: number, out: Float32Array | number[], o = 0): void {
		this.dir(x - this.x, y - this.y, z - this.z, out, o);
	}

	sx(c: ArrayLike<number>, o = 0): number {
		return this.W / 2 + ((c[o] ?? 0) / (c[o + 2] ?? 1)) * this.F;
	}
	sy(c: ArrayLike<number>, o = 0): number {
		return this.horizonY - ((c[o + 1] ?? 0) / (c[o + 2] ?? 1)) * this.F;
	}
}
