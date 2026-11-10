import type { Ring } from "./course";
import { forward, type Plane } from "./flight";

/** How many rings ahead the path is drawn through. */
export const PATH_RINGS = 3;
/** Points sampled along each leg (plane to ring, ring to ring). */
export const PATH_SAMPLES_PER_LEG = 12;
/** Length of the flat [x, y, z] buffer `idealPath` fills. */
export const PATH_BUFFER_LENGTH = (PATH_RINGS * PATH_SAMPLES_PER_LEG + 1) * 3;

/**
 * A smooth line to fly: from the plane's nose through the centre of each of
 * the next rings, crossing every ring square-on. Each leg is a cubic Hermite
 * curve whose end tangents follow the plane's heading and the rings' facing.
 * Writes flat [x, y, z] triples into `out` and returns how many points it wrote.
 */
export function idealPath(plane: Plane, rings: readonly Ring[], next: number, out: Float32Array | number[]): number {
	let [tx, ty, tz] = forward(plane);
	let px = plane.x;
	let py = plane.y;
	let pz = plane.z;
	let count = 0;
	const put = (x: number, y: number, z: number) => {
		out[count * 3] = x;
		out[count * 3 + 1] = y;
		out[count * 3 + 2] = z;
		count++;
	};
	put(px, py, pz);
	const end = Math.min(rings.length, next + PATH_RINGS);
	for (let i = next; i < end; i++) {
		const ring = rings[i];
		if (!ring) break;
		// A ring faces along its yaw; the path leaves it level, straight through.
		const nx = Math.sin(ring.yaw);
		const nz = Math.cos(ring.yaw);
		const dist = Math.hypot(ring.x - px, ring.y - py, ring.z - pz);
		for (let s = 1; s <= PATH_SAMPLES_PER_LEG; s++) {
			const t = s / PATH_SAMPLES_PER_LEG;
			const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
			const h10 = t ** 3 - 2 * t ** 2 + t;
			const h01 = -2 * t ** 3 + 3 * t ** 2;
			const h11 = t ** 3 - t ** 2;
			put(
				h00 * px + h10 * tx * dist + h01 * ring.x + h11 * nx * dist,
				h00 * py + h10 * ty * dist + h01 * ring.y,
				h00 * pz + h10 * tz * dist + h01 * ring.z + h11 * nz * dist,
			);
		}
		px = ring.x;
		py = ring.y;
		pz = ring.z;
		tx = nx;
		ty = 0;
		tz = nz;
	}
	return count;
}
