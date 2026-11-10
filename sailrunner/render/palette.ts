import { Color } from "three";

/** World colours, read from CSS tokens so dark mode dims the same hues. */
export interface Palette {
	sky: Color;
	sea: Color;
	fleck: Color;
	hull: Color;
	deck: Color;
	sail: Color;
	accent: Color;
	buoy: Color;
	buoyNext: Color;
	buoyDone: Color;
	finish: Color;
	wake: Color;
}

const TOKENS: Record<keyof Palette, string> = {
	sky: "--world-sky",
	sea: "--world-sea",
	fleck: "--world-fleck",
	hull: "--world-hull",
	deck: "--world-deck",
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
	return Object.fromEntries(entries) as unknown as Palette;
}

export function cssColor(color: Color): string {
	return `#${color.getHexString()}`;
}
