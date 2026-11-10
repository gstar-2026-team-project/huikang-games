import { expect, test } from "bun:test";
import { type Air, airAt, RIDGE_MAX, RIDGE_TOP, ridgeLiftAt, SINK_MIN, SINK_SPREAD, sinkAt, upslopeWind } from "./air";
import { createSim } from "./flight";
import { terrainHeight } from "./terrain";
import { CLOUD_BASE, liftAt, thermalsNear, windOf } from "./thermals";

const SEED = 4242;
const FAR = 20_000;
const sim = createSim(SEED);
const air: Air = { up: 0, vx: 0, vz: 0 };

test("between thermals the air sinks gently, by an amount that shifts across the valley and over time", () => {
	const seen: number[] = [];
	for (let i = 0; i < 400; i++) {
		const s = sinkAt(SEED, FAR + i * 61, FAR - i * 37, i * 2.3);
		expect(s).toBeLessThanOrEqual(-SINK_MIN + 1e-9);
		expect(s).toBeGreaterThanOrEqual(-(SINK_MIN + SINK_SPREAD) - 1e-9);
		seen.push(s);
	}
	// Not a constant: the glide between thermals has something to read.
	expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(SINK_SPREAD * 0.6);
	// Smooth: a short hop changes it only a little.
	expect(Math.abs(sinkAt(SEED, FAR, FAR, 10) - sinkAt(SEED, FAR + 10, FAR, 10.2))).toBeLessThan(0.05);
	expect(sinkAt(SEED, FAR, FAR, 10)).toBe(sinkAt(SEED, FAR, FAR, 10));
});

test("a thermal's core is clean lift, the sink takes over outside it, and above the cloud base the air is still", () => {
	const th = thermalsNear(SEED, FAR, FAR, 60, 1).filter((c) => c.life === 1)[0]!;
	const y = Math.max(400, terrainHeight(sim.terr, th.x, th.z) + RIDGE_TOP + 10);
	airAt(SEED, sim.terr, th.x, y, th.z, 60, air);
	expect(air.up).toBeCloseTo(liftAt(SEED, th.x, y, th.z, 60), 6);
	// Far from every thermal, only the sink is left.
	const quiet = (() => {
		for (let i = 0; ; i++) {
			const x = FAR + i * 97, z = FAR + i * 53;
			if (liftAt(SEED, x, 500, z, 60) === 0 && terrainHeight(sim.terr, x, z) < 500 - RIDGE_TOP) return { x, z };
		}
	})();
	airAt(SEED, sim.terr, quiet.x, 500, quiet.z, 60, air);
	expect(air.up).toBeCloseTo(sinkAt(SEED, quiet.x, quiet.z, 60), 6);
	airAt(SEED, sim.terr, quiet.x, CLOUD_BASE + 10, quiet.z, 60, air);
	expect(air.up).toBe(0);
	// The air drifts with the wind.
	const w = windOf(SEED);
	expect([air.vx, air.vz]).toEqual([w.x, w.z]);
});

test("the wind blowing up a hillside gives slope lift close to the ground, and none on the lee side", () => {
	let windward = 0, lee = 0;
	for (let i = 0; i < 2000; i++) {
		const x = (i % 50) * 83, z = Math.floor(i / 50) * 83;
		const ground = terrainHeight(sim.terr, x, z);
		const up = upslopeWind(SEED, sim.terr, x, z);
		const low = ridgeLiftAt(SEED, sim.terr, x, ground + 20, z);
		expect(low).toBeGreaterThanOrEqual(0);
		expect(low).toBeLessThanOrEqual(RIDGE_MAX);
		expect(ridgeLiftAt(SEED, sim.terr, x, ground + RIDGE_TOP + 1, z)).toBe(0);
		if (up > 0) {
			windward++;
			expect(ridgeLiftAt(SEED, sim.terr, x, ground + 120, z)).toBeLessThan(low + 1e-9);
		} else {
			lee++;
			expect(low).toBe(0);
		}
	}
	expect(windward).toBeGreaterThan(200);
	expect(lee).toBeGreaterThan(200);
});
