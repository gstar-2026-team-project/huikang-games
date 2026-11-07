import { afterEach, describe, expect, test } from "bun:test";
import { getLeaderboard } from "poe-tiles-sdk/v1/client.js";
import { createPoeTileTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import type { AppReadContext } from "../client";
import { courseLength, generateCourse, leaderboardIdFor } from "../game/course";
import { MAX_SPEED } from "../game/constants";
import { tileBackendConfig } from "./backend-config";
import type { AppSchema } from "./schema";

const DAY = "2026-11-07";
const course = generateCourse(DAY);
const fastest = Math.ceil((courseLength(course) / MAX_SPEED) * 1000);

function result(timeMs: number) {
	const splits = course.marks.map((_, i) => Math.round((timeMs * (i + 1)) / course.marks.length));
	return { splits, trace: [0, 0, 0, 10, 10, 50, 20, 20, 100], timeMs };
}

let harness: ReturnType<typeof createPoeTileTestHarness<AppSchema>> | null = null;
afterEach(() => {
	harness?.dispose();
	harness = null;
});

async function setup() {
	harness = createPoeTileTestHarness<AppSchema>({ store: { backendConfig: tileBackendConfig } });
	const alice = await harness.createClient({ userId: "alice", userInfo: { displayName: "Alice" } });
	const bob = await harness.createClient({ userId: "bob", userInfo: { displayName: "Bob" } });
	return { alice: alice.store, bob: bob.store, h: harness };
}

type Store = Awaited<ReturnType<typeof setup>>["alice"];

async function race(store: Store, runId: string, timeMs: number) {
	await (await store.mutate.startRun({ runId, day: DAY, startedAt: 1000, heading: 0 })).confirmed;
	const r = result(timeMs);
	await (
		await store.mutate.finishRun({ runId, day: DAY, timeMs, splits: r.splits, trace: r.trace, finishedAt: 2000 })
	).confirmed;
}

const readBoard = (ctx: AppReadContext) => getLeaderboard(ctx, { leaderboardId: leaderboardIdFor(DAY) });

describe("runs and leaderboard", () => {
	test("a finished run reaches the other player with its replay, and only the best counts", async () => {
		const { alice, bob } = await setup();
		await race(alice, "a1", fastest + 60_000);
		await race(alice, "a2", fastest + 40_000);
		await race(alice, "a3", fastest + 50_000);

		const runs = await bob.query((ctx: AppReadContext) => ctx.table("runs").scan().values().toArray());
		expect(runs).toHaveLength(1);
		expect(runs[0]).toMatchObject({ userId: "alice", timeMs: fastest + 40_000 });
		expect(runs[0]!.trace.length).toBe(9);
		const board = await bob.query(readBoard);
		expect(board.bestScore).toBe("lowest");
		expect(board.label).toBe("Sailrunner · Nov 7, 2026");
		expect(board.entries.map((e) => [e.userId, e.score])).toEqual([["alice", fastest + 40_000]]);
		// The end screen shows each player's speed and velocity stats next to their time.
		expect(board.entries[0]?.markdown).toContain("Speed: avg");
		expect(board.entries[0]?.markdown).toContain("Velocity toward buoys");
	});

	test("finishing is idempotent and stale results change nothing", async () => {
		const { alice, bob } = await setup();
		await race(alice, "a1", fastest + 30_000);
		// Replaying the same finish, or finishing a run that was never started, is a no-op.
		const r = result(fastest + 1_000);
		await (await alice.mutate.finishRun({ runId: "a1", day: DAY, ...r, finishedAt: 3000 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "ghost", day: DAY, ...r, finishedAt: 3000 })).confirmed;
		const board = await bob.query(readBoard);
		expect(board.entries[0]?.score).toBe(fastest + 30_000);
	});

	test("impossible times are rejected", async () => {
		const { alice } = await setup();
		await (await alice.mutate.startRun({ runId: "a1", day: DAY, startedAt: 1, heading: 0 })).confirmed;
		const r = result(fastest - 5_000);
		await expect(alice.mutate.finishRun({ runId: "a1", day: DAY, ...r, finishedAt: 2 })).rejects.toThrow();
	});

	test("old days are pruned when someone finishes", async () => {
		const { alice, bob } = await setup();
		const oldDay = "2026-11-01";
		const oldCourse = generateCourse(oldDay);
		const oldTime = Math.ceil((courseLength(oldCourse) / MAX_SPEED) * 1000) + 30_000;
		await (await bob.mutate.startRun({ runId: "b0", day: oldDay, startedAt: 1, heading: 0 })).confirmed;
		await (
			await bob.mutate.finishRun({
				runId: "b0",
				day: oldDay,
				timeMs: oldTime,
				splits: oldCourse.marks.map((_, i) => (i === oldCourse.marks.length - 1 ? oldTime : i + 1)),
				trace: [0, 0, 0],
				finishedAt: 2,
			})
		).confirmed;
		await race(alice, "a1", fastest + 30_000);
		const days = await bob.query(async (ctx: AppReadContext) =>
			(await ctx.table("runs").scan().values().toArray()).map((r) => r.day),
		);
		expect(days).toEqual([DAY]);
	});
});

describe("in-progress runs", () => {
	test("checkpoints are private, survive a reload, and ignore late replays", async () => {
		const { alice, bob, h } = await setup();
		await (await alice.mutate.startRun({ runId: "a1", day: DAY, startedAt: 500, heading: 1 })).confirmed;
		const checkpoint = { runId: "a1", x: 5, y: 6, heading: 1, speed: 9, splits: [12_000], trace: [1, 2, 3] };
		await (await alice.mutate.checkpointRun({ ...checkpoint, markIndex: 2 })).confirmed;
		await (await alice.mutate.checkpointRun({ ...checkpoint, markIndex: 1, x: 99 })).confirmed;

		// A fresh client for the same player sees the saved state.
		const reloaded = await h.createClient({ userId: "alice" });
		const saved = await reloaded.store.query((ctx: AppReadContext) =>
			ctx.privateOfUser(ctx.userId).table("activeRun").get("current"),
		);
		expect(saved).toMatchObject({ runId: "a1", markIndex: 2, x: 5, startedAt: 500 });
		// Bob can't read Alice's in-progress run.
		const leaked = await bob.query((ctx: AppReadContext) => ctx.table("activeRun").scan().values().toArray());
		expect(leaked).toEqual([]);

		// Restarting the same run id does not reset checkpoints; abandoning clears it.
		await (await alice.mutate.startRun({ runId: "a1", day: DAY, startedAt: 900, heading: 0 })).confirmed;
		expect(
			await alice.query((ctx: AppReadContext) => ctx.privateOfUser(ctx.userId).table("activeRun").get("current")),
		).toMatchObject({ markIndex: 2, startedAt: 500 });
		await (await alice.mutate.abandonRun({ runId: "a1" })).confirmed;
		expect(
			await alice.query((ctx: AppReadContext) => ctx.privateOfUser(ctx.userId).table("activeRun").get("current")),
		).toBeUndefined();
	});

	test("mute and lesson progress are private per-player preferences", async () => {
		const { alice, bob } = await setup();
		await (await alice.mutate.setMuted({ muted: true })).confirmed;
		const read = (ctx: AppReadContext) => ctx.privateOfUser(ctx.userId).table("prefs").get("prefs");
		expect(await alice.query(read)).toEqual({ muted: true });
		expect(await bob.query(read)).toBeUndefined();
		// Finishing the lesson keeps the mute choice, and is remembered after a reload.
		await (await alice.mutate.completeTutorial({})).confirmed;
		await (await alice.mutate.completeTutorial({})).confirmed;
		expect(await alice.query(read)).toEqual({ muted: true, tutorialDone: true });
		const reloaded = await harness!.createClient({ userId: "alice" });
		expect(await reloaded.store.query(read)).toEqual({ muted: true, tutorialDone: true });
	});
});
