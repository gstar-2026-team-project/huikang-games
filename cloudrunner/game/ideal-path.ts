import { heightToGlide, type Plan } from "./autopilot";
import { glideRatio, type Sim } from "./flight";
import { terrainHeight } from "./terrain";
import { CLOUD_BASE } from "./thermals";

/** Points sampled along each leg (glider to thermal, thermal to turnpoint). */
export const PATH_SAMPLES_PER_LEG = 10;
/** Length of the flat [x, y, z] buffer `idealPath` fills. */
export const PATH_BUFFER_LENGTH = (2 * PATH_SAMPLES_PER_LEG + 2) * 3;
/** The line stays at least this far above the ground (m), so it never dives into a hill. */
const PATH_FLOOR = 25;
/** Speed whose glide slope the line is drawn at (m/s). */
const PATH_SPEED = 48;

/**
 * The autopilot's plan as a line to fly: from the glider down the glide slope
 * to the thermal it would use (if any), up the thermal to the height the next
 * leg needs, and down the glide slope to the turnpoint. Writes flat [x, y, z]
 * triples into `out` and returns how many points it wrote.
 */
export function idealPath(sim: Sim, plan: Plan, out: Float32Array | number[]): number {
	const p = sim.plane;
	const slope = 1 / glideRatio(PATH_SPEED);
	let count = 0;
	const put = (x: number, y: number, z: number) => {
		out[count * 3] = x;
		out[count * 3 + 1] = Math.max(y, terrainHeight(sim.terr, x, z) + PATH_FLOOR);
		out[count * 3 + 2] = z;
		count++;
	};
	let x = p.x, y = p.y, z = p.z;
	const leg = (tx: number, tz: number) => {
		const dist = Math.hypot(tx - x, tz - z);
		for (let s = 1; s <= PATH_SAMPLES_PER_LEG; s++) {
			const f = s / PATH_SAMPLES_PER_LEG;
			put(x + (tx - x) * f, y - dist * f * slope, z + (tz - z) * f);
		}
		y -= dist * slope;
		x = tx;
		z = tz;
	};
	out[0] = x;
	out[1] = y;
	out[2] = z;
	count = 1;
	const tp = plan.turnpoint;
	const th = plan.thermal;
	if (th) {
		leg(th.x, th.z);
		if (tp) {
			// The climb: straight up the thermal to the height the leg to the beacon needs.
			y = Math.max(y, Math.min(CLOUD_BASE - 60, heightToGlide(sim.terr, th.x, th.z, tp.x, tp.z, 0)));
			put(x, y, z);
		}
	}
	if (tp) leg(tp.x, tp.z);
	return count;
}
