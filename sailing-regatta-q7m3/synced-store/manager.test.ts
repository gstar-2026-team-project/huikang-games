import { expect, test } from "bun:test";
import { createPoeTileInManagerTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import { MAX_SPEED } from "../game/constants";
import { courseLength, generateCourse } from "../game/course";
import { tileBackendConfig } from "./backend-config";
import { tileClientConfig } from "./client-config";

const DAY = "2026-11-07";
const course = generateCourse(DAY);
const fastest = Math.ceil((courseLength(course) / MAX_SPEED) * 1000);

function finishInput(runId: string, timeMs: number, finishedAt: number) {
	const splits = course.marks.map((_, i) => Math.round((timeMs * (i + 1)) / course.marks.length));
	return { runId, day: DAY, timeMs, splits, trace: [0, 0, 0], finishedAt };
}

test("passing someone's time notifies only them; the actor just gets a Recents bump", async () => {
	const h = await createPoeTileInManagerTestHarness({
		tile: { typeId: "regatta", clientConfig: tileClientConfig, backendConfig: tileBackendConfig },
		users: ["alice", "bob"],
	});
	try {
		const alice = h.tile("alice").poe.store;
		const bob = h.tile("bob").poe.store;

		await (await bob.mutate.startRun({ runId: "b1", day: DAY, startedAt: 1000, heading: 0 })).confirmed;
		await (await bob.mutate.finishRun(finishInput("b1", fastest + 40_000, 2000))).confirmed;
		const bobBefore = await h.manager("bob").wait((v) => v.previewTimestamp === 2000);
		const aliceBefore = await h.manager("alice").wait(() => true);

		// Alice's first finish is faster than Bob's: Bob is passed.
		await (await alice.mutate.startRun({ runId: "a1", day: DAY, startedAt: 3000, heading: 0 })).confirmed;
		await (await alice.mutate.finishRun(finishInput("a1", fastest + 20_000, 4000))).confirmed;
		const bobAfter = await h
			.manager("bob")
			.wait((v) => v.previewTimestamp === 4000 && v.pushes.length === bobBefore.pushes.length + 1);
		expect(bobAfter.unreadCount).toBe(bobBefore.unreadCount + 1);
		expect(bobAfter.preview).toBe("alice beat your time on Regatta · Nov 7, 2026");
		const aliceAfter = await h.manager("alice").wait((v) => v.previewTimestamp === 4000);
		expect(aliceAfter.preview).toStartWith("You took the lead");
		expect(aliceAfter.unreadCount).toBe(aliceBefore.unreadCount);
		expect(aliceAfter.pushes).toHaveLength(aliceBefore.pushes.length);

		// A slower repeat by Alice passes nobody: no push for Bob.
		await (await alice.mutate.startRun({ runId: "a2", day: DAY, startedAt: 5000, heading: 0 })).confirmed;
		await (await alice.mutate.finishRun(finishInput("a2", fastest + 30_000, 6000))).confirmed;
		await h.manager("alice").wait((v) => v.previewTimestamp === 6000);
		const bobLater = await h.manager("bob").wait(() => true);
		expect(bobLater.pushes).toHaveLength(bobAfter.pushes.length);
		expect(bobLater.unreadCount).toBe(bobAfter.unreadCount);
	} finally {
		h.dispose();
	}
});
