export type RGB = readonly [number, number, number];

export interface Palette {
	skyTop: RGB;
	skyLow: RGB;
	haze: RGB;
	water: RGB;
	low: RGB;
	mid: RGB;
	high: RGB;
	snow: RGB;
	ring: string;
	ringDim: string;
	ringHit: string;
	ringMiss: string;
	/** strike-mission target ring, and its dimmed look before it is next */
	ringTarget: string;
	ringTargetDim: string;
	/** speed gates: blue = slow, purple = fast */
	ringSlow: string;
	ringSlowDim: string;
	ringFast: string;
	ringFastDim: string;
	cloud: string;
	planeRed: string;
	planeWhite: string;
	canopy: string;
	/** Jet paint, shaded per face. */
	jetBody: RGB;
	jetTrim: RGB;
	jetGlass: RGB;
	jetDark: RGB;
	propWhite: RGB;
}

/** Dark mode keeps the hues and lowers the lightness of the brightest surfaces. */
export const PALETTES: { light: Palette; dark: Palette } = {
	light: {
		skyTop: [70, 150, 215], skyLow: [205, 232, 246], haze: [196, 220, 232],
		water: [64, 140, 196], low: [112, 170, 84], mid: [74, 132, 66],
		high: [138, 118, 92], snow: [240, 244, 248],
		ring: "#f5b820", ringDim: "rgba(245,184,32,0.45)", ringHit: "#5fd36b", ringMiss: "#e0533f", ringTarget: "#ff3b2f", ringTargetDim: "rgba(255,59,47,0.55)", ringSlow: "#2f9cff", ringSlowDim: "rgba(47,156,255,0.5)", ringFast: "#b24dff", ringFastDim: "rgba(178,77,255,0.5)",
		cloud: "rgba(255,255,255,0.85)", planeRed: "#d8402f", planeWhite: "#f6f7f8", canopy: "#3d6f96",
		jetBody: [214, 220, 228], jetTrim: [216, 64, 47], jetGlass: [52, 92, 128], jetDark: [62, 66, 72], propWhite: [246, 247, 248],
	},
	dark: {
		skyTop: [32, 64, 96], skyLow: [104, 134, 156], haze: [98, 124, 142],
		water: [40, 90, 130], low: [70, 112, 56], mid: [48, 88, 44],
		high: [94, 82, 66], snow: [176, 184, 192],
		ring: "#e0a51a", ringDim: "rgba(224,165,26,0.45)", ringHit: "#4cb858", ringMiss: "#c4483a", ringTarget: "#e8352a", ringTargetDim: "rgba(232,53,42,0.55)", ringSlow: "#2a86d8", ringSlowDim: "rgba(42,134,216,0.5)", ringFast: "#9a40dc", ringFastDim: "rgba(154,64,220,0.5)",
		cloud: "rgba(200,212,222,0.7)", planeRed: "#b8342a", planeWhite: "#d6dbe0", canopy: "#33536e",
		jetBody: [176, 182, 190], jetTrim: [184, 52, 42], jetGlass: [40, 70, 100], jetDark: [48, 52, 58], propWhite: [204, 210, 216],
	},
};

export const mix = (a: RGB, b: RGB, t: number): RGB => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t,
];

export const rgb = (c: RGB): string => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
