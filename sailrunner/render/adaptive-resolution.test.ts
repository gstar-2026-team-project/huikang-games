import { expect, test } from "bun:test";
import { AdaptiveResolution } from "./adaptive-resolution";

function run(res: AdaptiveResolution, frameMs: number, frames: number, start = 0): number {
	let t = start;
	for (let i = 0; i < frames; i++) res.frame((t += frameMs));
	return t;
}

test("slow frames lower the resolution step by step, down to a floor", () => {
	const applied: number[] = [];
	const res = new AdaptiveResolution(2, (r) => applied.push(r));
	run(res, 33, 46 * 10);
	expect(applied.length).toBeGreaterThan(2);
	expect(applied[1]!).toBeLessThan(applied[0]!);
	expect(res.ratio).toBeLessThan(2 * 0.5);
	expect(res.ratio).toBeGreaterThanOrEqual(2 * 0.45);
});

test("smooth frames keep full resolution, and headroom climbs back up", () => {
	const applied: number[] = [];
	const res = new AdaptiveResolution(2, (r) => applied.push(r));
	let t = run(res, 16.7, 300);
	expect(applied).toEqual([]);
	t = run(res, 33, 46 * 3, t);
	const low = res.ratio;
	expect(low).toBeLessThan(2);
	run(res, 8, 46 * 20, t);
	expect(res.ratio).toBe(2);
});

test("pauses and idle gaps are not counted as slow frames", () => {
	const applied: number[] = [];
	const res = new AdaptiveResolution(2, (r) => applied.push(r));
	// The idle start screen renders four times a second.
	run(res, 250, 400);
	expect(applied).toEqual([]);
});
