import {
	BufferGeometry,
	CircleGeometry,
	Color,
	Float32BufferAttribute,
	IcosahedronGeometry,
} from "three";
import { MeshBuilder, place, type Vec3 } from "./mesh-builder";
import type { Palette } from "./palette";

/** Boat length in world units; marks are a few boat lengths wide. */
export const BOAT_LENGTH = 6;
/** The model is drawn a little larger than its nominal length so it reads on a phone. */
export const BOAT_SCALE = 1.2;
const HALF = BOAT_LENGTH / 2;

/** Rig measurements shared by the model and its sails. Bow is towards -Z. */
export const RIG = {
	mastZ: -0.75,
	mastFoot: 0.72,
	mastTop: 9.4,
	/** Gooseneck: where the boom meets the mast. */
	boomY: 1.75,
	boomLength: 3.55,
	/** Jib tack on the foredeck and where the forestay meets the mast. */
	tackY: 0.98,
	tackZ: -HALF + 0.22,
	hoistY: 7.9,
} as const;

/** Hull cross-sections from bow (0) to stern (1). */
const STATIONS = 9;

function halfBeam(t: number): number {
	if (t < 0.6) return 1.18 * Math.sin((Math.PI / 2) * (t / 0.6)) ** 0.8;
	return 1.18 - 0.3 * ((t - 0.6) / 0.4) ** 2;
}

/** Deck edge height: the sheer line sweeps up to the bow. */
function sheer(t: number): number {
	if (t < 0.65) return 0.72 + 0.3 * (1 - t / 0.65) ** 2;
	return 0.72 + 0.07 * ((t - 0.65) / 0.35) ** 2;
}

function keel(t: number): number {
	if (t < 0.35) return -0.35 + 0.5 * (1 - t / 0.35) ** 2;
	if (t > 0.5) return -0.35 + 0.3 * ((t - 0.5) / 0.5) ** 2;
	return -0.35;
}

/** One side of a hull section, deck edge down to the keel. */
function section(t: number, side: 1 | -1): Vec3[] {
	const z = -HALF + t * BOAT_LENGTH;
	const b = halfBeam(t) * side;
	const top = sheer(t);
	const bottom = keel(t);
	return [
		[b, top, z],
		[b * 0.98, top - 0.17, z],
		[b * 0.74, bottom * 0.4 + 0.05, z],
		[0, bottom, z],
	];
}

/** Hull, deck, cabin, cockpit and mast as one vertex-coloured geometry. */
export function hullGeometry(palette: Palette): BufferGeometry {
	const builder = new MeshBuilder();
	// White cove stripe under the sheer, navy topsides, red bottom paint.
	const bands = [palette.stripe, palette.hull, palette.accent];
	for (let i = 0; i < STATIONS - 1; i++) {
		const t0 = i / (STATIONS - 1);
		const t1 = (i + 1) / (STATIONS - 1);
		for (const side of [1, -1] as const) {
			const a = section(t0, side);
			const b = section(t1, side);
			for (let band = 0; band < 3; band++) {
				builder.quad(a[band]!, b[band]!, b[band + 1]!, a[band + 1]!, bands[band]!);
			}
			// Deck, crowned slightly along the centreline.
			const ca: Vec3 = [0, sheer(t0) + 0.07, a[0]![2]];
			const cb: Vec3 = [0, sheer(t1) + 0.07, b[0]![2]];
			builder.quad(a[0]!, b[0]!, cb, ca, palette.plank);
		}
	}
	// Transom.
	for (const side of [1, -1] as const) {
		const s = section(1, side);
		const centre: Vec3 = [0, sheer(1), HALF];
		builder.tri(centre, s[0]!, s[1]!, palette.stripe);
		builder.tri(centre, s[1]!, s[2]!, palette.hull);
		builder.tri(centre, s[2]!, s[3]!, palette.hull);
	}

	// Cabin trunk: a low wedge with a raked front and a dark window strip.
	const deckY = 0.76;
	const roofY = deckY + 0.46;
	const front = -1.75;
	const back = 0.35;
	const corners = (y: number, inset: number, rake: number): Vec3[] => [
		[-0.6 + inset, y, front + rake],
		[0.6 - inset, y, front + rake],
		[0.68 - inset, y, back],
		[-0.68 + inset, y, back],
	];
	const base = corners(deckY, 0, 0);
	const roof = corners(roofY, 0.1, 0.45);
	for (let i = 0; i < 4; i++) {
		const j = (i + 1) % 4;
		builder.quad(base[i]!, base[j]!, roof[j]!, roof[i]!, palette.stripe);
	}
	builder.quad(roof[0]!, roof[1]!, roof[2]!, roof[3]!, palette.stripe);
	for (const side of [1, -1]) {
		builder.quad(
			[side * 0.665, deckY + 0.14, front + 0.5],
			[side * 0.7, deckY + 0.14, back - 0.2],
			[side * 0.655, deckY + 0.34, back - 0.2],
			[side * 0.6, deckY + 0.34, front + 0.72],
			palette.glass,
		);
	}
	// Cockpit well and its coamings.
	builder.quad([-0.5, deckY + 0.03, 0.6], [0.5, deckY + 0.03, 0.6], [0.44, deckY + 0.03, 2.45], [-0.44, deckY + 0.03, 2.45], palette.deck);
	for (const side of [1, -1]) {
		builder.box([side * 0.5 - 0.05, deckY, 0.55], [side * 0.5 + 0.05, deckY + 0.2, 2.5], palette.stripe);
	}
	// Mast with spreaders, and a bow pulpit post so the stem reads at a glance.
	builder.tube([0, RIG.mastFoot, RIG.mastZ], [0, RIG.mastTop, RIG.mastZ], 0.1, palette.spar, 6, 0.055);
	builder.tube([-0.55, 5.6, RIG.mastZ], [0.55, 5.6, RIG.mastZ], 0.035, palette.spar, 4);
	builder.tube([0, RIG.tackY - 0.1, RIG.tackZ], [0, RIG.tackY + 0.25, RIG.tackZ], 0.045, palette.spar, 4);
	// Stainless pulpit rail round the bow, a crisp line against the water.
	builder.tube([-0.55, 1.35, -2.1], [0, 1.35, -HALF + 0.15], 0.03, palette.spar, 4);
	builder.tube([0.55, 1.35, -2.1], [0, 1.35, -HALF + 0.15], 0.03, palette.spar, 4);
	return builder.build();
}

/** Rudder blade and tiller, pivoting at the transom. */
export function rudderGeometry(palette: Palette): BufferGeometry {
	const builder = new MeshBuilder();
	builder.box([-0.04, -0.75, -0.02], [0.04, 0.85, 0.34], palette.hull);
	builder.tube([0, 0.95, 0.05], [0, 1.08, -1.25], 0.04, palette.deck, 4);
	return builder.build();
}

/** The boom, in the mainsail pivot's frame: it runs aft along +Z. */
export function boomGeometry(palette: Palette): BufferGeometry {
	return new MeshBuilder().tube([0, 0, -0.1], [0, 0, RIG.boomLength], 0.07, palette.spar, 5, 0.05).build();
}

/** One sailor in a bright spray jacket, cap and dark shorts, sitting on the side deck. */
function addSailor(builder: MeshBuilder, palette: Palette, z: number, jacket: Color, cap: Color): void {
	builder.box([-0.21, 0, z - 0.17], [0.21, 0.55, z + 0.17], jacket);
	builder.box([-0.23, -0.12, z - 0.2], [0.23, 0.04, z + 0.32], palette.glass);
	builder.add(new IcosahedronGeometry(0.18, 1), place([0, 0.74, z]), palette.plank);
	builder.box([-0.19, 0.8, z - 0.19], [0.19, 0.88, z + 0.26], cap);
}

/** The helmsman aft and a trimmer amidships: scale and life on deck. */
export function crewGeometry(palette: Palette): BufferGeometry {
	const builder = new MeshBuilder();
	addSailor(builder, palette, 0, palette.crew, palette.accent);
	addSailor(builder, palette, -1.25, palette.accent, palette.stripe);
	return builder.build();
}

/**
 * A sail as a smooth-shaded grid between a straight luff (on local +Y) and a
 * leech. It bellies towards +X; the model flips and flutters it by scaling X.
 * Rows above `topPanel` of the hoist take the accent colour.
 */
function sailGeometry(
	palette: Palette,
	luff: number,
	leech: (v: number) => readonly [number, number],
	options: { camber: number; twist: number; topPanel: number; footFree: boolean },
): BufferGeometry {
	const rows = 8;
	const cols = 5;
	const positions: number[] = [];
	const index: number[] = [];
	for (let r = 0; r <= rows; r++) {
		const v = r / rows;
		const [ly, lz] = leech(v);
		const chord = Math.hypot(ly - v * luff, lz);
		// A foot laced to the boom stays flat; a free foot bellies all the way down.
		const fullness = options.footFree ? 1 : Math.min(1, 0.2 + v * 4);
		for (let c = 0; c <= cols; c++) {
			const u = c / cols;
			const belly = options.camber * chord * Math.sin(Math.PI * u ** 0.85) * fullness;
			positions.push(belly + options.twist * v * u * chord, v * luff + (ly - v * luff) * u, lz * u);
		}
	}
	const stride = cols + 1;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const a = r * stride + c;
			index.push(a, a + 1, a + stride, a + 1, a + stride + 1, a + stride);
		}
	}
	const grid = new BufferGeometry();
	grid.setAttribute("position", new Float32BufferAttribute(positions, 3));
	grid.setIndex(index);
	grid.computeVertexNormals();
	// Unshared vertices keep the smooth normals but let panels have hard colour edges.
	const geometry = grid.toNonIndexed();
	grid.dispose();
	const colors: number[] = [];
	// Triangles come out row by row, two per grid cell.
	for (let r = 0; r < rows; r++) {
		const color = r / rows >= options.topPanel ? palette.accent : palette.sail;
		for (let k = 0; k < cols * 6; k++) colors.push(color.r, color.g, color.b);
	}
	geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
	return geometry;
}

/** Mainsail: luff up the mast from the gooseneck, foot along the boom (+Z). */
export function mainsailGeometry(palette: Palette): BufferGeometry {
	const luff = RIG.mastTop - RIG.boomY - 0.25;
	const foot = RIG.boomLength - 0.15;
	// A little roach rounds the leech out beyond the straight head-to-clew line.
	return sailGeometry(
		palette,
		luff,
		(v) => [v * luff, foot * (1 - v) + 0.14 + 0.55 * Math.sin(Math.PI * v) * (1 - v * 0.5)],
		{ camber: 0.15, twist: 0.2, topPanel: 0.75, footFree: false },
	);
}

/** Jib: luff along the forestay (local +Y); `clew` is in the stay's frame. */
export function jibGeometry(palette: Palette, stay: number, clew: readonly [number, number]): BufferGeometry {
	const luff = stay * 0.94;
	return sailGeometry(
		palette,
		luff,
		(v) => [clew[0] + (luff - clew[0]) * v, clew[1] * (1 - v) + 0.04],
		{ camber: 0.17, twist: 0.12, topPanel: 2, footFree: true },
	);
}

/** Soft elliptical shadow: dark in the middle, clear at the rim. */
export function shadowGeometry(color: Color): BufferGeometry {
	const geometry = new CircleGeometry(1, 20);
	geometry.rotateX(-Math.PI / 2);
	const count = geometry.getAttribute("position").count;
	const colors: number[] = [];
	// Vertex 0 is the centre of a CircleGeometry fan.
	for (let i = 0; i < count; i++) colors.push(color.r, color.g, color.b, i === 0 ? 0.45 : 0);
	geometry.setAttribute("color", new Float32BufferAttribute(colors, 4));
	return geometry;
}

/** Foam curling off both bows; the model scales it with boat speed. */
export function bowWaveGeometry(color: Color): BufferGeometry {
	const positions: number[] = [];
	const colors: number[] = [];
	const steps = 5;
	const push = (p: Vec3, alpha: number) => {
		positions.push(...p);
		colors.push(color.r, color.g, color.b, alpha);
	};
	for (const side of [1, -1]) {
		const inner: Array<[Vec3, number]> = [];
		const crest: Array<[Vec3, number]> = [];
		const outer: Array<[Vec3, number]> = [];
		for (let i = 0; i <= steps; i++) {
			const f = i / steps;
			const z = -HALF + 0.1 + f * 2.7;
			const hull = halfBeam((z + HALF) / BOAT_LENGTH) * 0.9 + 0.05;
			const fade = (1 - f) ** 0.8;
			inner.push([[side * hull, 0.05, z], 0.9 * fade]);
			crest.push([[side * (hull + 0.3 + f * 0.5), 0.2 + 0.4 * Math.sin(Math.PI * Math.min(1, f * 1.6)), z + 0.25], 0.75 * fade]);
			outer.push([[side * (hull + 0.75 + f * 1.3), 0.03, z + 0.7], 0]);
		}
		for (let i = 0; i < steps; i++) {
			for (const [a, b] of [[inner, crest], [crest, outer]] as const) {
				const quad = [a[i]!, a[i + 1]!, b[i + 1]!, a[i]!, b[i + 1]!, b[i]!];
				for (const [p, alpha] of quad) push(p, alpha);
			}
		}
	}
	const geometry = new BufferGeometry();
	geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
	geometry.setAttribute("color", new Float32BufferAttribute(colors, 4));
	return geometry;
}
