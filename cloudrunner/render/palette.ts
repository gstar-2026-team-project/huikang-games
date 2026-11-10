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
	/** Turnpoint beacons: the next one, later ones, and one just reached. */
	beacon: string;
	beaconDim: string;
	beaconHit: string;
	/** Thermals: the cloud on top, its shaded base, and the rising marks in the column. */
	cloud: RGB;
	cloudShade: RGB;
	lift: RGB;
	/** Thermals on the map, weak to strong. */
	liftWeak: RGB;
	liftStrong: RGB;
	/** The autopilot's plan, in the view and on the map. */
	path: string;
	planeRed: string;
	planeWhite: string;
	/** Glider paint, shaded per face. */
	gliderBody: RGB;
	gliderTrim: RGB;
	gliderGlass: RGB;
}

/** Dark mode keeps the hues and lowers the lightness of the brightest surfaces. */
export const PALETTES: { light: Palette; dark: Palette } = {
	light: {
		skyTop: [70, 150, 215], skyLow: [205, 232, 246], haze: [196, 220, 232],
		water: [64, 140, 196], low: [112, 170, 84], mid: [74, 132, 66],
		high: [138, 118, 92], snow: [240, 244, 248],
		beacon: "#ffb400", beaconDim: "rgba(255,180,0,0.45)", beaconHit: "#5fd36b",
		cloud: [255, 255, 255], cloudShade: [186, 200, 214], lift: [255, 244, 200],
		liftWeak: [255, 236, 150], liftStrong: [255, 122, 40],
		path: "#ffffff", planeRed: "#d8402f", planeWhite: "#f6f7f8",
		gliderBody: [246, 247, 248], gliderTrim: [216, 64, 47], gliderGlass: [52, 92, 128],
	},
	dark: {
		skyTop: [32, 64, 96], skyLow: [104, 134, 156], haze: [98, 124, 142],
		water: [40, 90, 130], low: [70, 112, 56], mid: [48, 88, 44],
		high: [94, 82, 66], snow: [176, 184, 192],
		beacon: "#e6a200", beaconDim: "rgba(230,162,0,0.45)", beaconHit: "#4cb858",
		cloud: [206, 216, 226], cloudShade: [128, 142, 158], lift: [226, 214, 170],
		liftWeak: [224, 206, 128], liftStrong: [226, 106, 36],
		path: "#e2e8ee", planeRed: "#b8342a", planeWhite: "#d6dbe0",
		gliderBody: [204, 210, 216], gliderTrim: [184, 52, 42], gliderGlass: [40, 70, 100],
	},
};

export const mix = (a: RGB, b: RGB, t: number): RGB => [
	a[0] + (b[0] - a[0]) * t,
	a[1] + (b[1] - a[1]) * t,
	a[2] + (b[2] - a[2]) * t,
];

export const rgb = (c: RGB): string => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
export const rgba = (c: RGB, a: number): string => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;
