import type { Sim } from "../game/flight";
import { Camera } from "./camera";
import type { Palette } from "./palette";
import { drawPlane } from "./plane-draw";
import { drawGateLabel, drawIdealPath, drawRing, drawRingArrow, queueRings, type RingItem } from "./rings-draw";
import { type CloudItem, drawCloud, drawSky, queueClouds } from "./sky";
import { drawQuad, type QuadItem, queueTerrain } from "./terrain-draw";

type Item = QuadItem | RingItem | CloudItem;

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

	/** `showPath` overlays the ideal line through the next rings while flying. */
	draw(sim: Sim, pal: Palette, restT: number | null, showPath = false): void {
		const { ctx, cam, items } = this;
		ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
		cam.follow(sim);
		drawSky(ctx, cam, sim, pal);
		items.length = 0;
		queueTerrain(sim, cam, pal, items as QuadItem[]);
		queueRings(sim, cam, pal, items as RingItem[]);
		queueClouds(sim, cam, items as CloudItem[]);
		items.sort((a, b) => b.z - a.z);
		ctx.lineJoin = "round";
		for (const it of items) {
			if (it.kind === 0) {
				ctx.lineWidth = 1;
				drawQuad(ctx, cam, it);
			} else if (it.kind === 1) drawRing(ctx, cam, it);
			else drawCloud(ctx, it, pal);
		}
		if (showPath && sim.phase === "flying") drawIdealPath(ctx, cam, sim, pal);
		drawPlane(ctx, cam, sim, pal, restT);
		if (sim.phase === "flying") {
			drawGateLabel(ctx, cam, sim, pal);
			drawRingArrow(ctx, cam, sim, pal);
		}
	}
}
