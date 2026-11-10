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
	low: RGB;
	mid: RGB;
	high: RGB;
	snow: RGB;
	/** Windward slopes that give slope lift: a warm sunlit tint. */
	slopeLift: RGB;
	/** Turnpoint beacons: the next one, later ones, and one just reached. */
	beacon: string;
	beaconRgb: RGB;
	beaconDim: string;
	beaconHit: string;
	beaconHitRgb: RGB;
	/** Thermals: the cloud on top, its shaded base, and the rising air in the column. */
	cloud: RGB;
	cloudShade: RGB;
	lift: RGB;
	/** Air motes: drifting up in lift, sinking in sink. */
	moteUp: RGB;
	moteDown: RGB;
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
		skyTop: [58, 128, 206], skyMid: [118, 178, 230], skyLow: [214, 234, 244], haze: [200, 222, 232], sun: [255, 246, 214],
		ridgeNear: [132, 164, 176], ridgeFar: [170, 196, 210],
		water: [62, 138, 190], low: [124, 176, 88], mid: [84, 140, 72],
		high: [146, 128, 100], snow: [240, 244, 248], slopeLift: [232, 196, 92],
		beacon: "#ffb400", beaconRgb: [255, 180, 0], beaconDim: "rgba(255,180,0,0.5)", beaconHit: "#5fd36b", beaconHitRgb: [95, 211, 107],
		cloud: [255, 255, 255], cloudShade: [168, 182, 202], lift: [255, 214, 120],
		moteUp: [255, 236, 170], moteDown: [120, 150, 190],
		liftWeak: [255, 236, 150], liftStrong: [255, 122, 40],
		path: "#ffffff", planeRed: "#d8402f", planeWhite: "#f6f7f8",
		gliderBody: [246, 247, 248], gliderTrim: [216, 64, 47], gliderGlass: [52, 92, 128],
	},
	dark: {
		skyTop: [24, 52, 88], skyMid: [50, 90, 128], skyLow: [116, 142, 160], haze: [100, 124, 140], sun: [214, 204, 172],
		ridgeNear: [70, 92, 106], ridgeFar: [92, 116, 132],
		water: [38, 86, 124], low: [72, 112, 56], mid: [50, 88, 46],
		high: [96, 84, 68], snow: [176, 184, 192], slopeLift: [170, 140, 64],
		beacon: "#e6a200", beaconRgb: [230, 162, 0], beaconDim: "rgba(230,162,0,0.5)", beaconHit: "#4cb858", beaconHitRgb: [76, 184, 88],
		cloud: [206, 216, 226], cloudShade: [116, 130, 148], lift: [226, 196, 128],
		moteUp: [226, 206, 140], moteDown: [110, 136, 170],
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
