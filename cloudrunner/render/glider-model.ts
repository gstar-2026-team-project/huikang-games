/** Low-poly sailplane: a slim pod-and-boom fuselage, long slender wings and a T-tail. No engine. */
import { canopy, fuselage, hingeX, type PlanePose, quad, type Station, type Tri, type V3 } from "./model-kit";

const AILERON_MAX = 0.4; // rad
const ELEVATOR_MAX = 0.45; // rad
/** Half the wingspan and the fuselage length (m): the wings are far longer than the body is wide. */
export const HALF_SPAN = 7.5;
export const NOSE_Z = 3;
export const TAIL_Z = -5;
const NOSE: V3 = [0, -0.05, NOSE_Z];
/** Height of the tailplane, on top of the fin. */
const TAIL_TOP = 1.55;

const STATIONS: readonly Station[] = [
	[-4.6, 0.1, 0.12, 0.3],
	[-1.2, 0.17, 0.2, 0.16],
	[0.4, 0.42, 0.5, 0.02],
	[1.8, 0.4, 0.46, 0],
];

export function buildGlider(pose: PlanePose, out: Tri[] = []): Tri[] {
	out.length = 0;
	fuselage(out, STATIONS, NOSE, "body", "body");
	canopy(out, [0, 0.36, 2.3], [0, 0.5, 0.3], [0, 0.8, 1.3], 0.34);
	const ail = pose.roll * AILERON_MAX;
	const elev = -pose.pitch * ELEVATOR_MAX;
	for (const side of [1, -1]) {
		const x = (v: number) => v * side;
		// Shoulder wing with dihedral: a white inner panel, a red outer panel with the aileron.
		const rootLe: V3 = [x(0.3), 0.44, 0.78], rootTe: V3 = [x(0.3), 0.44, -0.24];
		const midLe: V3 = [x(5), 0.8, 0.52], midTe: V3 = [x(5), 0.8, -0.12], midHinge: V3 = [x(5), 0.8, 0.04];
		const tipLe: V3 = [x(HALF_SPAN), 1, 0.36], tipTe: V3 = [x(HALF_SPAN), 1, -0.04], tipHinge: V3 = [x(HALF_SPAN), 1, 0.08];
		quad(out, rootLe, midLe, midTe, rootTe, "body", true);
		quad(out, midLe, tipLe, tipHinge, midHinge, "trim", true);
		const a = ail * side;
		quad(out, midHinge, tipHinge, hingeX(tipTe, tipHinge, a), hingeX(midTe, midHinge, a), "trim", true);
		// Tailplane on top of the fin, with an elevator.
		const eh: V3 = [0, TAIL_TOP, -4.7];
		quad(out, [x(0), TAIL_TOP, -4.25], [x(1.5), TAIL_TOP, -4.45], [x(1.5), TAIL_TOP, -4.7], [x(0), TAIL_TOP, -4.7], "body", true);
		quad(out, [x(0), TAIL_TOP, -4.7], [x(1.5), TAIL_TOP, -4.7], hingeX([x(1.5), TAIL_TOP, -4.95], eh, elev), hingeX([x(0), TAIL_TOP, TAIL_Z], eh, elev), "trim", true);
	}
	// Fin, and a rudder that leans into the turn.
	quad(out, [0, 0.3, -3.7], [0, TAIL_TOP, -4.25], [0, TAIL_TOP, -4.7], [0, 0.3, -4.6], "body", true);
	const rud = pose.roll * 0.3;
	const rx = (z: number) => Math.sin(rud) * (z + 4.6);
	quad(out, [0, 0.3, -4.6], [0, TAIL_TOP - 0.1, -4.7], [rx(TAIL_Z), TAIL_TOP - 0.15, TAIL_Z], [rx(-4.92), 0.3, -4.92], "trim", true);
	return out;
}
