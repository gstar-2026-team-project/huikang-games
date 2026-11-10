import { expect, test } from "bun:test";
import { createPoeTileTestHarness, tick } from "poe-tiles-sdk/v1/test-utils.js";
import { tileBackendConfig } from "../synced-store/backend-config";
import type { AppSchema } from "../synced-store/schema";
import { createTestAppProps } from "../tests/app-test-props";
import { mountApp } from "./App";

async function waitFor(assertion: () => void, timeoutMs = 3_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		try {
			assertion();
			return;
		} catch (error) {
			if (Date.now() >= deadline) throw error;
			await tick();
			await new Promise((r) => setTimeout(r, 10));
		}
	}
}

test("opens on the mode menu, shows the daily score to beat, and lists the levels", async () => {
	const harness = createPoeTileTestHarness<AppSchema>({ store: { backendConfig: tileBackendConfig } });
	const container: HTMLElement = document.createElement("div");
	let unmount: (() => void) | undefined;
	try {
		const alice = await harness.createClient({ userId: "alice", userInfo: { displayName: "Alice" } });
		const bob = await harness.createClient({ userId: "bob", userInfo: { displayName: "Bob" } });
		document.body.appendChild(container);
		unmount = mountApp(container, createTestAppProps(bob));

		const q = (id: string) => container.querySelector<HTMLButtonElement>(`[data-testid=${id}]`);
		await waitFor(() => expect(q("mode-daily")).not.toBeNull());
		expect(container.dataset.screen).toBe("home");
		expect(q("mode-levels")).toHaveTextContent("0 of 36 ★");
		// No daily scores yet: no leaderboard layer at all.
		expect(q("rival")?.hidden).toBe(true);

		const day = new Date().toISOString().slice(0, 10);
		await (await alice.store.mutate.startRun({ runId: "r1", seed: 1, startedAt: 1, mode: "daily", day })).confirmed;
		await (await alice.store.mutate.finishRun({ runId: "r1", rings: 3, endedAt: 2, reason: "ground" })).confirmed;
		await waitFor(() => {
			expect(q("rival")?.hidden).toBe(false);
			expect(q("rival")).toHaveTextContent("To beat: Alice · 3");
		});

		// The level grid: every level open from the start.
		q("mode-levels")?.click();
		await waitFor(() => expect(container.dataset.screen).toBe("levels"));
		expect(q("level-1")?.disabled).toBe(false);
		expect(q("level-12")?.disabled).toBe(false);
		q("back")?.click();
		expect(container.dataset.screen).toBe("home");
	} finally {
		unmount?.();
		container.remove();
		harness.dispose();
	}
});
