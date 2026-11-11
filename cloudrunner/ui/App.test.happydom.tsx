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
		expect(q("mode-daily")).toHaveTextContent("4 beacons, fastest wins");
		expect(q("mode-free")).toHaveTextContent("Endless beacons");
		expect(container.querySelector("#pText")).toHaveTextContent("rising air is your only way up");
		// A three-step how-to: find the rising air, circle in it, glide on to the beacon.
		const steps = [...container.querySelectorAll("[data-testid=how-to] li")].map((li) => li.textContent);
		expect(steps).toHaveLength(3);
		expect(steps[0]).toContain("white columns under clouds");
		expect(steps[1]).toContain("Circle inside it to climb");
		expect(steps[2]).toContain("striped beacon");
		// Each step carries the colour it means in the scene: cyan lift, green climb, red beacon.
		const swatches = [...container.querySelectorAll("[data-testid=how-to] .swatch")].map((s) => s.className);
		expect(swatches).toEqual(["swatch lift", "swatch climb", "swatch beacon"]);
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
		expect(probe?.vario).toBeLessThan(0);
		// The flight shows its climb meter and the two pointer chips, the menu is gone, and the sound can be switched off.
		expect(q("vario-box")).not.toBeNull();
		expect(q("vario-box")?.getAttribute("aria-label")).toBe("Climb meter");
		expect(q("beacon-pointer")).not.toBeNull();
		expect(q("lift-pointer")).not.toBeNull();
		expect(q("overlay")?.hidden).toBe(true);
		expect(q("mute")).toHaveTextContent("Sound on");
		q("mute")?.click();
		expect(q("mute")).toHaveTextContent("Sound off");
		expect(q("mute")?.getAttribute("aria-pressed")).toBe("true");
		q("mute")?.click();
	} finally {
		unmount?.();
		container.remove();
		harness.dispose();
	}
	expect(window.__cloudrunnerProbe).toBeUndefined();
});
