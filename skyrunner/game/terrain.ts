export type TerrainPhases = readonly [number, number, number, number];

/** Rolling valley height in metres; 0 is lake level. */
export function terrainHeight(t: TerrainPhases, x: number, z: number): number {
	let h = 150 * Math.sin(x * 0.0011 + t[0]) * Math.cos(z * 0.0013 + t[1]);
	h += 85 * Math.sin(x * 0.0026 + z * 0.0019 + t[2]);
	h += 38 * Math.sin(x * 0.0061 - z * 0.0052 + t[3]);
	h += 90;
	return h < 0 ? 0 : h;
}

/** Highest ground sampled along a straight segment. */
export function highestGround(
	t: TerrainPhases,
	x0: number,
	z0: number,
	x1: number,
	z1: number,
	samples = 6,
): number {
	let ground = 0;
	for (let k = 0; k <= samples; k++) {
		const f = k / samples;
		ground = Math.max(ground, terrainHeight(t, x0 + (x1 - x0) * f, z0 + (z1 - z0) * f));
	}
	return ground;
}

/** Ground the sim and the renderer share. `height` is the exact surface. */
export interface Terrain {
	height(x: number, z: number): number;
	/** Height where rock turns to snow (m). */
	snowLine: number;
}

export const VALLEY_SNOW_LINE = 230;

/** Lattice spacing of the drawn terrain mesh, in metres. */
export const TERRAIN_CELL = 80;

/**
 * The ground as drawn: the mesh samples `height` on a TERRAIN_CELL lattice, so
 * collisions use the same lattice, bilinearly, and match what the player sees.
 */
export function surfaceHeight(t: Terrain, x: number, z: number): number {
	const gx = Math.floor(x / TERRAIN_CELL), gz = Math.floor(z / TERRAIN_CELL);
	const fx = x / TERRAIN_CELL - gx, fz = z / TERRAIN_CELL - gz;
	const a = latticeHeight(t, gx, gz), b = latticeHeight(t, gx + 1, gz);
	const c = latticeHeight(t, gx, gz + 1), d = latticeHeight(t, gx + 1, gz + 1);
	return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}

/** Bound on cached lattice heights per terrain; past it the cache restarts. */
const LATTICE_CACHE_LIMIT = 120_000;
const caches = new WeakMap<Terrain, Map<number, number>>();

/** Height at lattice point (gx, gz). The ground never changes, so each point is computed once. */
export function latticeHeight(t: Terrain, gx: number, gz: number): number {
	let cache = caches.get(t);
	if (!cache) {
		cache = new Map();
		caches.set(t, cache);
	}
	const key = (gx + 0x8000) * 0x10000 + (gz + 0x8000);
	const hit = cache.get(key);
	if (hit !== undefined) return hit;
	if (cache.size > LATTICE_CACHE_LIMIT) cache.clear();
	const h = t.height(gx * TERRAIN_CELL, gz * TERRAIN_CELL);
	cache.set(key, h);
	return h;
}

export function valleyTerrain(phases: TerrainPhases): Terrain {
	return { height: (x, z) => terrainHeight(phases, x, z), snowLine: VALLEY_SNOW_LINE };
}
