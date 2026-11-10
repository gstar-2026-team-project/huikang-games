import { BEST_GLIDE_SPEED, CRASH_DURATION, MAX_SPEED, STALL_SPEED } from "../game/constants";
import { forward, type Sim } from "../game/flight";
import { surfaceHeight } from "../game/terrain";

export const NEAR = 1.5;
const right = [0, 0, 0];
const CHASE_BACK = 28;
const CHASE_UP = 3.6;
/** Share of the glider's pitch the camera follows: the horizon bobs less than the nose. */
const CAMERA_PITCH = 0.6;
/** After touching the ground the camera rises and backs away to show where the flight ended. */
const CRASH_PULL_BACK = 170;
const CRASH_RISE = 60;
/** Height the pulled-back camera keeps above the ground under it, so it never ends inside a hill. */
const CRASH_CLEAR = 45;

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
		// Wide but short windows get a wider view, so the glider stays clear of the variometer below it.
		this.baseF = Math.min(Math.max(w, h * 0.75) * 0.95, h * 1.4);
		this.F = this.baseF * this.zoom;
		this.horizonY = h * 0.44;
	}

	follow(sim: Sim): void {
		const p = sim.plane;
		// Wider view in a fast dive, tighter when slow in a climb.
		const speedFrac = Math.max(0, Math.min(1, (p.v - BEST_GLIDE_SPEED) / (MAX_SPEED - BEST_GLIDE_SPEED)));
		const slowFrac = Math.max(0, Math.min(1, (BEST_GLIDE_SPEED - p.v) / (BEST_GLIDE_SPEED - STALL_SPEED)));
		this.zoom = 1 - 0.2 * speedFrac + 0.06 * slowFrac;
		this.F = this.baseF * this.zoom;
		const f = forward(p);
		const ux = -Math.sin(p.yaw) * Math.sin(p.pitch);
		const uy = Math.cos(p.pitch);
		const uz = -Math.cos(p.yaw) * Math.sin(p.pitch);
		this.x = p.x - f[0] * CHASE_BACK + ux * CHASE_UP;
		this.y = p.y - f[1] * CHASE_BACK + uy * CHASE_UP;
		this.z = p.z - f[2] * CHASE_BACK + uz * CHASE_UP;
		// Landed out: ease from the chase view to a high view looking down on the spot.
		const k = sim.endReason === "ground" ? Math.min(1, sim.crashT / CRASH_DURATION) : 0;
		const out = k * k * (3 - 2 * k);
		if (out > 0) {
			const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw);
			this.x += (p.x - hx * CRASH_PULL_BACK - this.x) * out;
			this.y += (p.y + CRASH_RISE - this.y) * out;
			this.z += (p.z - hz * CRASH_PULL_BACK - this.z) * out;
		}
		const gh = surfaceHeight(sim.terrain, this.x, this.z) + 2 + (CRASH_CLEAR - 2) * out;
		if (this.y < gh) this.y = gh;
		this.cYaw = Math.cos(p.yaw); this.sYaw = Math.sin(p.yaw);
		const chase = Math.max(-0.35, Math.min(0.3, p.pitch * CAMERA_PITCH));
		// Pulled back, the camera tips halfway toward where the glider came down: the spot
		// sits below the result panel and the horizon stays in view above it.
		const lookDown = -0.5 * Math.atan2(this.y - p.y, Math.hypot(p.x - this.x, p.z - this.z) || 1);
		const pitch = chase + (lookDown - chase) * out;
		this.cp = Math.cos(pitch); this.sp = Math.sin(pitch);
		const roll = sim.camRoll * (1 - out);
		this.cr = Math.cos(roll); this.sr = Math.sin(roll);
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
