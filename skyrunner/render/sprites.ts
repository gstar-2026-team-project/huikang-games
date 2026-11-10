/**
 * Soft shapes baked once into small offscreen canvases (per palette) and then
 * drawn with one drawImage each: cumulus clouds, the sky gradient and round
 * glows. Gradients and many overlapping arcs cost nothing per frame this way.
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

/** Number of cloud shapes; each cloud picks one by its hash. */
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
			const dome = Math.sin(f * Math.PI);
			const rad = CLOUD_H * (0.14 + 0.18 * dome + r() * 0.07);
			const y = base - rad * (0.35 + 0.65 * dome * (0.6 + 0.5 * r()));
			puffs.push([x, y, rad]);
		}
		const shade = pal.cloudShade;
		const lit = pal.cloud;
		const pass = (fill: string | CanvasGradient, dx: number, dy: number, k: number) => {
			g.fillStyle = fill;
			for (const [x, y, rad] of puffs) {
				g.beginPath();
				g.arc(x + rad * dx, y + rad * dy, rad * k, 0, 6.283);
				g.fill();
			}
		};
		// Everything is clipped to above the base, which leaves it flat.
		g.save();
		g.beginPath();
		g.rect(0, 0, CLOUD_W, base);
		g.clip();
		pass(rgba(mix(shade, lit, 0.25), 1), 0, 0, 1);
		pass(rgba(mix(lit, shade, 0.12), 1), -0.06, -0.14, 0.9);
		pass(rgba(lit, 1), -0.14, -0.3, 0.62);
		// The shaded base: the puffs again, inside a band just above it, in a gradient into shade.
		const top = base - CLOUD_H * 0.16;
		const baseGrad = g.createLinearGradient(0, top, 0, base);
		baseGrad.addColorStop(0, rgba(shade, 0));
		baseGrad.addColorStop(1, rgba(shade, 0.85));
		g.beginPath();
		g.rect(0, top, CLOUD_W, base - top);
		g.clip();
		pass(baseGrad, 0, 0, 1);
		g.restore();
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

/** A ball of fire for the crash: white-hot core, orange body, soft edge. */
export function fireSprite(pal: Palette): Sprite {
	return cached(pal, "fire", () => {
		const S = 96;
		const { c, g } = canvas(S, S);
		if (!g) return c;
		const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
		grad.addColorStop(0, "rgba(255,248,210,1)");
		grad.addColorStop(0.25, "rgba(255,196,80,1)");
		grad.addColorStop(0.6, "rgba(240,96,30,0.75)");
		grad.addColorStop(1, "rgba(200,60,20,0)");
		g.fillStyle = grad;
		g.fillRect(0, 0, S, S);
		return c;
	});
}

/** A puff of smoke, darker underneath. */
export function smokeSprite(pal: Palette): Sprite {
	return cached(pal, "smoke", () => {
		const S = 96;
		const { c, g } = canvas(S, S);
		if (!g) return c;
		const grad = g.createRadialGradient(S * 0.42, S * 0.38, 0, S / 2, S / 2, S / 2);
		grad.addColorStop(0, "rgba(120,118,116,0.95)");
		grad.addColorStop(0.55, "rgba(72,70,70,0.85)");
		grad.addColorStop(1, "rgba(50,48,48,0)");
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
