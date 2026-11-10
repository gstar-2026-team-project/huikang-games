import { expect, test } from "bun:test";
import {
	CLOUD_BASE,
	cloudFade,
	liftAt,
	liftProfile,
	START_THERMAL,
	THERMAL_CELL,
	THERMAL_CORE,
	THERMAL_LIFE_MIN,
	THERMAL_LIFE_SPREAD,
	THERMAL_PERIOD,
	THERMAL_RADIUS_MIN,
	THERMAL_RADIUS_SPREAD,
	THERMAL_STRENGTH_MIN,
	THERMAL_STRENGTH_SPREAD,
	type Thermal,
	THERMAL_INFLOW,
	type ThermalAir,
	thermalAirAt,
	thermalsNear,
	WIND_MIN,
	WIND_SPREAD,
	windOf,
} from "./thermals";

const SEED = 4242;
/** A point far from the launch, so the opening thermal is not in the way. */
const FAR = 20_000;

/** Follow one thermal by id from when it is first seen until it is gone. */
function lifeOf(id: number, x: number, z: number, from: number): { seen: Thermal[]; times: number[] } {
	const seen: Thermal[] = [], times: number[] = [];
	for (let t = from; t < from + 2 * THERMAL_PERIOD; t += 0.5) {
		const th = thermalsNear(SEED, x, z, t, 2).find((c) => c.id === id);
		if (th) {
			seen.push(th);
			times.push(t);
		} else if (seen.length) break;
	}
	return { seen, times };
}

test("the field is a pure function of seed, place and time", () => {
	const a = thermalsNear(SEED, FAR, FAR, 37.5, 2);
	expect(thermalsNear(SEED, FAR, FAR, 37.5, 2)).toEqual(a);
	expect(a.length).toBeGreaterThan(5);
	expect(thermalsNear(SEED + 1, FAR, FAR, 37.5, 2)).not.toEqual(a);
	expect(liftAt(SEED, a[0]!.x, 500, a[0]!.z, 37.5)).toBe(liftAt(SEED, a[0]!.x, 500, a[0]!.z, 37.5));
	// The same thermal is reported whichever nearby point asks.
	const b = thermalsNear(SEED, FAR + THERMAL_CELL, FAR, 37.5, 2);
	const shared = a.filter((th) => b.some((o) => o.id === th.id));
	expect(shared.length).toBeGreaterThan(3);
	for (const th of shared) expect(b.find((o) => o.id === th.id)).toEqual(th);
});

test("every thermal stays within the tuned ranges", () => {
	let count = 0;
	for (let t = 0; t < 300; t += 7) {
		for (const th of thermalsNear(SEED, FAR, FAR, t, 3)) {
			count++;
			expect(th.radius).toBeGreaterThanOrEqual(THERMAL_RADIUS_MIN);
			expect(th.radius).toBeLessThanOrEqual(THERMAL_RADIUS_MIN + THERMAL_RADIUS_SPREAD);
			expect(th.peak).toBeGreaterThanOrEqual(THERMAL_STRENGTH_MIN);
			expect(th.peak).toBeLessThanOrEqual(THERMAL_STRENGTH_MIN + THERMAL_STRENGTH_SPREAD);
			expect(th.strength).toBeLessThanOrEqual(th.peak);
			expect(th.life).toBeGreaterThanOrEqual(0);
			expect(th.life).toBeLessThanOrEqual(1);
			expect(th.remaining).toBeGreaterThan(0);
			expect(th.remaining).toBeLessThanOrEqual(THERMAL_LIFE_MIN + THERMAL_LIFE_SPREAD);
		}
	}
	expect(count).toBeGreaterThan(500);
});

test("a thermal is born, builds, holds, fades and dies while it drifts with the wind", () => {
	const young = thermalsNear(SEED, FAR, FAR, 100, 1).filter((th) => th.remaining > 35)[0]!;
	const { seen, times } = lifeOf(young.id, young.x, young.z, 100);
	const first = seen[0]!, last = seen[seen.length - 1]!;
	const span = times[times.length - 1]! - times[0]!;
	expect(span).toBeGreaterThan(30);
	expect(span).toBeLessThanOrEqual(THERMAL_LIFE_MIN + THERMAL_LIFE_SPREAD);
	// Full strength in the middle, nearly nothing just before the end.
	expect(Math.max(...seen.map((th) => th.strength))).toBeCloseTo(first.peak, 5);
	expect(last.strength).toBeLessThan(first.peak * 0.1);
	expect(last.life).toBeLessThan(0.1);
	// It moved downwind at the seed's wind speed.
	const wind = windOf(SEED);
	const speed = Math.hypot(wind.x, wind.z);
	expect(speed).toBeGreaterThanOrEqual(WIND_MIN);
	expect(speed).toBeLessThanOrEqual(WIND_MIN + WIND_SPREAD);
	expect(last.x - first.x).toBeCloseTo(wind.x * span, 3);
	expect(last.z - first.z).toBeCloseTo(wind.z * span, 3);
	// Radius and peak are fixed for its life.
	expect(last.radius).toBe(first.radius);
	expect(last.peak).toBe(first.peak);
});

test("the air changes during a flight: thermals alive at the start are gone a period later, and new ones have taken over", () => {
	const before = thermalsNear(SEED, FAR, FAR, 10, 2);
	const after = thermalsNear(SEED, FAR, FAR, 10 + THERMAL_PERIOD, 2);
	expect(after.length).toBeGreaterThan(5);
	expect(after.some((th) => before.some((o) => o.id === th.id))).toBe(false);
	// A place lifting now can be dead air a little later.
	const th = before.filter((c) => c.remaining < 20 && c.strength > 5)[0]!;
	expect(liftAt(SEED, th.x, 500, th.z, 10)).toBeGreaterThan(5);
	const wind = windOf(SEED);
	const later = 10 + th.remaining + 1;
	expect(liftAt(SEED, th.x + wind.x * (later - 10), 500, th.z + wind.z * (later - 10), later)).toBeLessThan(th.strength);
});

test("lift is a smooth bell: strongest in the core, easing to zero at the edge, and fading out under the cloud base", () => {
	expect(liftProfile(0, 300)).toBe(1);
	// Strictly falling outward, with no step anywhere: the variometer moves continuously.
	let prev = 1;
	for (let d = 5; d <= 300; d += 5) {
		const k = liftProfile(d, 300);
		expect(k).toBeLessThan(prev);
		expect(prev - k).toBeLessThan(0.06);
		prev = k;
	}
	expect(liftProfile(300 * THERMAL_CORE, 300)).toBeGreaterThan(0.4);
	expect(liftProfile(300 * 0.7, 300)).toBeLessThan(0.15);
	expect(liftProfile(300, 300)).toBe(0);
	expect(liftProfile(400, 300)).toBe(0);
	expect(cloudFade(300)).toBe(1);
	expect(cloudFade(CLOUD_BASE - 30)).toBeGreaterThan(0);
	expect(cloudFade(CLOUD_BASE - 30)).toBeLessThan(0.5);
	expect(cloudFade(CLOUD_BASE)).toBe(0);
	expect(cloudFade(CLOUD_BASE + 200)).toBe(0);

	const th = thermalsNear(SEED, FAR, FAR, 60, 1).filter((c) => c.life === 1)[0]!;
	expect(liftAt(SEED, th.x, 400, th.z, 60)).toBeCloseTo(th.peak, 5);
	expect(liftAt(SEED, th.x + th.radius * 0.8, 400, th.z, 60)).toBeLessThan(th.peak * 0.5);
	expect(liftAt(SEED, th.x, CLOUD_BASE + 1, th.z, 60)).toBe(0);
	// Never negative, anywhere: the sink between thermals is the air field's job.
	for (let i = 0; i < 200; i++) expect(liftAt(SEED, FAR + i * 37, 300 + i * 4, FAR - i * 53, i * 1.7)).toBeGreaterThanOrEqual(0);
});

test("air flows in toward a thermal's core, so a glider circling in it is drawn to the centre", () => {
	const th = thermalsNear(SEED, FAR, FAR, 60, 1).filter((c) => c.life === 1)[0]!;
	const out: ThermalAir = { lift: 0, vx: 0, vz: 0 };
	for (const a of [0, 1.3, 2.9, 4.4]) {
		const x = th.x + Math.cos(a) * th.radius * 0.5, z = th.z + Math.sin(a) * th.radius * 0.5;
		thermalAirAt(SEED, x, 400, z, 60, out);
		// Pointing at the centre, and no faster than the inflow.
		expect(out.vx * (th.x - x) + out.vz * (th.z - z)).toBeGreaterThan(0);
		expect(Math.hypot(out.vx, out.vz)).toBeLessThanOrEqual(THERMAL_INFLOW + 1e-9);
		expect(Math.hypot(out.vx, out.vz)).toBeGreaterThan(THERMAL_INFLOW * 0.5);
	}
	// Still air far from any thermal, and above the cloud base.
	thermalAirAt(SEED, th.x, CLOUD_BASE + 50, th.z, 60, out);
	expect([out.lift, out.vx, out.vz]).toEqual([0, 0, 0]);
});

test("every seed opens with one healthy thermal just ahead of the launch point", () => {
	for (const seed of [1, 77, 4242, 99_991, 2_000_000_011]) {
		const near = thermalsNear(seed, 0, 0, 0, 1);
		const opening = near.find((th) => th.id === -1)!;
		expect(opening).toBeDefined();
		expect(opening.x).toBe(START_THERMAL.x);
		expect(opening.z).toBe(START_THERMAL.z);
		expect(opening.strength).toBe(START_THERMAL.strength);
		expect(liftAt(seed, START_THERMAL.x, 450, START_THERMAL.z, 0)).toBe(START_THERMAL.strength);
		// It is still going strong when a glider gets there, and it does not last all flight.
		expect(liftAt(seed, START_THERMAL.x + windOf(seed).x * 15, 450, START_THERMAL.z + windOf(seed).z * 15, 15)).toBeGreaterThan(START_THERMAL.strength * 0.95);
		expect(thermalsNear(seed, 0, 0, START_THERMAL.life + 1, 1).some((th) => th.id === -1)).toBe(false);
		// No ordinary thermal crowds it while it lives.
		for (const th of near) {
			if (th.id !== -1 && th.remaining > 40) expect(Math.hypot(th.x - opening.x, th.z - opening.z)).toBeGreaterThan(200);
		}
	}
});
