import {
	BufferGeometry,
	Color,
	ConeGeometry,
	CylinderGeometry,
	Float32BufferAttribute,
	IcosahedronGeometry,
	RingGeometry,
	SphereGeometry,
	type Vector3,
} from "three";
import { createRng } from "../game/rng";
import { MeshBuilder, place } from "./mesh-builder";
import type { Palette } from "./palette";

/** One island: where it sits relative to the course centre, and how big. */
export interface IslandSpec {
	x: number;
	z: number;
	radius: number;
	height: number;
	/** 0 near (detailed), 1 middle, 2 far (silhouette only). */
	tier: 0 | 1 | 2;
	lighthouse: boolean;
	village: boolean;
}

/** Near islands sit well clear of the furthest mark (about 300 m from the start). */
const TIERS = [
	{ distance: [440, 540], radius: [48, 72], height: [22, 36] },
	{ distance: [660, 820], radius: [85, 125], height: [38, 64] },
	{ distance: [1050, 1250], radius: [170, 250], height: [80, 135] },
] as const;
/** Tier of each island around the ring: near ones spaced between bigger, farther shapes. */
const RING: readonly (0 | 1 | 2)[] = [0, 2, 1, 2, 0, 1, 2, 0, 2, 1];

export function islandSpecs(): IslandSpec[] {
	const rng = createRng(97);
	const range = (r: readonly [number, number]) => r[0] + rng() * (r[1] - r[0]);
	let near = 0;
	let mid = 0;
	return RING.map((tier, i) => {
		const azimuth = (i / RING.length) * Math.PI * 2 + (rng() - 0.5) * 0.35;
		const t = TIERS[tier];
		const distance = range(t.distance);
		const spec: IslandSpec = {
			x: Math.sin(azimuth) * distance,
			z: Math.cos(azimuth) * distance,
			radius: range(t.radius),
			height: range(t.height),
			tier,
			lighthouse: tier === 0 && near === 0,
			village: (tier === 0 && near === 1) || (tier === 1 && mid === 0),
		};
		if (tier === 0) near++;
		if (tier === 1) mid++;
		return spec;
	});
}

/** Cheap smooth-ish noise on a circle, for rough coastlines and ridges. */
function wobble(angle: number, seed: number): number {
	return 0.55 * Math.sin(angle * 3 + seed) + 0.3 * Math.sin(angle * 5 + seed * 1.7) + 0.15 * Math.sin(angle * 9 + seed * 2.3);
}

/** Terrain colour by slope and height: green scrub on top, pale cliffs, sand at the foot. */
function terrainShader(palette: Palette, seed: number) {
	const scrubDark = palette.scrub.clone().multiplyScalar(0.72);
	const rockDark = palette.rock.clone().lerp(palette.scrub, 0.18).multiplyScalar(0.82);
	const out = new Color();
	return (centre: Vector3, normal: Vector3): Color => {
		const n = Math.sin(centre.x * 0.19 + seed) * Math.sin(centre.z * 0.23 - seed) * 0.5 + 0.5;
		if (centre.y < 2.2) return out.copy(palette.sand).clone();
		if (normal.y > 0.62) return out.copy(palette.scrub).lerp(scrubDark, n * 0.8).clone();
		if (normal.y > 0.42) return out.copy(palette.rock).lerp(palette.scrub, 0.35 + n * 0.4).clone();
		return out.copy(palette.rock).lerp(rockDark, n).clone();
	};
}

function addIsland(builder: MeshBuilder, spec: IslandSpec, palette: Palette, rng: () => number): void {
	const { x, z, radius: r, height: h } = spec;
	const seed = rng() * 10;
	const shade = terrainShader(palette, seed);
	const rough = (cx: number, cz: number, amount: number) => (v: Vector3) => {
		const a = Math.atan2(v.z - cz, v.x - cx);
		const k = 1 + amount * wobble(a, seed);
		v.x = cx + (v.x - cx) * k;
		v.z = cz + (v.z - cz) * k;
	};
	if (spec.tier < 2) {
		// Beach shelf, then surf breaking all round it.
		builder.addShaded(new CylinderGeometry(r * 1.0, r * 1.06, 2.4, 18), place([x, 0, z]), () => palette.sand, rough(x, z, 0.08));
		const surf = new RingGeometry(r * 1.07, r * 1.17, 22, 1);
		surf.rotateX(-Math.PI / 2);
		builder.addShaded(surf, place([x, 0.3, z]), () => palette.wake, rough(x, z, 0.08));
	}
	// A massif or two: steep cliff drums under rounded green tops.
	const hills = spec.tier === 2 ? 2 + Math.floor(rng() * 2) : 1 + Math.floor(rng() * 2);
	for (let k = 0; k < hills; k++) {
		const main = k === 0;
		const angle = rng() * Math.PI * 2;
		const off = main ? 0 : r * (0.3 + rng() * 0.25);
		const hx = x + Math.cos(angle) * off;
		const hz = z + Math.sin(angle) * off;
		const hr = r * (main ? 0.78 : 0.45 + rng() * 0.15);
		const hh = h * (main ? 1 : 0.55 + rng() * 0.25);
		const cliff = hh * (spec.tier === 2 ? 0.35 : 0.5);
		builder.addShaded(
			new CylinderGeometry(hr * 0.82, hr, cliff, 11, 2),
			place([hx, 1 + cliff / 2, hz]),
			shade,
			rough(hx, hz, 0.12),
		);
		const capBase = 1 + cliff;
		builder.addShaded(
			new IcosahedronGeometry(1, 2),
			place([hx, capBase, hz], [hr * 0.86, hh - cliff, hr * 0.84], [0, rng() * Math.PI, 0]),
			shade,
			(v) => {
				rough(hx, hz, 0.12)(v);
				if (v.y < capBase) v.y = capBase - 0.5;
			},
		);
		if (spec.tier === 0 && main) addCypresses(builder, palette, hx, hz, hr * 0.86, capBase, hh - cliff, rng);
	}
}

/** Dark Mediterranean cypresses dotted on a rounded top. */
function addCypresses(
	builder: MeshBuilder,
	palette: Palette,
	cx: number,
	cz: number,
	radius: number,
	base: number,
	rise: number,
	rng: () => number,
): void {
	const green = palette.scrub.clone().multiplyScalar(0.55);
	for (let i = 0; i < 9; i++) {
		const a = rng() * Math.PI * 2;
		const d = radius * (0.2 + rng() * 0.6);
		const ground = base + rise * Math.sqrt(Math.max(0, 1 - (d / radius) ** 2)) - 1;
		const tall = 5 + rng() * 4;
		builder.add(new ConeGeometry(1, 1, 5), place([cx + Math.cos(a) * d, ground + tall / 2, cz + Math.sin(a) * d], [1.3, tall, 1.3]), green);
	}
}

/** Where a building stands: on the beach shelf, on the side facing the course. */
function shore(spec: IslandSpec, along: number, inset: number): [number, number] {
	const toCentre = Math.atan2(-spec.z, -spec.x) + along;
	const d = spec.radius * inset;
	return [spec.x + Math.cos(toCentre) * d, spec.z + Math.sin(toCentre) * d];
}

const LIGHTHOUSE_SCALE = 1.5;

/** White tower, red band, dark lantern and red cap, on its own rocky point. */
function addLighthouse(builder: MeshBuilder, spec: IslandSpec, palette: Palette): [number, number, number] {
	const [lx, lz] = shore(spec, 0.5, 0.93);
	const s = LIGHTHOUSE_SCALE;
	const y0 = 1.2;
	builder.add(new CylinderGeometry(4 * s, 5.5 * s, 3, 7), place([lx, y0 + 1.5, lz]), palette.rock);
	builder.add(new CylinderGeometry(1.5 * s, 2.3 * s, 16 * s, 10), place([lx, y0 + 3 + 8 * s, lz]), palette.house);
	builder.add(new CylinderGeometry(1.62 * s, 1.95 * s, 4 * s, 10), place([lx, y0 + 3 + 9.5 * s, lz]), palette.accent);
	builder.add(new CylinderGeometry(2.4 * s, 2.4 * s, 0.6 * s, 10), place([lx, y0 + 3 + 16.3 * s, lz]), palette.glass);
	builder.add(new CylinderGeometry(1.25 * s, 1.25 * s, 2.2 * s, 8), place([lx, y0 + 3 + 17.7 * s, lz]), palette.glass);
	builder.add(new ConeGeometry(1.8 * s, 1.9 * s, 8), place([lx, y0 + 3 + 19.75 * s, lz]), palette.accent);
	return [lx, y0 + 3 + 17.7 * s, lz];
}

/** A cluster of white houses with terracotta roofs and one blue dome. */
function addVillage(builder: MeshBuilder, lamps: MeshBuilder, spec: IslandSpec, palette: Palette, rng: () => number): void {
	for (let i = 0; i < 9; i++) {
		const [hx, hz] = shore(spec, (i - 4) * 0.075 + (rng() - 0.5) * 0.04, 0.84 + rng() * 0.12);
		const w = 4 + rng() * 3;
		const tall = 3.5 + rng() * 3;
		const turn = rng() * Math.PI;
		builder.add(new CylinderGeometry(w * 0.7, w * 0.7, tall, 4, 1), place([hx, 1.2 + tall / 2, hz], 1, [0, turn, 0]), palette.house);
		if (i === 4) {
			builder.add(new SphereGeometry(w * 0.55, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), place([hx, 1.2 + tall, hz]), palette.dome);
		} else if (rng() < 0.7) {
			builder.add(new ConeGeometry(w * 0.78, 2.2, 4), place([hx, 1.2 + tall + 1.1, hz], 1, [0, turn, 0]), palette.roof);
		}
		// One lit window per house, facing the water.
		const out = Math.atan2(hz - spec.z, hx - spec.x);
		const wx = hx + Math.cos(out) * w * 0.52;
		const wz = hz + Math.sin(out) * w * 0.52;
		lamps.add(new CylinderGeometry(0.9, 0.9, 1.3, 4), place([wx, 1.2 + tall * 0.5, wz]), palette.lamp);
	}
}

export interface IslandGeometry {
	land: BufferGeometry;
	lamps: BufferGeometry;
	/** The lighthouse lantern, relative to the course centre. */
	lantern: [number, number, number];
}

export function islandGeometry(specs: readonly IslandSpec[], palette: Palette): IslandGeometry {
	const rng = createRng(131);
	const builder = new MeshBuilder();
	const lamps = new MeshBuilder();
	let lantern: [number, number, number] = [0, 0, 0];
	for (const spec of specs) {
		addIsland(builder, spec, palette, rng);
		if (spec.lighthouse) {
			lantern = addLighthouse(builder, spec, palette);
			lamps.add(new CylinderGeometry(1.4 * LIGHTHOUSE_SCALE, 1.4 * LIGHTHOUSE_SCALE, 2.3 * LIGHTHOUSE_SCALE, 8), place(lantern), palette.lamp);
		}
		if (spec.village) addVillage(builder, lamps, spec, palette, rng);
	}
	return { land: builder.build(), lamps: lamps.build(), lantern };
}

/** Two opposed lighthouse beams sweeping the water: bright at the lamp, fading out. */
export function beamGeometry(color: Color): BufferGeometry {
	const positions: number[] = [];
	const colors: number[] = [];
	const length = 260;
	const spread = 22;
	for (const dir of [1, -1]) {
		const tip = [0, 0, 0];
		const a = [dir * length, -14, -spread];
		const b = [dir * length, -14, spread];
		const c = [dir * length, -14 + spread, 0];
		for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
			positions.push(...tip, ...p, ...q);
			colors.push(color.r, color.g, color.b, 0.5, color.r, color.g, color.b, 0, color.r, color.g, color.b, 0);
		}
	}
	const beam = new BufferGeometry();
	beam.setAttribute("position", new Float32BufferAttribute(positions, 3));
	beam.setAttribute("color", new Float32BufferAttribute(colors, 4));
	return beam;
}
