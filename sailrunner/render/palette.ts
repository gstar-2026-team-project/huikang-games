import { Color } from "three";

/** World colours, read from CSS tokens; dark mode swaps in the same bay at blue hour. */
export interface PaletteColors {
	/** Horizon haze away from the sun; also the fog the far water fades into. */
	sky: Color;
	skyTop: Color;
	/** Warm horizon band under the sun. */
	skyGlow: Color;
	sun: Color;
	sunGlow: Color;
	/** Sunlit cloud tops and their cool shaded undersides. */
	cloud: Color;
	cloudShade: Color;
	scrub: Color;
	rock: Color;
	sand: Color;
	house: Color;
	roof: Color;
	dome: Color;
	/** Lit windows and the lighthouse lamp (blue hour). */
	lamp: Color;
	lightKey: Color;
	lightFill: Color;
	/** Warm edge light on the boat from the low sun. */
	rim: Color;
	sea: Color;
	seaDeep: Color;
	seaShallow: Color;
	shadow: Color;
	fleck: Color;
	hull: Color;
	stripe: Color;
	spar: Color;
	deck: Color;
	plank: Color;
	glass: Color;
	crew: Color;
	sail: Color;
	accent: Color;
	buoy: Color;
	buoyNext: Color;
	buoyDone: Color;
	finish: Color;
	wake: Color;
}

export interface Palette extends PaletteColors {
	/** 0 for the afternoon scene, 1 for blue hour (dark mode). */
	night: number;
}

const TOKENS: Record<keyof PaletteColors, string> = {
	sky: "--world-sky",
	skyTop: "--world-sky-top",
	skyGlow: "--world-sky-glow",
	sun: "--world-sun",
	sunGlow: "--world-sun-glow",
	cloud: "--world-cloud",
	cloudShade: "--world-cloud-shade",
	scrub: "--world-scrub",
	rock: "--world-rock",
	sand: "--world-sand",
	house: "--world-house",
	roof: "--world-roof",
	dome: "--world-dome",
	lamp: "--world-lamp",
	lightKey: "--world-light-key",
	lightFill: "--world-light-fill",
	rim: "--world-rim",
	sea: "--world-sea",
	seaDeep: "--world-sea-deep",
	seaShallow: "--world-sea-shallow",
	shadow: "--world-shadow",
	fleck: "--world-fleck",
	hull: "--world-hull",
	stripe: "--world-stripe",
	spar: "--world-spar",
	deck: "--world-deck",
	plank: "--world-plank",
	glass: "--world-glass",
	crew: "--world-crew",
	sail: "--world-sail",
	accent: "--world-accent",
	buoy: "--world-buoy",
	buoyNext: "--world-buoy-next",
	buoyDone: "--world-buoy-done",
	finish: "--world-finish",
	wake: "--world-wake",
};

export function readPalette(element: Element = document.documentElement): Palette {
	const style = getComputedStyle(element);
	const entries = Object.entries(TOKENS).map(([key, token]) => {
		const value = style.getPropertyValue(token).trim() || "#888888";
		return [key, new Color(value)] as const;
	});
	const colors = Object.fromEntries(entries) as unknown as PaletteColors;
	const night = Number.parseFloat(style.getPropertyValue("--world-night"));
	return { ...colors, night: Number.isFinite(night) ? Math.min(1, Math.max(0, night)) : 0 };
}

export function cssColor(color: Color): string {
	return `#${color.getHexString()}`;
}
