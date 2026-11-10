/**
 * Level 6: a short hand-built run. Low along the river, one hard 90° right
 * corner, a pull-up over the ridge, then a dive that ends on the target.
 */
import type { Ring } from "./course";
import type { CourseSpec } from "./modes";

const LOW = 40;
/** Corner radius the course allows (m): a cruising plane turns tighter, a flat-out one wider. */
export const CORNER_RADIUS = 400;

// Absolute ring positions (x right/east, z north). After ring 1 the canyon turns
// right through a quarter circle of CORNER_RADIUS and runs east to ring 2.
const R = CORNER_RADIUS;
const RINGS: readonly (Omit<Ring, "hit"> & { callout?: string })[] = [
	{ x: 0, y: LOW, z: 450, yaw: 0, r: 30 },
	{ x: 0, y: LOW, z: 1000, yaw: 0, r: 28, callout: "Hard right: ease off!" },
	{ x: R + 100, y: LOW, z: 1000 + R, yaw: Math.PI / 2, r: 30, callout: "Pull up!" },
	{ x: R + 600, y: 190, z: 1000 + R, yaw: Math.PI / 2, r: 30 },
	{ x: R + 1100, y: 345, z: 1000 + R, yaw: Math.PI / 2, r: 30, callout: "Dive onto the target!" },
	{ x: R + 1640, y: 200, z: 1000 + R, yaw: Math.PI / 2, r: 28 },
	{ x: R + 2180, y: 46, z: 1000 + R, yaw: Math.PI / 2, r: 24, target: true },
];

export const CORNER_RINGS = RINGS.length;

export const CORNER: CourseSpec = {
	ringCount: RINGS.length,
	startTime: 20,
	radius: (i) => RINGS[i]?.r ?? 28,
	bonus: () => 8,
	turn: () => Math.PI / 2,
	canyon: { halfWidth: 140, wallRun: 160, rim: 260 },
	authored: {
		rings: () => RINGS.map(({ callout: _c, ...r }) => ({ ...r, hit: null })),
		// Callout as the plane heads for ring `next`: shown when the ring before it is passed.
		callout: (next) => RINGS[next - 1]?.callout ?? null,
		tip: "One hard right turn, then up and over.",
		twoStarMisses: 1,
	},
};
