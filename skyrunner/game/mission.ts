/**
 * The strike mission: one hand-built course in four phases, shaped like the
 * classic low-level run. Ingress low down a twisting canyon, pop up over the
 * ridge, dive onto a target, then climb hard out over the far mountains.
 */
import { CentreLine, type PathPoint, sampleSpline } from "./canyon";
import { maxClimbFor, maxTurnFor, type Ring } from "./course";
import type { CourseSpec } from "./modes";
import { type Terrain, type TerrainPhases, terrainHeight } from "./terrain";

export const MISSION_SEED = 7_331;

export type MissionPhase = "ingress" | "popup" | "attack" | "egress";

/** One ring of the authored route: distance from the previous ring, heading change, height, size. */
interface Leg { dist: number; turn: number; y: number; r: number; phase: MissionPhase; target?: boolean }

const LOW = 40; // ring centre over the river: low enough to feel the water
const LEGS: readonly Leg[] = [
	// Ingress: tight S-turns just above the water.
	{ dist: 450, turn: 0, y: LOW, r: 27, phase: "ingress" },
	{ dist: 540, turn: 0.32, y: LOW, r: 27, phase: "ingress" },
	{ dist: 540, turn: -0.4, y: LOW, r: 26, phase: "ingress" },
	{ dist: 540, turn: -0.35, y: LOW, r: 26, phase: "ingress" },
	{ dist: 540, turn: 0.4, y: LOW, r: 25, phase: "ingress" },
	{ dist: 540, turn: 0.35, y: LOW, r: 25, phase: "ingress" },
	// Pop-up: a steep climb over the ridge.
	{ dist: 520, turn: 0, y: 190, r: 30, phase: "popup" },
	{ dist: 520, turn: -0.1, y: 345, r: 30, phase: "popup" },
	{ dist: 520, turn: -0.1, y: 500, r: 30, phase: "popup" },
	// Attack: dive onto the target near the valley floor.
	{ dist: 540, turn: -0.2, y: 335, r: 28, phase: "attack" },
	{ dist: 540, turn: 0, y: 170, r: 26, phase: "attack" },
	{ dist: 540, turn: 0, y: 46, r: 22, phase: "attack", target: true },
	// Egress: pull up and out over the far mountains.
	{ dist: 560, turn: 0.15, y: 215, r: 30, phase: "egress" },
	{ dist: 560, turn: 0.1, y: 385, r: 30, phase: "egress" },
	{ dist: 560, turn: 0, y: 555, r: 32, phase: "egress" },
];

export const MISSION_RINGS = LEGS.length;
export const MISSION_TARGET = LEGS.findIndex((l) => l.target);
export const missionPhase = (index: number): MissionPhase => LEGS[index]?.phase ?? "egress";

/** Callout shown as the player reaches a ring, when that ring opens a new phase. */
export function missionCallout(index: number): string | null {
	const phase = missionPhase(index), prev = index > 0 ? missionPhase(index - 1) : null;
	if (phase === prev) return null;
	return phase === "popup" ? "Pop up!" : phase === "attack" ? "Target ahead: dive!" : phase === "egress" ? "Pull up!" : null;
}

export const MISSION: CourseSpec = {
	ringCount: LEGS.length,
	startTime: 20,
	radius: (i) => LEGS[i]?.r ?? 26,
	bonus: () => 8.5,
	turn: () => 0.6,
	canyon: { halfWidth: 140, wallRun: 160, rim: 280 },
	authored: {
		rings: () => missionRings(),
		callout: (next) => missionCallout(next),
		tip: "Stay low. Ease off in the turns.",
		twoStarMisses: 2,
	},
};

export function missionRings(): Ring[] {
	const rings: Ring[] = [];
	let x = 0, z = 0, yaw = 0;
	for (const leg of LEGS) {
		yaw += leg.turn;
		x += Math.sin(yaw) * leg.dist;
		z += Math.cos(yaw) * leg.dist;
		rings.push({ x, y: leg.y, z, yaw, r: leg.r, hit: null, ...(leg.target ? { target: true } : {}) });
	}
	return rings;
}

/** Ground clearance kept under the authored flight path. */
const PATH_CLEARANCE = 65;
const LEAD_IN = 900;
const RUN_OUT = 1600;

/**
 * Mountains everywhere, with a notch carved along the route whose floor sits
 * PATH_CLEARANCE below the flight path: a river canyon while the route is low,
 * a ridge you climb over, a valley you dive into, and a slope you climb out of.
 */
export function missionTerrain(phases: TerrainPhases, rings: readonly Ring[], spec: CourseSpec): Terrain {
	const dims = spec.canyon ?? { halfWidth: 115, wallRun: 150, rim: 280 };
	const first = rings[0], last = rings[rings.length - 1];
	const pts: PathPoint[] = [{ x: 0, z: -LEAD_IN, y: first?.y ?? LOW }, { x: 0, z: 0, y: first?.y ?? LOW }];
	for (const r of rings) pts.push({ x: r.x, z: r.z, y: r.y });
	if (last) pts.push({ x: last.x + Math.sin(last.yaw) * RUN_OUT, z: last.z + Math.cos(last.yaw) * RUN_OUT, y: last.y });
	const line = new CentreLine(sampleSpline(pts), dims.halfWidth + dims.wallRun);
	return {
		snowLine: dims.rim + 170,
		height(x, z) {
			const mountain = dims.rim + 0.5 * terrainHeight(phases, x, z);
			const d = line.distance(x, z);
			if (!Number.isFinite(d)) return mountain;
			const floor = Math.max(0, line.lastY - PATH_CLEARANCE);
			if (mountain <= floor) return mountain;
			if (d <= dims.halfWidth) return floor;
			const t = Math.min(1, (d - dims.halfWidth) / dims.wallRun);
			return floor + t * t * (3 - 2 * t) * (mountain - floor);
		},
	};
}

/** Stars on a hand-built course: it must be finished with the target hit; all rings 3, a few misses 2, else 1. */
export function authoredStars(total: number, twoStarMisses: number, hits: number, completed: boolean, targetHit: boolean): number {
	if (!completed || !targetHit) return 0;
	if (hits >= total) return 3;
	if (hits >= total - twoStarMisses) return 2;
	return 1;
}

export function missionStars(hits: number, completed: boolean, targetHit: boolean): number {
	return authoredStars(MISSION_RINGS, 2, hits, completed, targetHit);
}

/** Sanity bound used by tests: every authored leg is flyable by the flight model. */
export function legIsFair(i: number): boolean {
	const leg = LEGS[i], prev = LEGS[i - 1];
	if (!leg) return false;
	const dy = Math.abs(leg.y - (prev?.y ?? LOW));
	return Math.abs(leg.turn) <= maxTurnFor(leg.dist) && dy <= maxClimbFor(leg.dist);
}
