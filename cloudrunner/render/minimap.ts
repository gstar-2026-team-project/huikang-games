import type { Plan } from "../game/autopilot";
import type { Sim } from "../game/flight";
import { latticeHeight, TERRAIN_CELL } from "../game/terrain";
import { THERMAL_STRENGTH_MIN, THERMAL_STRENGTH_SPREAD, thermalsNear } from "../game/thermals";
import { mix, type Palette, type RGB, rgba } from "./palette";

/** World metres from the glider to the map's rim. */
const RANGE = 1300;
/** Baked terrain: BAKE_CELLS² samples covering BAKE_SPAN metres, re-baked when the glider strays. */
const BAKE_CELLS = 56;
const BAKE_SPAN = BAKE_CELLS * TERRAIN_CELL;
const REBAKE_DISTANCE = 900;
const TURNPOINTS_SHOWN = 4;

function groundColor(pal: Palette, h: number, snow: number): RGB {
	if (h <= 0) return pal.water;
	if (h < 70) return mix(pal.low, pal.mid, h / 70);
	if (h < snow) return mix(pal.mid, pal.high, Math.min(1, (h - 70) / 160));
	return mix(pal.high, pal.snow, Math.min(1, (h - snow) / 60));
}

/**
 * Heading-up map of the valley around the glider: terrain, the live thermals,
 * the next turnpoints, the route through them and a north marker. Drawn on its
 * own small canvas.
 */
export class Minimap {
	private readonly ctx: CanvasRenderingContext2D | null;
	private readonly bake = document.createElement("canvas");
	private bakeKey = "";
	private bakeX = 0;
	private bakeZ = 0;
	private size = 1;
	private ratio = 1;

	constructor(private readonly canvas: HTMLCanvasElement) {
		this.ctx = canvas.getContext("2d");
		this.bake.width = BAKE_CELLS;
		this.bake.height = BAKE_CELLS;
	}

	resize(pixelRatio: number): void {
		this.size = this.canvas.clientWidth || 0;
		this.ratio = pixelRatio;
		this.canvas.width = Math.max(1, Math.round(this.size * pixelRatio));
		this.canvas.height = this.canvas.width;
	}

	private rebake(sim: Sim, pal: Palette, scheme: string): void {
		const p = sim.plane;
		const key = `${sim.seed}|${scheme}`;
		if (key === this.bakeKey && Math.hypot(p.x - this.bakeX, p.z - this.bakeZ) < REBAKE_DISTANCE) return;
		const bctx = this.bake.getContext("2d");
		if (!bctx) return;
		this.bakeKey = key;
		// One pixel per terrain lattice point, so the bake reuses the cached heights.
		const gx0 = Math.floor(p.x / TERRAIN_CELL) - BAKE_CELLS / 2;
		const gz0 = Math.floor(p.z / TERRAIN_CELL) - BAKE_CELLS / 2;
		this.bakeX = (gx0 - 0.5) * TERRAIN_CELL + BAKE_SPAN / 2;
		this.bakeZ = (gz0 - 0.5) * TERRAIN_CELL + BAKE_SPAN / 2;
		const img = bctx.createImageData(BAKE_CELLS, BAKE_CELLS);
		for (let j = 0; j < BAKE_CELLS; j++) {
			for (let i = 0; i < BAKE_CELLS; i++) {
				const h = latticeHeight(sim.terrain, gx0 + i, gz0 + j);
				// Simple slope shading so hills read at a glance.
				const dh = latticeHeight(sim.terrain, gx0 + i + 1, gz0 + j + 1) - h;
				const lit = Math.max(0.7, Math.min(1.25, 1 - dh / 120));
				const c = groundColor(pal, h, sim.terrain.snowLine);
				const o = (j * BAKE_CELLS + i) * 4;
				img.data[o] = Math.min(255, c[0] * lit);
				img.data[o + 1] = Math.min(255, c[1] * lit);
				img.data[o + 2] = Math.min(255, c[2] * lit);
				img.data[o + 3] = 255;
			}
		}
		bctx.putImageData(img, 0, 0);
	}

	/** `plan` adds the autopilot's route: to the thermal it would use, then on to the turnpoint. */
	draw(sim: Sim, pal: Palette, scheme: string, plan: Plan | null = null): void {
		const ctx = this.ctx;
		if (this.canvas.clientWidth !== this.size) this.resize(this.ratio);
		const S = this.size;
		if (!ctx || S <= 0) return;
		this.rebake(sim, pal, scheme);
		const p = sim.plane;
		const R = S / 2;
		const k = (R - 3) / RANGE; // px per metre
		const cos = Math.cos(p.yaw), sin = Math.sin(p.yaw);
		// World delta (dx, dz) to map px: forward is up, right is right.
		const toMap = (dx: number, dz: number): [number, number] => [k * (dx * cos - dz * sin), -k * (dx * sin + dz * cos)];

		ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
		ctx.clearRect(0, 0, S, S);
		ctx.save();
		ctx.beginPath();
		ctx.arc(R, R, R - 1, 0, 6.283);
		ctx.clip();
		// Terrain, rotated with the glider.
		ctx.save();
		ctx.translate(R, R);
		ctx.transform(k * cos, -k * sin, -k * sin, -k * cos, 0, 0);
		ctx.imageSmoothingEnabled = true;
		ctx.drawImage(this.bake, this.bakeX - BAKE_SPAN / 2 - p.x, this.bakeZ - BAKE_SPAN / 2 - p.z, BAKE_SPAN, BAKE_SPAN);
		ctx.restore();

		ctx.translate(R, R);
		// Live thermals: soft discs sized by radius, pale when weak and orange when strong, thinning as they die.
		for (const th of thermalsNear(sim.seed, p.x, p.z, sim.elapsed, 2)) {
			const [x, y] = toMap(th.x - p.x, th.z - p.z);
			const rad = th.radius * k;
			if (Math.hypot(x, y) > R + rad) continue;
			const col = mix(pal.liftWeak, pal.liftStrong, Math.max(0, Math.min(1, (th.peak - THERMAL_STRENGTH_MIN) / THERMAL_STRENGTH_SPREAD)));
			ctx.fillStyle = rgba(col, 0.38 * th.life);
			ctx.beginPath();
			ctx.arc(x, y, rad, 0, 6.283);
			ctx.fill();
			ctx.fillStyle = rgba(col, 0.9 * th.life);
			ctx.beginPath();
			ctx.arc(x, y, Math.max(1.5, rad * 0.4), 0, 6.283);
			ctx.fill();
		}

		// Route: glider → next turnpoints, dotted. With a plan, the first leg bends through its thermal.
		const end = Math.min(sim.turnpoints.length, sim.next + TURNPOINTS_SHOWN);
		ctx.strokeStyle = "rgba(255,255,255,0.85)";
		ctx.lineWidth = plan ? 2 : 1.5;
		ctx.setLineDash([3, 3]);
		ctx.beginPath();
		ctx.moveTo(0, 0);
		if (plan?.thermal) {
			const [x, y] = toMap(plan.thermal.x - p.x, plan.thermal.z - p.z);
			ctx.lineTo(x, y);
		}
		for (let i = sim.next; i < end; i++) {
			const tp = sim.turnpoints[i];
			if (!tp) continue;
			const [x, y] = toMap(tp.x - p.x, tp.z - p.z);
			ctx.lineTo(x, y);
		}
		ctx.stroke();
		ctx.setLineDash([]);

		// Turnpoints, farthest first; the next one is big and gold, pinned to the rim if out of range.
		for (let i = end - 1; i >= sim.next; i--) {
			const tp = sim.turnpoints[i];
			if (!tp) continue;
			let [x, y] = toMap(tp.x - p.x, tp.z - p.z);
			const d = Math.hypot(x, y);
			const primary = i === sim.next;
			if (d > R - 7) {
				if (!primary) continue;
				x *= (R - 7) / d;
				y *= (R - 7) / d;
			}
			ctx.fillStyle = primary ? pal.beacon : pal.beaconDim;
			ctx.strokeStyle = "rgba(0,0,0,0.45)";
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(x, y, primary ? 5 : 3.5, 0, 6.283);
			ctx.fill();
			ctx.stroke();
		}

		// The glider, always at the centre pointing up.
		ctx.fillStyle = pal.planeRed;
		ctx.strokeStyle = "#fff";
		ctx.lineWidth = 1.2;
		ctx.beginPath();
		ctx.moveTo(0, -7);
		ctx.lineTo(5, 5);
		ctx.lineTo(0, 2.5);
		ctx.lineTo(-5, 5);
		ctx.closePath();
		ctx.fill();
		ctx.stroke();
		ctx.restore();

		// Rim and a north marker that swings as you turn.
		ctx.strokeStyle = "rgba(255,255,255,0.9)";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(R, R, R - 1, 0, 6.283);
		ctx.stroke();
		const [nx, ny] = toMap(0, 1);
		const nl = Math.hypot(nx, ny) || 1;
		const tx = R + (nx / nl) * (R - 9), ty = R + (ny / nl) * (R - 9);
		ctx.fillStyle = "rgba(0,0,0,0.55)";
		ctx.beginPath();
		ctx.arc(tx, ty, 7, 0, 6.283);
		ctx.fill();
		ctx.fillStyle = "#fff";
		ctx.font = "700 9px system-ui, sans-serif";
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillText("N", tx, ty + 0.5);
	}
}
