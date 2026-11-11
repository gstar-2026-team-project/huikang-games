/**
 * Soft shapes baked once into small offscreen canvases (per palette) and then
 * drawn with one drawImage each: cumulus clouds, the rising-air column and a
 * round glow. Gradients and many overlapping arcs
 * cost nothing per frame this way.
 */
import { mix, type Palette, type RGB, rgba } from "./palette";

type Sprite = HTMLCanvasElement;
const cache = new WeakMap<Palette, Map<string, Sprite>>();

function canvas(w: number, h: number): { c: Sprite; g: CanvasRenderingContext2D | null } {
	const c = document.createElement("canvas");
	c.width = w;
	c.height = h;
	return { c, g: c.getContext("2d") };
}

function cached(pal: Palette, key: string, make: () => Sprite): Sprite {
	let m = cache.get(pal);
	if (!m) {
		m = new Map();
		cache.set(pal, m);
	}
	let s = m.get(key);
	if (!s) {
		s = make();
		m.set(key, s);
	}
	return s;
}

/** Number of cloud shapes; each thermal picks one by its id. */
export const CLOUD_VARIANTS = 4;
/** Cloud sprite size in px; the flat base sits at CLOUD_BASE_Y of its height. */
export const CLOUD_W = 320;
export const CLOUD_H = 200;
export const CLOUD_BASE_Y = 0.8;

function rand(seed: number): () => number {
	let a = seed | 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * A cumulus: a heap of round puffs, lit from above, with a flat grey base.
 * Drawn shade-first and then lit puffs nudged up toward the sun, so each puff
 * keeps a shadowed underside.
 */
export function cloudSprite(pal: Palette, variant: number): Sprite {
	return cached(pal, `cloud${variant}`, () => {
		const { c, g } = canvas(CLOUD_W, CLOUD_H);
		if (!g) return c;
		const r = rand(variant * 7919 + 13);
		const base = CLOUD_H * CLOUD_BASE_Y;
		const puffs: [number, number, number][] = [];
		const n = 9 + Math.floor(r() * 4);
		for (let i = 0; i < n; i++) {
			const f = (i + 0.5) / n;
			const x = CLOUD_W * (0.14 + 0.72 * f + (r() - 0.5) * 0.05);
			// Taller in the middle: a dome.
			const dome = Math.sin(f * Math.PI);
			const rad = CLOUD_H * (0.16 + 0.2 * dome + r() * 0.07);
			const y = base - rad * (0.35 + 0.65 * dome * (0.6 + 0.5 * r()));
			puffs.push([x, y, rad]);
		}
		const shade = pal.cloudShade;
		const lit = pal.cloud;
		for (const [x, y, rad] of puffs) {
			g.fillStyle = rgba(mix(shade, lit, 0.25), 1);
			g.beginPath();
			g.arc(x, y, rad, 0, 6.283);
			g.fill();
		}
		// Lit tops: each puff again, nudged toward the sun, so its underside stays in shade.
		for (const [x, y, rad] of puffs) {
			g.fillStyle = rgba(mix(lit, shade, 0.12), 1);
			g.beginPath();
			g.arc(x - rad * 0.06, y - rad * 0.14, rad * 0.9, 0, 6.283);
			g.fill();
		}
		for (const [x, y, rad] of puffs) {
			g.fillStyle = rgba(lit, 1);
			g.beginPath();
			g.arc(x - rad * 0.14, y - rad * 0.3, rad * 0.62, 0, 6.283);
			g.fill();
		}
		// The flat, shaded base, where the rising air condenses.
		const baseGrad = g.createLinearGradient(0, base - CLOUD_H * 0.16, 0, base);
		baseGrad.addColorStop(0, rgba(shade, 0));
		baseGrad.addColorStop(1, rgba(shade, 0.85));
		g.globalCompositeOperation = "source-atop";
		g.fillStyle = baseGrad;
		g.fillRect(0, base - CLOUD_H * 0.16, CLOUD_W, CLOUD_H * 0.16);
		g.globalCompositeOperation = "destination-out";
		g.fillRect(0, base, CLOUD_W, CLOUD_H - base);
		g.globalCompositeOperation = "source-over";
		return c;
	});
}

/**
 * The rising-air column: a cool cyan band, white along its core, with soft
 * upward chevrons so even a still frame reads as air going up. The band and
 * the chevrons are separate sprites: close up, the chevrons fade out. It runs from
 * the ground (bottom) into the cloud base (top), where it is brightest.
 */
export function columnSprite(pal: Palette, chevrons: boolean): Sprite {
	return cached(pal, chevrons ? "columnUp" : "column", () => {
		const W = 96, H = 256;
		const { c, g } = canvas(W, H);
		if (!g) return c;
		const across = g.createLinearGradient(0, 0, W, 0);
		across.addColorStop(0, rgba(pal.lift, 0));
		across.addColorStop(0.18, rgba(pal.lift, 0.35));
		across.addColorStop(0.5, rgba(mix(pal.lift, pal.liftCore, 0.7), 0.8));
		across.addColorStop(0.82, rgba(pal.lift, 0.35));
		across.addColorStop(1, rgba(pal.lift, 0));
		if (!chevrons) {
			g.fillStyle = across;
			g.fillRect(0, 0, W, H);
		}
		// Soft upward chevrons along the core: even a still frame says "this air goes up".
		g.strokeStyle = rgba(pal.liftCore, 0.6);
		g.lineCap = "round";
		g.lineJoin = "round";
		g.lineWidth = 5;
		for (let i = 0; i < (chevrons ? 4 : 0); i++) {
			const y = H * (0.22 + 0.2 * i);
			g.beginPath();
			g.moveTo(W * 0.3, y + W * 0.16);
			g.lineTo(W * 0.5, y);
			g.lineTo(W * 0.7, y + W * 0.16);
			g.stroke();
		}
		const along = g.createLinearGradient(0, 0, 0, H);
		along.addColorStop(0, "rgba(0,0,0,0.95)");
		along.addColorStop(0.1, "rgba(0,0,0,1)");
		along.addColorStop(0.85, "rgba(0,0,0,0.8)");
		along.addColorStop(1, "rgba(0,0,0,0.15)");
		g.globalCompositeOperation = "destination-in";
		g.fillStyle = along;
		g.fillRect(0, 0, W, H);
		g.globalCompositeOperation = "source-over";
		return c;
	});
}

/** A round soft glow of one colour. */
export function glowSprite(pal: Palette, color: RGB, key: string): Sprite {
	return cached(pal, `glow${key}`, () => {
		const S = 128;
		const { c, g } = canvas(S, S);
		if (!g) return c;
		const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
		grad.addColorStop(0, rgba(color, 1));
		grad.addColorStop(0.18, rgba(color, 0.9));
		grad.addColorStop(0.4, rgba(color, 0.3));
		grad.addColorStop(1, rgba(color, 0));
		g.fillStyle = grad;
		g.fillRect(0, 0, S, S);
		return c;
	});
}

/** The sky from zenith (top) to horizon (bottom), as a 1-px-wide strip to stretch. */
export function skySprite(pal: Palette): Sprite {
	return cached(pal, "sky", () => {
		const H = 256;
		const { c, g } = canvas(1, H);
		if (!g) return c;
		const grad = g.createLinearGradient(0, 0, 0, H);
		grad.addColorStop(0, rgba(pal.skyTop, 1));
		grad.addColorStop(0.55, rgba(pal.skyMid, 1));
		grad.addColorStop(0.9, rgba(pal.skyLow, 1));
		grad.addColorStop(1, rgba(pal.haze, 1));
		g.fillStyle = grad;
		g.fillRect(0, 0, 1, H);
		return c;
	});
}
