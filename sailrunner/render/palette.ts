import { Color } from "three";

/** World colours, read from CSS tokens so dark mode dims the same hues. */
export interface Palette {
	/** Sky at the horizon; also the haze the far water fades into. */
	sky: Color;
	skyTop: Color;
	sun: Color;
	cloud: Color;
	island: Color;
	lightKey: Color;
	lightFill: Color;
	sea: Color;
	seaDeep: Color;
	shadow: Color;
	fleck: Color;
	hull: Color;
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

const TOKENS: Record<keyof Palette, string> = {
	sky: "--world-sky",
	skyTop: "--world-sky-top",
	sun: "--world-sun",
	cloud: "--world-cloud",
	island: "--world-island",
	lightKey: "--world-light-key",
	lightFill: "--world-light-fill",
	sea: "--world-sea",
	seaDeep: "--world-sea-deep",
	shadow: "--world-shadow",
	fleck: "--world-fleck",
	hull: "--world-hull",
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
	return Object.fromEntries(entries) as unknown as Palette;
}

export function cssColor(color: Color): string {
	return `#${color.getHexString()}`;
}
