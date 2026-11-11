import { expect, test } from "bun:test";
import { getLeaderboard } from "poe-tiles-sdk/v1/client.js";
import { createPoeTileTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import type { AppReadContext } from "../client";
import { DAILY_SECONDS, DAILY_TURNPOINTS, daySeed } from "../game/modes";
import { tileBackendConfig } from "./backend-config";
import { dailyBoardId, LEADERBOARD_ID } from "./constants";
import { readMyRun } from "./data/index";
import { readView } from "./data/view";
import type { AppSchema } from "./schema";

const DAY = "2025-06-12";

const board = (ctx: AppReadContext) => getLeaderboard(ctx, { leaderboardId: LEADERBOARD_ID });
const dailyBoard = (ctx: AppReadContext) => getLeaderboard(ctx, { leaderboardId: dailyBoardId(DAY) });

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
		await (await alice.mutate.reachTurnpoint({ runId: "r1", turnpoints: 1 })).confirmed;
		await (await alice.mutate.reachTurnpoint({ runId: "r1", turnpoints: 2 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "r1", turnpoints: 3, endedAt: 2000, reason: "ground" })).confirmed;

		await waitUntil(async () => (await bob.query(board)).entries.length === 1);
		const seen = await bob.query(board);
		expect(seen.entries[0]).toMatchObject({ userId: "alice", score: 3 });
		const pilot = await bob.query((ctx: AppReadContext) => ctx.table("pilots").get("alice"));
		expect(pilot).toMatchObject({ best: 3, flights: 1, totalTurnpoints: 3, lastTurnpoints: 3 });

		// Bob sees Alice's public stats, never her private run row.
		expect(await bob.query(readMyRun)).toBeUndefined();
		const aliceRun = await alice.query(readMyRun);
		expect(aliceRun).toMatchObject({ runId: "r1", status: "done", turnpoints: 3, reason: "ground", mode: "free" });
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
		await (await alice.mutate.reachTurnpoint({ runId: "r1", turnpoints: 5 })).confirmed;
		await (await alice.mutate.reachTurnpoint({ runId: "r1", turnpoints: 2 })).confirmed; // older checkpoint
		expect((await alice.query(readMyRun))?.turnpoints).toBe(5);
		await (await alice.mutate.finishRun({ runId: "r1", turnpoints: 5, endedAt: 10, reason: "ground" })).confirmed;
		await (await alice.mutate.finishRun({ runId: "r1", turnpoints: 9, endedAt: 11, reason: "interrupted" })).confirmed;
		await (await alice.mutate.reachTurnpoint({ runId: "r1", turnpoints: 9 })).confirmed;
		await (await alice.mutate.startRun({ runId: "r1", seed: 1, startedAt: 1 })).confirmed; // replayed launch

		const run = await alice.query(readMyRun);
		expect(run).toMatchObject({ status: "done", turnpoints: 5, reason: "ground", endedAt: 10 });
		await waitUntil(async () => (await bob.query(board)).entries.length === 1);
		expect((await bob.query(board)).entries[0]?.score).toBe(5);
		const pilot = await bob.query((ctx: AppReadContext) => ctx.table("pilots").get("alice"));
		expect(pilot?.flights).toBe(1);
	} finally {
		harness.dispose();
	}
});

test("a lower score never replaces a best, and a flight with no beacons posts no score", async () => {
	const { harness, alice } = await setup();
	try {
		await (await alice.mutate.startRun({ runId: "a", seed: 1, startedAt: 1 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "a", turnpoints: 0, endedAt: 2, reason: "ground" })).confirmed;
		expect((await alice.query(board)).entries).toHaveLength(0);
		await (await alice.mutate.startRun({ runId: "b", seed: 2, startedAt: 3 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "b", turnpoints: 7, endedAt: 4, reason: "ground" })).confirmed;
		await (await alice.mutate.startRun({ runId: "c", seed: 3, startedAt: 5 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "c", turnpoints: 4, endedAt: 6, reason: "ground" })).confirmed;
		expect((await alice.query(board)).entries[0]?.score).toBe(7);
		const pilot = await alice.query((ctx: AppReadContext) => ctx.table("pilots").get("alice"));
		expect(pilot).toMatchObject({ best: 7, flights: 3, totalTurnpoints: 11, lastTurnpoints: 4 });
	} finally {
		harness.dispose();
	}
});

test("a flight left open counts as flown, and progress survives a reload", async () => {
	const { harness, alice } = await setup();
	try {
		await (await alice.mutate.startRun({ runId: "open", seed: 1, startedAt: 1 })).confirmed;
		await (await alice.mutate.reachTurnpoint({ runId: "open", turnpoints: 4 })).confirmed;
		// Launching again without finishing settles the open flight first.
		await (await alice.mutate.startRun({ runId: "next", seed: 2, startedAt: 50 })).confirmed;

		const fresh = await harness.createClient({ userId: "alice" });
		await waitUntil(async () => (await fresh.store.query(readView(DAY))).pilot?.flights === 1);
		const view = await fresh.store.query(readView(DAY));
		expect(view.pilot).toMatchObject({ best: 4, flights: 1 });
		expect(view.run).toMatchObject({ runId: "next", status: "flying", turnpoints: 0 });
		expect(view.entries).toEqual([{ userId: "alice", score: 4 }]);
	} finally {
		harness.dispose();
	}
});

test("everyone flies the same daily task, and their best lands on that day's board", async () => {
	const { harness, alice, bob } = await setup();
	try {
		await (await alice.mutate.startRun({ runId: "a1", seed: 1, startedAt: 1, mode: "daily", day: DAY })).confirmed;
		await (await bob.mutate.startRun({ runId: "b1", seed: 999, startedAt: 1, mode: "daily", day: DAY })).confirmed;
		// A daily launch without a date is ignored.
		await (await bob.mutate.startRun({ runId: "b0", seed: 5, startedAt: 2, mode: "daily" })).confirmed;
		const aRun = await alice.query(readMyRun);
		const bRun = await bob.query(readMyRun);
		expect(bRun?.runId).toBe("b1");
		expect(aRun?.seed).toBe(bRun?.seed);
		expect(aRun?.seed).toBe(daySeed(DAY));
		await (await alice.mutate.finishRun({ runId: "a1", turnpoints: 2, endedAt: 5, reason: "ground", seconds: 80 })).confirmed;
		// Cut short with no time reported: counted as the slowest. More than the task holds is capped.
		await (await bob.mutate.finishRun({ runId: "b1", turnpoints: DAILY_TURNPOINTS + 3, endedAt: 6, reason: "interrupted" })).confirmed;
		await waitUntil(async () => (await alice.query(readView(DAY))).daily.length === 2);
		const view = await alice.query(readView(DAY));
		expect(view.daily).toContainEqual({ userId: "bob", score: DAILY_TURNPOINTS, seconds: DAILY_SECONDS });
		expect(view.daily).toContainEqual({ userId: "alice", score: 2, seconds: 80 });
		expect(view.entries).toEqual([]); // daily flights do not touch the free-flight board
		expect(view.pilot).toMatchObject({ best: 0, flights: 1, totalTurnpoints: 2 });
		expect((await alice.query(readView("2025-06-13"))).daily).toEqual([]);
	} finally {
		harness.dispose();
	}
});

test("the daily board ranks beacons first, then the faster time, and keeps each pilot's best", async () => {
	const { harness, alice, bob } = await setup();
	try {
		const fly = async (who: typeof alice, id: string, turnpoints: number, seconds: number) => {
			await (await who.mutate.startRun({ runId: id, seed: 1, startedAt: 1, mode: "daily", day: DAY })).confirmed;
			await (await who.mutate.finishRun({ runId: id, turnpoints, endedAt: 2, reason: turnpoints === DAILY_TURNPOINTS ? "complete" : "ground", seconds })).confirmed;
		};
		await fly(alice, "a1", 4, 182.4);
		await fly(bob, "b1", 4, 171.9);
		await fly(alice, "a2", 3, 100); // fewer turnpoints: not a new best, however quick
		await waitUntil(async () => (await alice.query(readView(DAY))).daily.length === 2);
		const first = await alice.query(dailyBoard);
		expect(first.entries.map((e) => e.userId)).toEqual(["bob", "alice"]);
		expect(first.entries[0]?.displayScore).toBe("4 beacons · 171.9 s");
		expect((await alice.query(readView(DAY))).daily).toContainEqual({ userId: "alice", score: 4, seconds: 182.4 });
		// Same turnpoints, faster: alice takes the lead.
		await fly(alice, "a3", 4, 160);
		await waitUntil(async () => (await alice.query(readView(DAY))).daily.some((e) => e.userId === "alice" && e.seconds === 160));
		expect((await bob.query(dailyBoard)).entries[0]?.userId).toBe("alice");
	} finally {
		harness.dispose();
	}
});
