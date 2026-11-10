import { expect, test } from "bun:test";
import { DT } from "./constants";
import { createSim, groundBelow, NO_CONTROLS, type SimEvent, stepSim } from "./flight";
import { legIsFair, MISSION, MISSION_RINGS, MISSION_SEED, MISSION_TARGET, missionCallout, missionPhase, missionStars } from "./mission";
import { surfaceHeight } from "./terrain";

test("the mission is one fixed course in four phases, ending on a climb", () => {
	const a = createSim(MISSION_SEED, MISSION), b = createSim(MISSION_SEED, MISSION);
	expect(a.rings).toEqual(b.rings);
	expect(a.rings).toHaveLength(MISSION_RINGS);
	expect(a.rings[MISSION_TARGET]?.target).toBe(true);
	const phases = a.rings.map((_, i) => missionPhase(i));
	expect([...new Set(phases)]).toEqual(["ingress", "popup", "attack", "egress"]);
	// Pop-up climbs, the attack dives to the lowest point, egress climbs highest.
	const ys = a.rings.map((r) => r.y);
	const target = ys[MISSION_TARGET] ?? 0;
	expect(Math.max(...ys.slice(6, 9))).toBeGreaterThan(400);
	expect(target).toBeLessThan(60);
	expect(ys.at(-1) ?? 0).toBeGreaterThan(500);
	expect(missionCallout(6)).toBe("Pop up!");
	expect(missionCallout(9)).toBe("Target ahead: dive!");
	expect(missionCallout(12)).toBe("Pull up!");
	expect(missionCallout(3)).toBeNull();
});

test("every leg is flyable and the straight line between rings clears the ground", () => {
	const sim = createSim(MISSION_SEED, MISSION);
	for (let i = 0; i < MISSION_RINGS; i++) expect(legIsFair(i)).toBe(true);
	const pts = [{ x: 0, y: sim.plane.y, z: 0 }, ...sim.rings];
	for (let i = 1; i < pts.length; i++) {
		const a = pts[i - 1]!, b = pts[i]!;
		for (let k = 0; k <= 40; k++) {
			const f = k / 40;
			const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f;
			expect(y - surfaceHeight(sim.terrain, x, z)).toBeGreaterThan(20);
		}
	}
	// Low ingress over water, between real walls.
	expect(groundBelow(sim)).toBe(0);
	const r = sim.rings[2]!;
	expect(sim.terrain.height(r.x + Math.cos(r.yaw) * 320, r.z - Math.sin(r.yaw) * 320)).toBeGreaterThan(200);
});

test("stars need a finished run that hit the target", () => {
	expect(missionStars(MISSION_RINGS, true, true)).toBe(3);
	expect(missionStars(MISSION_RINGS - 2, true, true)).toBe(2);
	expect(missionStars(5, true, true)).toBe(1);
	expect(missionStars(MISSION_RINGS - 1, true, false)).toBe(0);
	expect(missionStars(MISSION_RINGS, false, true)).toBe(0);
});

test("flying ring to ring completes the mission with the target hit", () => {
	const sim = createSim(MISSION_SEED, MISSION);
	const events: SimEvent[] = [];
	for (let i = 0; i < 400 && sim.phase === "flying"; i++) {
		const r = sim.rings[sim.next];
		if (r) sim.plane = { ...sim.plane, x: r.x - Math.sin(r.yaw) * 0.5, y: r.y, z: r.z - Math.cos(r.yaw) * 0.5, yaw: r.yaw, pitch: 0 };
		stepSim(sim, NO_CONTROLS, DT, events);
	}
	expect(sim.endReason).toBe("complete");
	expect(sim.score).toBe(MISSION_RINGS);
	expect(sim.rings[MISSION_TARGET]?.hit).toBe(true);
});
