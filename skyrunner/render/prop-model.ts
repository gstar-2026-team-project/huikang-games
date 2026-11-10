/** Low-poly red-and-white prop plane for the open-valley modes. */
import { canopy, fuselage, hingeX, type PlanePose, quad, type Station, type Tri, type V3 } from "./model-kit";

const AILERON_MAX = 0.4; // rad
const ELEVATOR_MAX = 0.45; // rad
const PROP_RADIUS = 1.7;
const DISC_SEGMENTS = 10;
const HUB: V3 = [0, 0, 3.45];

const STATIONS: readonly Station[] = [
	[-4.6, 0.22, 0.28, 0.25],
	[-1.6, 0.6, 0.65, 0.12],
	[1.2, 0.72, 0.72, 0],
	[2.7, 0.58, 0.58, 0],
];

export function buildProp(pose: PlanePose, out: Tri[] = []): Tri[] {
	out.length = 0;
	fuselage(out, STATIONS, HUB, "white", "white");
	canopy(out, [0, 0.62, 1.6], [0, 0.66, -0.9], [0, 1.25, 0.3], 0.48);
	const ail = pose.roll * AILERON_MAX;
	const elev = -pose.pitch * ELEVATOR_MAX;
	for (const side of [1, -1]) {
		const x = (v: number) => v * side;
		// Straight wing with dihedral, red tips, ailerons outboard.
		const rootLe: V3 = [x(0.6), -0.15, 0.9], rootTe: V3 = [x(0.6), -0.15, -0.7];
		const tipLe: V3 = [x(5.2), 0.3, 0.55], tipTe: V3 = [x(5.2), 0.3, -0.45];
		const midLe: V3 = [x(4.0), 0.18, 0.62], midTe: V3 = [x(4.0), 0.18, -0.5];
		const hingeIn: V3 = [x(2.3), 0.02, -0.25], hingeOut: V3 = [x(4.0), 0.18, -0.2];
		quad(out, rootLe, midLe, hingeOut, hingeIn, "white", true);
		quad(out, rootLe, hingeIn, [x(2.3), 0.02, -0.62], rootTe, "white", true);
		quad(out, midLe, tipLe, tipTe, midTe, "trim", true);
		const a = ail * side;
		quad(out, hingeIn, hingeOut, hingeX(midTe, hingeOut, a), hingeX([x(2.3), 0.02, -0.62], hingeIn, a), "trim", true);
		// Tailplane with an elevator.
		const eh: V3 = [0, 0.3, -4.2];
		quad(out, [x(0.2), 0.3, -3.7], [x(1.9), 0.3, -3.9], [x(1.9), 0.3, -4.2], [x(0.2), 0.3, -4.2], "white", true);
		quad(out, [x(0.2), 0.3, -4.2], [x(1.9), 0.3, -4.2], hingeX([x(1.9), 0.3, -4.6], eh, elev), hingeX([x(0.2), 0.3, -4.7], eh, elev), "trim", true);
	}
	// Fin and rudder, which leans into the turn.
	quad(out, [0, 0.5, -3.4], [0, 2.0, -4.2], [0, 2.0, -4.6], [0, 0.5, -4.6], "trim", true);
	const rud = pose.roll * 0.3;
	const rx = (z: number) => Math.sin(rud) * (z + 4.6);
	quad(out, [0, 0.5, -4.6], [0, 2.0, -4.6], [rx(-5.0), 1.9, -5.0], [rx(-5.0), 0.5, -5.0], "white", true);

	// Spinning propeller: a faint disc plus two blades.
	for (let i = 0; i < DISC_SEGMENTS; i++) {
		const a0 = (i / DISC_SEGMENTS) * 6.283, a1 = ((i + 1) / DISC_SEGMENTS) * 6.283;
		out.push({
			a: HUB,
			b: [Math.cos(a0) * PROP_RADIUS, Math.sin(a0) * PROP_RADIUS, HUB[2]],
			c: [Math.cos(a1) * PROP_RADIUS, Math.sin(a1) * PROP_RADIUS, HUB[2]],
			paint: "disc",
			twoSided: true,
		});
	}
	const pa = pose.prop ?? 0;
	for (const off of [0, Math.PI]) {
		const ang = pa + off, c = Math.cos(ang), s = Math.sin(ang);
		const w = 0.16;
		quad(out, [-s * w, c * w, HUB[2] + 0.05], [c * PROP_RADIUS - s * w, s * PROP_RADIUS + c * w, HUB[2] + 0.05],
			[c * PROP_RADIUS + s * w, s * PROP_RADIUS - c * w, HUB[2] + 0.05], [s * w, -c * w, HUB[2] + 0.05], "dark", true);
	}
	return out;
}
