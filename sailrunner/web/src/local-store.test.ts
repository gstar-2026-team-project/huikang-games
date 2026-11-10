import { describe, expect, test } from "bun:test";
import { MAX_SPEED } from "../../game/constants";
import { courseLength, generateCourse, shiftDay } from "../../game/course";
import { LocalStore, STORAGE_KEY, type StorageLike, toDayData } from "./local-store";

const DAY = "2026-11-07";
const course = generateCourse(DAY);
const fastest = Math.ceil((courseLength(course) / MAX_SPEED) * 1000);

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
	const data = { ...initial };
	return {
		data,
		getItem: (key) => data[key] ?? null,
		setItem: (key, value) => {
			data[key] = value;
		},
	};
}

async function race(local: LocalStore, runId: string, timeMs: number, day = DAY) {
	const marks = generateCourse(day).marks;
	const store = local.client();
	await store.mutate.startRun({ runId, day, startedAt: 1000, heading: 0 });
	await store.mutate.finishRun({
		runId,
		day,
		timeMs,
		splits: marks.map((_, i) => Math.round((timeMs * (i + 1)) / marks.length)),
		trace: [0, 0, 0, 10, 10, 50],
		finishedAt: 2000,
	});
}

describe("local store", () => {
	test("keeps only the best run of the day and survives a reload", async () => {
		const storage = memoryStorage();
		const local = new LocalStore(storage);
		await race(local, "a1", fastest + 60_000);
		await race(local, "a2", fastest + 40_000);
		await race(local, "a3", fastest + 50_000);

		const reloaded = toDayData(new LocalStore(storage).getState(), DAY);
		expect(reloaded.runs.map((run) => run.timeMs)).toEqual([fastest + 40_000]);
		expect(reloaded.activeRun).toBeUndefined();
		expect(reloaded.board.entries).toEqual([]);
	});

	test("checkpoints an in-progress run so a reload can resume it", async () => {
		const storage = memoryStorage();
		const store = new LocalStore(storage).client();
		await store.mutate.startRun({ runId: "r1", day: DAY, startedAt: 1000, heading: 1 });
		const checkpoint = { runId: "r1", x: 5, y: 6, heading: 2, speed: 3, splits: [900], trace: [0, 0, 0] };
		await store.mutate.checkpointRun({ ...checkpoint, markIndex: 1 });
		// A stale checkpoint for an earlier mark changes nothing.
		await store.mutate.checkpointRun({ ...checkpoint, markIndex: 1, x: 99 });

		const reloaded = new LocalStore(storage);
		expect(reloaded.getState().activeRun).toMatchObject({ runId: "r1", markIndex: 1, x: 5 });
		await reloaded.client().mutate.abandonRun({ runId: "r1" });
		expect(reloaded.getState().activeRun).toBeNull();
	});

	test("rejects impossible times and prunes old days", async () => {
		const local = new LocalStore(memoryStorage());
		await expect(race(local, "cheat", Math.floor(fastest / 2))).rejects.toThrow("not consistent");
		expect(local.getState().runs).toEqual([]);
		await local.client().mutate.abandonRun({ runId: "cheat" });

		const old = shiftDay(DAY, 5);
		const oldFastest = Math.ceil((courseLength(generateCourse(old)) / MAX_SPEED) * 1000);
		await race(local, "old", oldFastest + 30_000, old);
		await race(local, "new", fastest + 30_000);
		expect(local.getState().runs.map((run) => run.day)).toEqual([DAY]);
	});

	test("remembers preferences, notifies subscribers, and tolerates bad storage", async () => {
		const storage = memoryStorage({ [STORAGE_KEY]: "{not json" });
		const local = new LocalStore(storage);
		let notified = 0;
		const unsubscribe = local.subscribe(() => notified++);
		await local.client().mutate.setMuted({ muted: true });
		await local.client().mutate.completeTutorial({});
		await local.client().mutate.setShowPath({ showPath: true });
		unsubscribe();
		expect(notified).toBe(3);
		expect(toDayData(new LocalStore(storage).getState(), DAY)).toMatchObject({
			muted: true,
			tutorialDone: true,
			showPath: true,
		});

		// No storage at all still gives a working in-memory session.
		const memoryOnly = new LocalStore(null);
		await memoryOnly.client().mutate.setMuted({ muted: true });
		expect(memoryOnly.getState().muted).toBe(true);
	});
});
