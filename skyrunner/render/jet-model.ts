/** Low-poly fighter jet for the canyon levels. */
import { canopy, fuselage, hingeX, type PlanePose, quad, type Station, type Tri, type V3 } from "./model-kit";

export type { Paint, PlanePose, Tri, V3 } from "./model-kit";

const AILERON_MAX = 0.45; // rad
const STAB_MAX = 0.35; // rad
/** Nozzle position, for the afterburner. */
export const JET_NOZZLE_Z = -5.6;

const STATIONS: readonly Station[] = [
	[JET_NOZZLE_Z, 0.75, 0.55, 0.05],
	[-3.2, 1.0, 0.7, 0.1],
	[0.5, 1.05, 0.75, 0.1],
	[3.2, 0.7, 0.6, 0.05],
];
const NOSE: V3 = [0, -0.05, 6.8];

export function buildJet(pose: PlanePose, out: Tri[] = []): Tri[] {
	out.length = 0;
	fuselage(out, STATIONS, NOSE, "body", "dark");
	canopy(out, [0, 0.75, 3.6], [0, 0.85, -0.6], [0, 1.35, 1.7], 0.5);
	const ail = pose.roll * AILERON_MAX;
	const stab = -pose.pitch * STAB_MAX;
	for (const side of [1, -1]) {
		const x = (v: number) => v * side;
		// Swept wing with a red tip and an aileron on the outer trailing edge.
		const rootLe: V3 = [x(0.9), 0, 1.6], rootTe: V3 = [x(0.9), 0, -3.0];
		const tipLe: V3 = [x(5.0), -0.1, -2.1], tipTe: V3 = [x(5.0), -0.1, -3.2];
		const midLe: V3 = [x(4.2), -0.08, -1.4];
		const hingeIn: V3 = [x(2.4), -0.04, -2.6], hingeOut: V3 = [x(4.2), -0.08, -2.75];
		quad(out, rootLe, midLe, hingeOut, hingeIn, "body", true);
		quad(out, rootLe, hingeIn, [x(2.4), -0.04, -3.05], rootTe, "body", true);
		quad(out, midLe, tipLe, tipTe, hingeOut, "trim", true);
		const a = ail * side;
		const aIn = hingeX([x(2.4), -0.04, -3.1], hingeIn, a), aOut = hingeX([x(4.2), -0.08, -3.2], hingeOut, a);
		quad(out, hingeIn, hingeOut, aOut, aIn, "body", true);
		// All-moving tailplane, pivoting about its own spar.
		const pivot: V3 = [0, 0.05, -4.8];
		const sp = (p: V3) => hingeX(p, pivot, stab);
		quad(out, sp([x(0.7), 0.05, -4.0]), sp([x(2.6), 0.0, -5.2]), sp([x(2.6), 0.0, -5.9]), sp([x(0.7), 0.05, -5.9]), "body", true);
		// Twin fins canted outward.
		quad(out, [x(0.6), 0.55, -3.3], [x(1.25), 2.5, -4.9], [x(1.15), 2.5, -5.8], [x(0.6), 0.55, -5.6], "trim", true);
	}
	return out;
}
