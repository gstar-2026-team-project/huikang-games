/** A river canyon carved along a course: flat water floor, steep rock walls, mountains beyond. */
import { type Terrain, type TerrainPhases, terrainHeight } from "./terrain";

export interface CanyonDims {
	/** half the width of the flat river floor (m) */
	halfWidth: number;
	/** horizontal run over which a wall climbs to the rim (m) */
	wallRun: number;
	/** rim height above the river (m) */
	rim: number;
}

/** A centre-line point; `y` (optional) is the flight height there, interpolated linearly. */
export interface PathPoint { x: number; z: number; y?: number }

const SAMPLE_STEP = 30; // metres between centre-line samples
const BUCKET = 250; // spatial hash cell for centre-line segments

/** Catmull-Rom through the control points, sampled about every SAMPLE_STEP metres. */
export function sampleSpline(points: readonly PathPoint[]): PathPoint[] {
	const out: PathPoint[] = [];
	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[Math.max(0, i - 1)] as PathPoint, p1 = points[i] as PathPoint;
		const p2 = points[i + 1] as PathPoint, p3 = points[Math.min(points.length - 1, i + 2)] as PathPoint;
		const steps = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.z - p1.z) / SAMPLE_STEP));
		for (let s = 0; s < steps; s++) {
			const t = s / steps, t2 = t * t, t3 = t2 * t;
			const f = (a: number, b: number, c: number, d: number) =>
				0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
			const y = p1.y !== undefined && p2.y !== undefined ? p1.y + (p2.y - p1.y) * t : undefined;
			out.push({ x: f(p0.x, p1.x, p2.x, p3.x), z: f(p0.z, p1.z, p2.z, p3.z), ...(y !== undefined ? { y } : {}) });
		}
	}
	const last = points[points.length - 1];
	if (last) out.push({ ...last });
	return out;
}

const bucketKey = (bx: number, bz: number) => (bx + 0x8000) * 0x10000 + (bz + 0x8000);

/** Distance from (x, z) to the canyon centre line, via a spatial hash of its segments. */
export class CentreLine {
	/** Flight height at the nearest point of the last `distance` call (0 if none). */
	lastY = 0;
	private readonly buckets = new Map<number, number[]>();
	constructor(private readonly pts: PathPoint[], reach: number) {
		for (let i = 0; i < pts.length - 1; i++) {
			const a = pts[i] as PathPoint, b = pts[i + 1] as PathPoint;
			const bx0 = Math.floor((Math.min(a.x, b.x) - reach) / BUCKET), bx1 = Math.floor((Math.max(a.x, b.x) + reach) / BUCKET);
			const bz0 = Math.floor((Math.min(a.z, b.z) - reach) / BUCKET), bz1 = Math.floor((Math.max(a.z, b.z) + reach) / BUCKET);
			for (let bx = bx0; bx <= bx1; bx++) {
				for (let bz = bz0; bz <= bz1; bz++) {
					const key = bucketKey(bx, bz);
					const list = this.buckets.get(key);
					if (list) list.push(i);
					else this.buckets.set(key, [i]);
				}
			}
		}
	}

	/** Infinity when no segment is within `reach`. */
	distance(x: number, z: number): number {
		const list = this.buckets.get(bucketKey(Math.floor(x / BUCKET), Math.floor(z / BUCKET)));
		if (!list) return Number.POSITIVE_INFINITY;
		let best = Number.POSITIVE_INFINITY;
		this.lastY = 0;
		for (const i of list) {
			const a = this.pts[i] as PathPoint, b = this.pts[i + 1] as PathPoint;
			const dx = b.x - a.x, dz = b.z - a.z;
			const len2 = dx * dx + dz * dz || 1;
			const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
			const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
			if (d < best) {
				best = d;
				this.lastY = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t;
			}
		}
		return best;
	}
}

export function canyonTerrain(phases: TerrainPhases, control: readonly PathPoint[], dims: CanyonDims): Terrain {
	const line = new CentreLine(sampleSpline(control), dims.halfWidth + dims.wallRun);
	return {
		// Canyon walls stay rock; only the peaks beyond the rim carry snow.
		snowLine: dims.rim + 140,
		height(x, z) {
			const d = line.distance(x, z);
			if (d <= dims.halfWidth) return 0; // river
			const t = Math.min(1, (d - dims.halfWidth) / dims.wallRun);
			const wall = t * t * (3 - 2 * t);
			// Rugged mountains beyond the rim, from the valley noise.
			return wall * (dims.rim + 0.6 * terrainHeight(phases, x, z));
		},
	};
}
