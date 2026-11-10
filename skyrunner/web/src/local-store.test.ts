import { expect, test } from "bun:test";
import { levelCourse } from "../../game/levels";
import { daySeed, levelSeed } from "../../game/modes";
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

test("free flights keep the best ring count and survive a reload", async () => {
	const storage = memoryStorage();
	const store = open(storage).client();
	await store.mutate.startRun({ runId: "r1", seed: 4, startedAt: 1000 });
	await store.mutate.passRing({ runId: "r1", rings: 2 });
	// The final report can trail the last checkpoint; rings are never lost.
	await store.mutate.finishRun({ runId: "r1", rings: 1, endedAt: 2000, reason: "ground" });
	await store.mutate.startRun({ runId: "r2", seed: 5, startedAt: 3000 });
	await store.mutate.finishRun({ runId: "r2", rings: 1, endedAt: 4000, reason: "time" });
	// A repeated finish changes nothing.
	await store.mutate.finishRun({ runId: "r2", rings: 9, endedAt: 5000, reason: "time" });

	const view = open(storage).view();
	expect(view.pilot).toMatchObject({ best: 2, flights: 2, totalRings: 3, lastRings: 1 });
	expect(view.entries).toEqual([{ userId: view.me, score: 2 }]);
	expect(view.run).toMatchObject({ runId: "r2", status: "done", reason: "time" });
});

test("the daily challenge ranks rings first, then the sooner last ring, for today only", async () => {
	const local = open(memoryStorage());
	const store = local.client();
	const fly = async (runId: string, day: string, rings: number, lastRingAt: number) => {
		await store.mutate.startRun({ runId, seed: 1, startedAt: 1000, mode: "daily", day });
		await store.mutate.finishRun({ runId, rings, endedAt: 2000, reason: "time", lastRingAt });
	};
	await fly("old", "2025-06-11", 9, 10);
	await fly("d1", DAY, 3, 30);
	await fly("d2", DAY, 3, 20);
	await fly("d3", DAY, 2, 5);

	expect(local.getState().run?.seed).toBe(daySeed(DAY));
	expect(local.view().daily).toEqual([{ userId: "local", score: 3, seconds: 20 }]);
	expect(Object.keys(local.getState().daily)).toEqual([DAY]);
	// The free-flight record is untouched by daily runs.
	expect(local.view().entries).toEqual([]);
});

test("levels keep their best stars, and a flight left open is counted when the next one starts", async () => {
	const local = open(memoryStorage());
	const store = local.client();
	const total = levelCourse(1).ringCount ?? 0;
	await store.mutate.startRun({ runId: "l1", seed: 0, startedAt: 1000, mode: "level", level: 1 });
	expect(local.getState().run?.seed).toBe(levelSeed(1));
	await store.mutate.finishRun({ runId: "l1", rings: total + 5, endedAt: 2000, reason: "complete" });
	expect(local.view().stars).toEqual([3]);
	expect(local.getState().run?.rings).toBe(total);

	await store.mutate.startRun({ runId: "l2", seed: 0, startedAt: 3000, mode: "level", level: 1 });
	await store.mutate.passRing({ runId: "l2", rings: 1 });
	await store.mutate.startRun({ runId: "f1", seed: 7, startedAt: 4000 });
	expect(local.view().stars).toEqual([3]);
	expect(local.view().pilot).toMatchObject({ flights: 2, lastRings: 1 });
	expect(local.view().run).toMatchObject({ runId: "f1", status: "flying" });
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
	await store.mutate.finishRun({ runId: "r1", rings: 1, endedAt: 2000, reason: "ground" });
	stop();
	await store.mutate.startRun({ runId: "r2", seed: 4, startedAt: 3000 });
	expect(seen).toEqual([0, 0, 1]);

	const memoryOnly = open(null).client();
	await memoryOnly.mutate.startRun({ runId: "r1", seed: 4, startedAt: 1000 });
	expect((await memoryOnly.query(async () => undefined))).toMatchObject({ run: { runId: "r1" } });
});
