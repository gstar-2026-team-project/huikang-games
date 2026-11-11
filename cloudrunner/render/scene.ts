import type { Plan } from "../game/autopilot";
import type { Sim } from "../game/flight";
import { AirMotes } from "./air-motes";
import { type BeaconItem, drawBeacon, drawBeaconMarkers, drawIdealPath, queueBeacons } from "./beacon-draw";
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
	private readonly motes = new AirMotes();
	private readonly items: Item[] = [];
	private ratio = 1;
	/** Render time (s): animates the lift streaks on every screen, the menu included. */
	private clock = 0;

	constructor(private readonly ctx: CanvasRenderingContext2D) {}

	resize(cssW: number, cssH: number, pixelRatio: number): void {
		this.ratio = pixelRatio;
		const c = this.ctx.canvas;
		c.width = Math.max(1, Math.round(cssW * pixelRatio));
		c.height = Math.max(1, Math.round(cssH * pixelRatio));
		this.cam.resize(cssW, cssH);
	}

	/** `plan` overlays the autopilot's route (the ideal path) while flying. */
	draw(sim: Sim, pal: Palette, restT: number | null, plan: Plan | null = null, dt = 0): void {
		const { ctx, cam, items } = this;
		ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
		this.clock += Math.min(0.1, Math.max(0, dt));
		cam.follow(sim);
		drawSky(ctx, cam, sim, pal);
		items.length = 0;
		queueTerrain(sim, cam, pal, items as QuadItem[]);
		queueBeacons(sim, cam, items as BeaconItem[]);
		queueThermals(sim, cam, items as (CloudItem | ColumnItem)[]);
		items.sort((a, b) => b.z - a.z);
		ctx.lineJoin = "round";
		for (const it of items) {
			if (it.kind === 0) drawQuad(ctx, cam, it);
			else if (it.kind === 1) drawBeacon(ctx, cam, sim, it, pal);
			else if (it.kind === 2) drawCloud(ctx, cam, it, pal);
			else drawColumn(ctx, cam, sim, it, pal, this.clock);
		}
		this.motes.update(sim, cam, dt);
		this.motes.draw(ctx, cam, pal);
		if (plan && sim.phase === "flying") drawIdealPath(ctx, cam, sim, plan, pal);
		drawBeaconMarkers(ctx, cam, sim, pal);
		drawPlane(ctx, cam, sim, pal, restT);
	}
}
