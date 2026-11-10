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

test("opens on the mode menu, shows the daily score to beat, and launches the daily task", async () => {
	const harness = createPoeTileTestHarness<AppSchema>({ store: { backendConfig: tileBackendConfig } });
	const container: HTMLElement = document.createElement("div");
	let unmount: (() => void) | undefined;
	try {
		const alice = await harness.createClient({ userId: "alice", userInfo: { displayName: "Alice" } });
		const bob = await harness.createClient({ userId: "bob", userInfo: { displayName: "Bob" } });
		document.body.appendChild(container);
		unmount = mountApp(container, createTestAppProps(bob));

		const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid=${id}]`);
		await waitFor(() => expect(q("mode-daily")).not.toBeNull());
		expect(container.dataset.screen).toBe("home");
		expect(q("mode-daily")).toHaveTextContent("4 turnpoints, fastest wins");
		expect(q("mode-free")).toHaveTextContent("Endless turnpoints");
		expect(container.querySelector("#pText")).toHaveTextContent("circle under a cloud to climb");
		// No daily scores yet: no leaderboard layer at all.
		expect(q("rival")?.hidden).toBe(true);

		const day = new Date().toISOString().slice(0, 10);
		await (await alice.store.mutate.startRun({ runId: "r1", seed: 1, startedAt: 1, mode: "daily", day })).confirmed;
		await (await alice.store.mutate.finishRun({ runId: "r1", turnpoints: 3, endedAt: 2, reason: "ground", seconds: 150 })).confirmed;
		await waitFor(() => {
			expect(q("rival")?.hidden).toBe(false);
			expect(q("rival")).toHaveTextContent("To beat: Alice · 3");
		});

		// The ideal-path overlay is off until the pilot turns it on.
		expect(q("path-toggle")).toHaveTextContent("Ideal path: off");
		q("path-toggle")?.click();
		expect(q("path-toggle")).toHaveTextContent("Ideal path: on");
		expect(q("path-toggle")?.getAttribute("aria-pressed")).toBe("true");

		// Automated players read the flight through the probe.
		expect(window.__cloudrunnerProbe?.()).toMatchObject({ screen: "home", turnpoints: 0, next: { x: 0 } });
		q("mode-daily")?.click();
		await waitFor(() => expect(container.dataset.screen).toBe("play"));
		const probe = window.__cloudrunnerProbe?.();
		expect(probe?.screen).toBe("play");
		expect(probe?.agl).toBeGreaterThan(100);
		expect(probe?.thermals.length).toBeGreaterThan(0);
		expect(q("turnpoints")).toHaveTextContent("0");
	} finally {
		unmount?.();
		container.remove();
		harness.dispose();
	}
	expect(window.__cloudrunnerProbe).toBeUndefined();
});
