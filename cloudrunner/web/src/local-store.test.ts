import { expect, test } from "bun:test";
import { DAILY_TURNPOINTS, daySeed } from "../../game/modes";
import { LocalStore, STORAGE_KEY, type StorageLike } from "./local-store";

const DAY = "2025-06-12";
const NOW = Date.parse(`${DAY}T12:00:00Z`);

function memoryStorage(initial: Record<string, string> = {}): StorageLike {
	const data = { ...initial };
	return {
		getItem: (key) => data[key] ?? null,
		setItem: (key, value) => {
			data[key] = value;
		},
	};
}

const open = (storage: StorageLike | null) => new LocalStore(storage, () => NOW);

test("free flights keep the most beacons and survive a reload", async () => {
	const storage = memoryStorage();
	const store = open(storage).client();
	await store.mutate.startRun({ runId: "r1", seed: 4, startedAt: 1000 });
	await store.mutate.reachTurnpoint({ runId: "r1", turnpoints: 2 });
	// The final report can trail the last checkpoint; turnpoints are never lost.
	await store.mutate.finishRun({ runId: "r1", turnpoints: 1, endedAt: 2000, reason: "ground" });
	await store.mutate.startRun({ runId: "r2", seed: 5, startedAt: 3000 });
	await store.mutate.finishRun({ runId: "r2", turnpoints: 1, endedAt: 4000, reason: "ground" });
	// A repeated finish changes nothing.
	await store.mutate.finishRun({ runId: "r2", turnpoints: 9, endedAt: 5000, reason: "ground" });

	expect(storage.getItem(STORAGE_KEY)).toContain("r2");
	const view = open(storage).view();
	expect(view.pilot).toMatchObject({ best: 2, flights: 2, totalTurnpoints: 3, lastTurnpoints: 1 });
	expect(view.entries).toEqual([{ userId: view.me, score: 2 }]);
	expect(view.run).toMatchObject({ runId: "r2", status: "done", reason: "ground" });
});

test("the daily task ranks beacons first, then the faster time, for today only", async () => {
	const local = open(memoryStorage());
	const store = local.client();
	const fly = async (runId: string, day: string, turnpoints: number, seconds: number) => {
		await store.mutate.startRun({ runId, seed: 1, startedAt: 1000, mode: "daily", day });
		await store.mutate.finishRun({ runId, turnpoints, endedAt: 2000, reason: "ground", seconds });
	};
	await fly("old", "2025-06-11", 4, 120);
	await fly("d1", DAY, 3, 150);
	await fly("d2", DAY, 3, 141.5);
	await fly("d3", DAY, 2, 60);
	await fly("d4", DAY, DAILY_TURNPOINTS + 2, 200);

	expect(local.getState().run?.seed).toBe(daySeed(DAY));
	expect(local.view().daily).toEqual([{ userId: "local", score: DAILY_TURNPOINTS, seconds: 200 }]);
	expect(Object.keys(local.getState().daily)).toEqual([DAY]);
	// The free-flight record is untouched by daily flights.
	expect(local.view().entries).toEqual([]);
});

test("a flight left open is counted when the next one starts", async () => {
	const local = open(memoryStorage());
	const store = local.client();
	await store.mutate.startRun({ runId: "f0", seed: 3, startedAt: 1000 });
	await store.mutate.reachTurnpoint({ runId: "f0", turnpoints: 1 });
	await store.mutate.startRun({ runId: "f1", seed: 7, startedAt: 4000 });
	expect(local.view().pilot).toMatchObject({ flights: 1, lastTurnpoints: 1, best: 1 });
	expect(local.view().run).toMatchObject({ runId: "f1", status: "flying", turnpoints: 0 });
});

test("subscribers hear every change, and bad or missing storage still plays", async () => {
	const local = open(memoryStorage({ [STORAGE_KEY]: "{not json" }));
	const store = local.client();
	const seen: number[] = [];
	const stop = store.subscribe(
		async () => undefined,
		() => seen.push(local.view().pilot?.flights ?? 0),
	);
	await store.mutate.startRun({ runId: "r1", seed: 4, startedAt: 1000 });
	await store.mutate.finishRun({ runId: "r1", turnpoints: 1, endedAt: 2000, reason: "ground" });
	stop();
	await store.mutate.startRun({ runId: "r2", seed: 4, startedAt: 3000 });
	expect(seen).toEqual([0, 0, 1]);

	const memoryOnly = open(null).client();
	await memoryOnly.mutate.startRun({ runId: "r1", seed: 4, startedAt: 1000 });
	expect((await memoryOnly.query(async () => undefined))).toMatchObject({ run: { runId: "r1" } });
});
