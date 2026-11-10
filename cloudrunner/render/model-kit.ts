/** Shared pieces for the low-poly glider model: plane-local metres, x right, y up, z forward. */
export type Paint = "body" | "trim" | "glass";
export type V3 = readonly [number, number, number];
export interface Tri { a: V3; b: V3; c: V3; paint: Paint; twoSided: boolean }

/** The stick position the control surfaces follow. */
export interface PlanePose {
	/** stick roll, -1…1 */
	roll: number;
	/** stick pitch, -1…1 */
	pitch: number;
}

/** Fuselage station: z, half-width, half-height, centre height. */
export type Station = readonly [number, number, number, number];

export function section(st: Station): V3[] {
	const [z, w, h, y] = st;
	// Hexagonal section, flatter on the sides.
	return [
		[0, y + h, z], [w * 0.8, y + h * 0.45, z], [w, y - h * 0.3, z],
		[0, y - h, z], [-w, y - h * 0.3, z], [-w * 0.8, y + h * 0.45, z],
	];
}

/** Rotate p about the hinge line through h along x by angle a. */
export function hingeX(p: V3, h: V3, a: number): V3 {
	const dy = p[1] - h[1], dz = p[2] - h[2];
	const c = Math.cos(a), s = Math.sin(a);
	return [p[0], h[1] + dy * c - dz * s, h[2] + dy * s + dz * c];
}

export function quad(out: Tri[], a: V3, b: V3, c: V3, d: V3, paint: Paint, twoSided = false): void {
	out.push({ a, b, c, paint, twoSided }, { a, b: c, c: d, paint, twoSided });
}

/** Closed fuselage through the stations (tail first) to a nose point; normals face outward. */
export function fuselage(out: Tri[], stations: readonly Station[], nose: V3, paint: Paint, tailPaint: Paint): void {
	for (let s = 0; s < stations.length - 1; s++) {
		const r0 = section(stations[s] as Station), r1 = section(stations[s + 1] as Station);
		for (let k = 0; k < 6; k++) {
			const n = (k + 1) % 6;
			quad(out, r0[k] as V3, r1[k] as V3, r1[n] as V3, r0[n] as V3, paint);
		}
	}
	const front = section(stations[stations.length - 1] as Station);
	for (let k = 0; k < 6; k++) out.push({ a: front[k] as V3, b: nose, c: front[(k + 1) % 6] as V3, paint, twoSided: false });
	const tail = section(stations[0] as Station);
	for (let k = 1; k < 5; k++) out.push({ a: tail[0] as V3, b: tail[k] as V3, c: tail[k + 1] as V3, paint: tailPaint, twoSided: false });
}

/** Four-face bubble canopy. */
export function canopy(out: Tri[], front: V3, back: V3, top: V3, halfWidth: number): void {
	const l: V3 = [-halfWidth, top[1] - 0.45, top[2]], r: V3 = [halfWidth, top[1] - 0.45, top[2]];
	out.push(
		{ a: front, b: top, c: l, paint: "glass", twoSided: true }, { a: front, b: r, c: top, paint: "glass", twoSided: true },
		{ a: back, b: l, c: top, paint: "glass", twoSided: true }, { a: back, b: top, c: r, paint: "glass", twoSided: true },
	);
}
