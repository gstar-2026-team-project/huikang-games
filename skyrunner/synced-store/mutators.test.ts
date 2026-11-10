import { expect, test } from "bun:test";
import { getLeaderboard } from "poe-tiles-sdk/v1/client.js";
import { createPoeTileTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import type { AppReadContext } from "../client";
import { tileBackendConfig } from "./backend-config";
import { dailyBoardId, LEADERBOARD_ID } from "./constants";
import { readMyRun } from "./data/index";
import { readView } from "./data/view";

const DAY = "2025-06-12";
import type { AppSchema } from "./schema";
import { FINALE_LEVEL } from "../game/levels";
import { MISSION_RINGS } from "../game/mission";
import { daySeed, levelSeed, levelSpec } from "../game/modes";

const board = (ctx: AppReadContext) => getLeaderboard(ctx, { leaderboardId: LEADERBOARD_ID });

async function setup() {
	const harness = createPoeTileTestHarness<AppSchema>({ store: { backendConfig: tileBackendConfig } });
	const alice = await harness.createClient({ userId: "alice", userInfo: { displayName: "Alice" } });
	const bob = await harness.createClient({ userId: "bob", userInfo: { displayName: "Bob" } });
	return { harness, alice: alice.store, bob: bob.store };
}

async function waitUntil(check: () => Promise<boolean>, ms = 3000): Promise<void> {
	const end = Date.now() + ms;
	while (!(await check())) {
		if (Date.now() > end) throw new Error("timed out");
		await new Promise((r) => setTimeout(r, 20));
	}
}

test("one pilot's finished flight reaches the other pilot's leaderboard, but the run stays private", async () => {
	const { harness, alice, bob } = await setup();
	try {
		await (await alice.mutate.startRun({ runId: "r1", seed: 4, startedAt: 1000 })).confirmed;
		await (await alice.mutate.passRing({ runId: "r1", rings: 1 })).confirmed;
		await (await alice.mutate.passRing({ runId: "r1", rings: 2 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "r1", rings: 3, endedAt: 2000, reason: "ground" })).confirmed;

		await waitUntil(async () => (await bob.query(board)).entries.length === 1);
		const seen = await bob.query(board);
		expect(seen.entries[0]).toMatchObject({ userId: "alice", score: 3 });
		const pilot = await bob.query((ctx: AppReadContext) => ctx.table("pilots").get("alice"));
		expect(pilot).toMatchObject({ best: 3, flights: 1, totalRings: 3, lastRings: 3 });

		// Bob sees Alice's public stats, never her private run row.
		expect(await bob.query(readMyRun)).toBeUndefined();
		const aliceRun = await alice.query(readMyRun);
		expect(aliceRun).toMatchObject({ runId: "r1", status: "done", rings: 3, reason: "ground" });
		const bobView = await bob.query(readView(DAY));
		expect(bobView.run).toBeNull();
		expect(bobView.entries).toEqual([{ userId: "alice", score: 3 }]);
	} finally {
		harness.dispose();
	}
});

test("repeating a finish, or a checkpoint arriving late, changes nothing", async () => {
	const { harness, alice, bob } = await setup();
	try {
		await (await alice.mutate.startRun({ runId: "r1", seed: 1, startedAt: 1 })).confirmed;
		await (await alice.mutate.passRing({ runId: "r1", rings: 5 })).confirmed;
		await (await alice.mutate.passRing({ runId: "r1", rings: 2 })).confirmed; // older checkpoint
		expect((await alice.query(readMyRun))?.rings).toBe(5);
		await (await alice.mutate.finishRun({ runId: "r1", rings: 5, endedAt: 10, reason: "time" })).confirmed;
		await (await alice.mutate.finishRun({ runId: "r1", rings: 9, endedAt: 11, reason: "ground" })).confirmed;
		await (await alice.mutate.passRing({ runId: "r1", rings: 9 })).confirmed;
		await (await alice.mutate.startRun({ runId: "r1", seed: 1, startedAt: 1 })).confirmed; // replayed take-off

		const run = await alice.query(readMyRun);
		expect(run).toMatchObject({ status: "done", rings: 5, reason: "time", endedAt: 10 });
		await waitUntil(async () => (await bob.query(board)).entries.length === 1);
		expect((await bob.query(board)).entries[0]?.score).toBe(5);
		const pilot = await bob.query((ctx: AppReadContext) => ctx.table("pilots").get("alice"));
		expect(pilot?.flights).toBe(1);
	} finally {
		harness.dispose();
	}
});

test("a lower score never replaces a best, and a zero-ring flight posts no score", async () => {
	const { harness, alice } = await setup();
	try {
		await (await alice.mutate.startRun({ runId: "a", seed: 1, startedAt: 1 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "a", rings: 0, endedAt: 2, reason: "ground" })).confirmed;
		expect((await alice.query(board)).entries).toHaveLength(0);
		await (await alice.mutate.startRun({ runId: "b", seed: 2, startedAt: 3 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "b", rings: 7, endedAt: 4, reason: "time" })).confirmed;
		await (await alice.mutate.startRun({ runId: "c", seed: 3, startedAt: 5 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "c", rings: 4, endedAt: 6, reason: "time" })).confirmed;
		expect((await alice.query(board)).entries[0]?.score).toBe(7);
		const pilot = await alice.query((ctx: AppReadContext) => ctx.table("pilots").get("alice"));
		expect(pilot).toMatchObject({ best: 7, flights: 3, totalRings: 11, lastRings: 4 });
	} finally {
		harness.dispose();
	}
});

test("a flight left open counts as flown, and progress survives a reload", async () => {
	const { harness, alice } = await setup();
	try {
		await (await alice.mutate.startRun({ runId: "open", seed: 1, startedAt: 1 })).confirmed;
		await (await alice.mutate.passRing({ runId: "open", rings: 4 })).confirmed;
		// Taking off again without finishing settles the open flight first.
		await (await alice.mutate.startRun({ runId: "next", seed: 2, startedAt: 50 })).confirmed;

		const fresh = await harness.createClient({ userId: "alice" });
		await waitUntil(async () => (await fresh.store.query(readView(DAY))).pilot?.flights === 1);
		const view = await fresh.store.query(readView(DAY));
		expect(view.pilot).toMatchObject({ best: 4, flights: 1 });
		expect(view.run).toMatchObject({ runId: "next", status: "flying", rings: 0 });
		expect(view.entries).toEqual([{ userId: "alice", score: 4 }]);
	} finally {
		harness.dispose();
	}
});

test("everyone flies the same daily course, and their best lands on that day's board", async () => {
	const { harness, alice, bob } = await setup();
	try {
		await (await alice.mutate.startRun({ runId: "a1", seed: 1, startedAt: 1, mode: "daily", day: DAY })).confirmed;
		await (await bob.mutate.startRun({ runId: "b1", seed: 999, startedAt: 1, mode: "daily", day: DAY })).confirmed;
		const aRun = await alice.query(readMyRun);
		const bRun = await bob.query(readMyRun);
		expect(aRun?.seed).toBe(bRun?.seed);
		expect(aRun?.seed).toBe(daySeed(DAY));
		await (await alice.mutate.finishRun({ runId: "a1", rings: 4, endedAt: 5, reason: "ground" })).confirmed;
		await (await bob.mutate.finishRun({ runId: "b1", rings: 6, endedAt: 6, reason: "time" })).confirmed;
		await waitUntil(async () => (await alice.query(readView(DAY))).daily.length === 2);
		const view = await alice.query(readView(DAY));
		expect(view.daily).toContainEqual({ userId: "bob", score: 6, seconds: 40 });
		expect(view.entries).toEqual([]); // daily flights do not touch the free-flight board
		expect((await alice.query(readView("2025-06-13"))).daily).toEqual([]);
	} finally {
		harness.dispose();
	}
});

test("levels are all open, earn stars only when finished, and keep the best", async () => {
	const { harness, alice } = await setup();
	try {
		const total = levelSpec(1).ringCount ?? 0;
		// Any level can be flown first.
		await (await alice.mutate.startRun({ runId: "l12", seed: 1, startedAt: 1, mode: "level", level: 12 })).confirmed;
		expect(await alice.query(readMyRun)).toMatchObject({ runId: "l12", level: 12, seed: levelSeed(12) });
		// Crashing earns nothing even with rings hit.
		await (await alice.mutate.startRun({ runId: "x", seed: 1, startedAt: 2, mode: "level", level: 1 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "x", rings: total - 1, endedAt: 3, reason: "ground" })).confirmed;
		expect((await alice.query(readView(DAY))).stars).toEqual([]);
		// A finished course with one miss is two stars, then a perfect run makes three.
		await (await alice.mutate.startRun({ runId: "y", seed: 1, startedAt: 4, mode: "level", level: 1 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "y", rings: total - 1, endedAt: 5, reason: "complete" })).confirmed;
		expect((await alice.query(readView(DAY))).stars).toEqual([2]);
		await (await alice.mutate.startRun({ runId: "z", seed: 1, startedAt: 6, mode: "level", level: 1 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "z", rings: total + 50, endedAt: 7, reason: "complete" })).confirmed;
		await (await alice.mutate.startRun({ runId: "w", seed: 1, startedAt: 8, mode: "level", level: 1 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "w", rings: 0, endedAt: 9, reason: "complete" })).confirmed;
		expect((await alice.query(readView(DAY))).stars).toEqual([3]);
		expect((await alice.query(readMyRun))?.seed).toBe(levelSeed(1));
		// And another.
		await (await alice.mutate.startRun({ runId: "l2b", seed: 1, startedAt: 10, mode: "level", level: 2 })).confirmed;
		expect(await alice.query(readMyRun)).toMatchObject({ runId: "l2b", mode: "level", level: 2, seed: levelSeed(2) });
	} finally {
		harness.dispose();
	}
});

test("the last level is the mission course: it needs the target hit, and its stars sit with the other levels", async () => {
	const { harness, alice } = await setup();
	try {
		await (await alice.mutate.startRun({ runId: "f0", seed: 9, startedAt: 1, mode: "level", level: FINALE_LEVEL })).confirmed;
		await (await alice.mutate.finishRun({ runId: "f0", rings: MISSION_RINGS - 1, endedAt: 2, reason: "complete", targetHit: false })).confirmed;
		expect((await alice.query(readView(DAY))).stars[FINALE_LEVEL - 1] ?? 0).toBe(0);
		await (await alice.mutate.startRun({ runId: "f1", seed: 9, startedAt: 3, mode: "level", level: FINALE_LEVEL })).confirmed;
		await (await alice.mutate.finishRun({ runId: "f1", rings: MISSION_RINGS + 9, endedAt: 4, reason: "complete", targetHit: true })).confirmed;
		const view = await alice.query(readView(DAY));
		expect(view.stars[FINALE_LEVEL - 1]).toBe(3);
		expect(view.run?.rings).toBe(MISSION_RINGS);
	} finally {
		harness.dispose();
	}
});

test("the daily board ranks rings first, then the sooner last ring, and keeps each pilot's best", async () => {
	const { harness, alice, bob } = await setup();
	try {
		const fly = async (who: typeof alice, id: string, rings: number, lastRingAt: number) => {
			await (await who.mutate.startRun({ runId: id, seed: 1, startedAt: 1, mode: "daily", day: DAY })).confirmed;
			await (await who.mutate.finishRun({ runId: id, rings, endedAt: 2, reason: "time", lastRingAt })).confirmed;
		};
		await fly(alice, "a1", 9, 36.2);
		await fly(bob, "b1", 9, 33.8);
		await fly(alice, "a2", 8, 20); // fewer rings: not a new best
		await waitUntil(async () => (await alice.query(readView(DAY))).daily.length === 2);
		const board = await alice.query((ctx: AppReadContext) => getLeaderboard(ctx, { leaderboardId: dailyBoardId(DAY) }));
		expect(board.entries.map((e) => e.userId)).toEqual(["bob", "alice"]);
		expect(board.entries[0]?.displayScore).toBe("9 rings · 33.8 s");
		const view = await alice.query(readView(DAY));
		expect(view.daily).toContainEqual({ userId: "alice", score: 9, seconds: 36.2 });
		// Same rings, sooner: alice takes the lead.
		await fly(alice, "a3", 9, 31);
		await waitUntil(async () => (await alice.query(readView(DAY))).daily.some((e) => e.userId === "alice" && e.seconds === 31));
		const after = await bob.query((ctx: AppReadContext) => getLeaderboard(ctx, { leaderboardId: dailyBoardId(DAY) }));
		expect(after.entries[0]?.userId).toBe("alice");
	} finally {
		harness.dispose();
	}
});
