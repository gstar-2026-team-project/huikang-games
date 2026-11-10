export type RGB = readonly [number, number, number];

export interface Palette {
	/** Sky from the zenith down to the horizon, and the haze over the far ground. */
	skyTop: RGB;
	skyMid: RGB;
	skyLow: RGB;
	haze: RGB;
	sun: RGB;
	/** Far ridges on the horizon: the nearer range, then the farther, paler one. */
	ridgeNear: RGB;
	ridgeFar: RGB;
	water: RGB;
	/** Sun glints and ripples on the river. */
	waterHi: RGB;
	low: RGB;
	mid: RGB;
	high: RGB;
	snow: RGB;
	/** Bare rock on steep slopes and canyon walls, and its darker strata. */
	rock: RGB;
	rockDark: RGB;
	/** Rings: the gold, its shaded rim and its highlight. */
	ringRgb: RGB;
	ringRim: RGB;
	ringShine: RGB;
	ringHitRgb: RGB;
	ringMissRgb: RGB;
	/** Strike-mission target ring. */
	ringTargetRgb: RGB;
	ringTargetRim: RGB;
	/** Ring arrow fill. */
	ring: string;
	/** Clouds: lit tops and shaded bases. */
	cloud: RGB;
	cloudShade: RGB;
	planeRed: string;
	planeWhite: string;
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
		skyTop: [52, 124, 204], skyMid: [112, 174, 228], skyLow: [212, 232, 244], haze: [198, 220, 232], sun: [255, 244, 210],
		ridgeNear: [128, 160, 174], ridgeFar: [168, 194, 210],
		water: [52, 128, 186], waterHi: [214, 238, 250],
		low: [112, 170, 84], mid: [74, 132, 66], high: [138, 118, 92], snow: [240, 244, 248],
		rock: [168, 128, 96], rockDark: [122, 88, 70],
		ringRgb: [255, 190, 30], ringRim: [178, 104, 10], ringShine: [255, 246, 196],
		ringHitRgb: [95, 211, 107], ringMissRgb: [224, 83, 63],
		ringTargetRgb: [255, 59, 47], ringTargetRim: [150, 24, 20],
		ring: "#ffbe1e",
		cloud: [255, 255, 255], cloudShade: [170, 186, 206],
		planeRed: "#d8402f", planeWhite: "#f6f7f8",
		jetBody: [214, 220, 228], jetTrim: [216, 64, 47], jetGlass: [52, 92, 128], jetDark: [62, 66, 72], propWhite: [246, 247, 248],
	},
	dark: {
		skyTop: [22, 48, 84], skyMid: [46, 84, 122], skyLow: [112, 138, 158], haze: [98, 122, 140], sun: [214, 204, 172],
		ridgeNear: [68, 90, 104], ridgeFar: [90, 114, 130],
		water: [34, 80, 120], waterHi: [140, 170, 190],
		low: [70, 112, 56], mid: [48, 88, 44], high: [94, 82, 66], snow: [176, 184, 192],
		rock: [116, 90, 70], rockDark: [82, 62, 50],
		ringRgb: [232, 170, 26], ringRim: [140, 82, 8], ringShine: [240, 222, 160],
		ringHitRgb: [76, 184, 88], ringMissRgb: [196, 72, 58],
		ringTargetRgb: [232, 53, 42], ringTargetRim: [120, 20, 16],
		ring: "#e8aa1a",
		cloud: [206, 216, 226], cloudShade: [116, 130, 148],
		planeRed: "#b8342a", planeWhite: "#d6dbe0",
		jetBody: [176, 182, 190], jetTrim: [184, 52, 42], jetGlass: [40, 70, 100], jetDark: [48, 52, 58], propWhite: [204, 210, 216],
	},
};

export const mix = (a: RGB, b: RGB, t: number): RGB => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t,
];

export const rgb = (c: RGB): string => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
export const rgba = (c: RGB, a: number): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
