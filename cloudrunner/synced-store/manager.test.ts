import { expect, test } from "bun:test";
import { createPoeTileInManagerTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import { tileBackendConfig } from "./backend-config";
import { tileClientConfig } from "./client-config";

test("a finished flight bumps only the pilot's own row; a new daily best reaches the others once", async () => {
	const h = await createPoeTileInManagerTestHarness({
		tile: { typeId: "cloudrunner-test", clientConfig: tileClientConfig, backendConfig: tileBackendConfig },
		users: ["alice", "bob"],
	});
	try {
		const alice = h.tile("alice").poe.store;
		const bobBefore = await h.manager("bob").wait(() => true);
		await (await alice.mutate.startRun({ runId: "r1", seed: 3, startedAt: 1000, mode: "daily", day: "2025-06-12" })).confirmed;
		await (await alice.mutate.finishRun({ runId: "r1", turnpoints: 3, endedAt: 2000, reason: "ground", seconds: 140 })).confirmed;

		const aliceRow = await h.manager("alice").wait((v) => v.previewTimestamp === 2000);
		expect(aliceRow.preview).toBe("You reached 3 beacons in the Jun 12 daily task");
		expect(aliceRow.pushes).toHaveLength(0);
		const bobRow = await h.manager("bob").wait((v) => v.pushes.length > bobBefore.pushes.length);
		expect(bobRow.pushes).toHaveLength(bobBefore.pushes.length + 1);
		expect(bobRow.preview ?? "").not.toContain("You reached");

		// A worse flight is not a new best: nobody else hears about it.
		await (await alice.mutate.startRun({ runId: "r2", seed: 4, startedAt: 3000, mode: "daily", day: "2025-06-12" })).confirmed;
		await (await alice.mutate.finishRun({ runId: "r2", turnpoints: 2, endedAt: 4000, reason: "time", seconds: 90 })).confirmed;
		await h.manager("alice").wait((v) => v.previewTimestamp === 4000);
		const bobAfter = await h.manager("bob").wait(() => true);
		expect(bobAfter.pushes).toHaveLength(bobRow.pushes.length);
	} finally {
		h.dispose();
	}
});

test("free-flight bests stay quiet for everyone else", async () => {
	const h = await createPoeTileInManagerTestHarness({
		tile: { typeId: "cloudrunner-test-free", clientConfig: tileClientConfig, backendConfig: tileBackendConfig },
		users: ["alice", "bob"],
	});
	try {
		const alice = h.tile("alice").poe.store;
		const bobBefore = await h.manager("bob").wait(() => true);
		await (await alice.mutate.startRun({ runId: "f1", seed: 3, startedAt: 1000 })).confirmed;
		await (await alice.mutate.finishRun({ runId: "f1", turnpoints: 9, endedAt: 2000, reason: "ground" })).confirmed;
		await h.manager("alice").wait((v) => v.previewTimestamp === 2000);
		const bobAfter = await h.manager("bob").wait(() => true);
		expect(bobAfter.pushes).toHaveLength(bobBefore.pushes.length);
	} finally {
		h.dispose();
	}
});
