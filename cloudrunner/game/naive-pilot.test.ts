import { expect, test } from "bun:test";
import { DT } from "./constants";
import { createSim, groundBelow, NO_CONTROLS, type SimEvent, stepSim } from "./flight";
import { DAILY, DAILY_SECONDS, DAILY_TURNPOINTS, daySeed } from "./modes";
import { NAIVE_BANK, naivePilot, newNaiveState } from "./naive-pilot";

const DAYS = Array.from({ length: 40 }, (_, i) => new Date(Date.UTC(2026, 10, 10) + i * 86_400_000).toISOString().slice(0, 10));
/** The bar: a newcomer doing the obvious thing finishes the daily task on at least this share of days. */
const MOST = 0.75;

test("the obvious strategy works: fly to the nearest cloud, hold half bank while climbing, then head for the beacon", () => {
	expect(NAIVE_BANK).toBe(0.5);
	let finished = 0;
	const times: number[] = [];
	for (const day of DAYS) {
		const sim = createSim(daySeed(day), DAILY);
		const state = newNaiveState();
		const events: SimEvent[] = [];
		let gained = 0;
		while (sim.phase === "flying") {
			const ctl = naivePilot(sim, state, sim.plane.y - groundBelow(sim));
			const y = sim.plane.y;
			stepSim(sim, ctl, DT, events);
			if (state.mode === "circle" && sim.plane.y > y) gained += sim.plane.y - y;
		}
		if (sim.endReason === "complete") {
			finished++;
			times.push(sim.elapsed);
			expect(sim.next).toBe(DAILY_TURNPOINTS);
			expect(sim.elapsed).toBeLessThan(DAILY_SECONDS);
		}
		// Every flight gets real height out of circling: the lift works for a beginner too.
		expect(gained).toBeGreaterThan(150);
	}
	// 33 of these 40 days at the time of tuning.
	expect(finished).toBeGreaterThanOrEqual(Math.ceil(DAYS.length * MOST));
	// And the newcomer is slower than the autopilot, but not by much: there is still a race to win.
	times.sort((a, b) => a - b);
	expect(times[times.length >> 1]!).toBeGreaterThan(200);
});

test("the naive strategy and hands-off flying are deterministic: the same day gives the same flight", () => {
	const run = (pilot: boolean) => {
		const sim = createSim(daySeed(DAYS[3]!), DAILY);
		const state = newNaiveState();
		for (let t = 0; t < 90 && sim.phase === "flying"; t += DT) stepSim(sim, pilot ? naivePilot(sim, state, sim.plane.y - groundBelow(sim)) : NO_CONTROLS, DT, []);
		return { ...sim.plane, vario: sim.vario, next: sim.next };
	};
	expect(run(true)).toEqual(run(true));
	expect(run(false)).toEqual(run(false));
	expect(run(true)).not.toEqual(run(false));
});
