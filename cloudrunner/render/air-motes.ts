/**
 * Specks of dust in the air around the glider, carried by it: they sink
 * slowly in the sink between thermals, stream up in lift (slope lift on a
 * windward hillside, or a thermal), and slide past with the glider's speed.
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

	/** Specks with a short trail along the air's vertical motion: warm when rising, cool when sinking. */
	draw(ctx: CanvasRenderingContext2D, cam: Camera, pal: Palette): void {
		const upCol = rgb(pal.moteUp), downCol = rgb(pal.moteDown);
		for (let pass = 0; pass < 2; pass++) {
			ctx.fillStyle = pass === 0 ? downCol : upCol;
			for (let i = 0; i < COUNT; i++) {
				const up = this.up[i] ?? 0;
				if ((pass === 0) !== (up < 0.3)) continue;
				cam.point(this.x[i] ?? 0, this.y[i] ?? 0, this.z[i] ?? 0, p);
				const z = p[2] ?? 0;
				if (z < NEAR * 3) continue;
				const sx = cam.sx(p), sy = cam.sy(p);
				if (sx < 0 || sx > cam.W || sy < 0 || sy > cam.H) continue;
				const s = Math.max(1.2, Math.min(3, (1.2 * cam.F) / z));
				const alpha = Math.min(0.75, 0.3 + Math.abs(up) * 0.08) * Math.min(1, (DEPTH * 1.1 - z) / 120);
				if (alpha <= 0.02) continue;
				ctx.globalAlpha = alpha;
				if (up >= 0.3) {
					// Rising: a small upward chevron.
					ctx.beginPath();
					ctx.moveTo(sx - s, sy + s * 0.9);
					ctx.lineTo(sx, sy - s * 0.6);
					ctx.lineTo(sx + s, sy + s * 0.9);
					ctx.lineTo(sx, sy + s * 0.2);
					ctx.closePath();
					ctx.fill();
				} else {
					// Sinking: a speck with a short trail above it.
					ctx.fillRect(sx - s / 2, sy - s * 2.2, s, s * 2.2);
				}
			}
		}
		ctx.globalAlpha = 1;
	}
}
