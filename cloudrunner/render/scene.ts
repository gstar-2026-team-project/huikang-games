import type { Plan } from "../game/autopilot";
import type { Sim } from "../game/flight";
import { type BeaconItem, drawBeacon, drawBeaconArrow, drawIdealPath, queueBeacons } from "./beacon-draw";
import { Camera } from "./camera";
import type { Palette } from "./palette";
import { drawPlane } from "./plane-draw";
import { drawSky } from "./sky";
import { drawQuad, type QuadItem, queueTerrain } from "./terrain-draw";
import { type CloudItem, type ColumnItem, drawCloud, drawColumn, queueThermals } from "./thermals-draw";

type Item = QuadItem | BeaconItem | CloudItem | ColumnItem;

/** Painter's-algorithm renderer for one canvas. */
export class Scene {
	readonly cam = new Camera();
	private readonly items: Item[] = [];
	private ratio = 1;

	constructor(private readonly ctx: CanvasRenderingContext2D) {}

	resize(cssW: number, cssH: number, pixelRatio: number): void {
		this.ratio = pixelRatio;
		const c = this.ctx.canvas;
		c.width = Math.max(1, Math.round(cssW * pixelRatio));
		c.height = Math.max(1, Math.round(cssH * pixelRatio));
		this.cam.resize(cssW, cssH);
	}

	/** `plan` overlays the autopilot's route (the ideal path) while flying. */
	draw(sim: Sim, pal: Palette, restT: number | null, plan: Plan | null = null): void {
		const { ctx, cam, items } = this;
		ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
		cam.follow(sim);
		drawSky(ctx, cam, sim, pal);
		items.length = 0;
		queueTerrain(sim, cam, pal, items as QuadItem[]);
		queueBeacons(sim, cam, pal, items as BeaconItem[]);
		queueThermals(sim, cam, items as (CloudItem | ColumnItem)[]);
		items.sort((a, b) => b.z - a.z);
		ctx.lineJoin = "round";
		for (const it of items) {
			if (it.kind === 0) drawQuad(ctx, cam, it);
			else if (it.kind === 1) drawBeacon(ctx, cam, sim, it);
			else if (it.kind === 2) drawCloud(ctx, it, pal);
			else drawColumn(ctx, cam, sim, it, pal);
		}
		if (plan && sim.phase === "flying") drawIdealPath(ctx, cam, sim, plan, pal);
		drawPlane(ctx, cam, sim, pal, restT);
		if (sim.phase === "flying") drawBeaconArrow(ctx, cam, sim, pal);
	}
}
