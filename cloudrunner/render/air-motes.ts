/**
 * Specks of dust in the air around the glider, carried by it: faint and
 * sinking slowly between thermals, cyan streaks rushing up in lift (slope lift
 * on a windward hillside, or a thermal), sliding past with the glider's speed.
 * Render-only state: the flight never reads it, so it cannot change an outcome.
 */
import { type Air, airAt } from "../game/air";
import type { Sim } from "../game/flight";
import { forward } from "../game/flight";
import { surfaceHeight } from "../game/terrain";
import type { Camera } from "./camera";
import { NEAR } from "./camera";
import type { Palette } from "./palette";
import { rgb } from "./palette";

const COUNT = 120;
/** Motes live in a box ahead of the camera: this deep (m), this wide either side, this high either side. */
const DEPTH = 420;
const HALF_WIDTH = 260;
const HALF_HEIGHT = 120;
/** Visual exaggeration of the air's vertical speed, so slow sink still reads as falling. */
const SHOW_SPEED = 2.2;
/** Air rising faster than this (m/s) is drawn as lift. */
const RISING = 0.3;
/** Specks in sinking air are only just visible. */
const SINK_ALPHA = 0.16;

const air: Air = { up: 0, vx: 0, vz: 0 };
const p = [0, 0, 0];

export class AirMotes {
	private readonly x = new Float32Array(COUNT);
	private readonly y = new Float32Array(COUNT);
	private readonly z = new Float32Array(COUNT);
	private readonly up = new Float32Array(COUNT);
	private seeded: Sim | null = null;

	private spawn(i: number, sim: Sim, cam: Camera, ahead: boolean): void {
		const f = forward(sim.plane);
		const fl = Math.hypot(f[0], f[2]) || 1;
		const fx = f[0] / fl, fz = f[2] / fl;
		const d = ahead ? DEPTH * (0.75 + 0.25 * Math.random()) : 30 + DEPTH * Math.random();
		const s = (Math.random() * 2 - 1) * HALF_WIDTH;
		this.x[i] = cam.x + fx * d - fz * s;
		this.z[i] = cam.z + fz * d + fx * s;
		this.y[i] = cam.y + (Math.random() * 2 - 1) * HALF_HEIGHT;
	}

	/** Advance the motes with the air and recycle the ones left behind. */
	update(sim: Sim, cam: Camera, dt: number): void {
		const fresh = this.seeded !== sim;
		this.seeded = sim;
		const step = Math.min(0.1, dt);
		for (let i = 0; i < COUNT; i++) {
			if (fresh) this.spawn(i, sim, cam, false);
			const x = this.x[i] ?? 0, y = this.y[i] ?? 0, z = this.z[i] ?? 0;
			airAt(sim.seed, sim.terr, x, y, z, sim.elapsed, air);
			this.up[i] = air.up;
			if (sim.phase === "flying") {
				this.x[i] = x + air.vx * step;
				this.y[i] = y + air.up * SHOW_SPEED * step;
				this.z[i] = z + air.vz * step;
			}
			cam.point(this.x[i] ?? 0, this.y[i] ?? 0, this.z[i] ?? 0, p);
			const far = Math.hypot((this.x[i] ?? 0) - cam.x, (this.z[i] ?? 0) - cam.z) > DEPTH * 1.2;
			const lost = Math.abs((this.y[i] ?? 0) - cam.y) > HALF_HEIGHT * 1.6;
			const buried = (this.y[i] ?? 0) < surfaceHeight(sim.terrain, this.x[i] ?? 0, this.z[i] ?? 0) + 2;
			if ((p[2] ?? 0) < NEAR || far || lost || buried) this.spawn(i, sim, cam, true);
		}
	}

	/**
	 * In rising air, small cyan chevrons drifting upward (bigger the stronger the lift);
	 * in sinking air, barely visible neutral specks drifting slowly down, so the
	 * open air stays quiet and only lift catches the eye.
	 */
	draw(ctx: CanvasRenderingContext2D, cam: Camera, pal: Palette): void {
		const upCol = rgb(pal.moteUp), downCol = rgb(pal.moteDown);
		ctx.lineCap = "round";
		for (let pass = 0; pass < 2; pass++) {
			const rising = pass === 1;
			ctx.strokeStyle = upCol;
			for (let i = 0; i < COUNT; i++) {
				const up = this.up[i] ?? 0;
				if (rising !== up >= RISING) continue;
				cam.point(this.x[i] ?? 0, this.y[i] ?? 0, this.z[i] ?? 0, p);
				const z = p[2] ?? 0;
				if (z < NEAR * 3) continue;
				const sx = cam.sx(p), sy = cam.sy(p);
				if (sx < 0 || sx > cam.W || sy < 0 || sy > cam.H) continue;
				const s = Math.max(1, Math.min(3, (1.2 * cam.F) / z));
				const depth = Math.min(1, (DEPTH * 1.1 - z) / 120);
				if (rising) {
					const alpha = Math.min(0.85, 0.35 + up * 0.06) * depth;
					if (alpha <= 0.02) continue;
					// A small upward chevron, the same mark as the columns: the air is going up.
					const size = Math.min(9, ((0.8 + up * 0.25) * cam.F) / z);
					ctx.globalAlpha = alpha;
					ctx.lineWidth = Math.max(1, s * 0.8);
					ctx.beginPath();
					ctx.moveTo(sx - size, sy + size * 0.75);
					ctx.lineTo(sx, sy);
					ctx.lineTo(sx + size, sy + size * 0.75);
					ctx.stroke();
				} else {
					const alpha = SINK_ALPHA * depth;
					if (alpha <= 0.02) continue;
					ctx.globalAlpha = alpha;
					ctx.fillStyle = downCol;
					ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
				}
			}
		}
		ctx.globalAlpha = 1;
	}
}
