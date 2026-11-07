import { expect, test } from "bun:test";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createPoeTileTestHarness } from "poe-tiles-sdk/v1/test-utils.js";
import { MAX_SPEED } from "../game/constants";
import { courseLength, dayKey, generateCourse } from "../game/course";
import { formatTime } from "../game/format";
import { tileBackendConfig } from "../synced-store/backend-config";
import type { AppSchema } from "../synced-store/schema";
import { createTestAppProps } from "../tests/app-test-props";
import { App } from "./App";

test("the ready screen shows today's course, the leader, and opens replays with names", async () => {
	const harness = createPoeTileTestHarness<AppSchema>({
		store: { backendConfig: tileBackendConfig },
	});
	let container: HTMLElement = document.createElement("div");
	try {
		const aliceClient = await harness.createClient({ userId: "alice", userInfo: { displayName: "Alice" } });
		const bobClient = await harness.createClient({ userId: "bob", userInfo: { displayName: "Bob Builder" } });

		// Bob finishes today's course.
		const day = dayKey(Date.now());
		const course = generateCourse(day);
		const timeMs = Math.ceil((courseLength(course) / MAX_SPEED) * 1000) + 25_000;
		const bob = bobClient.store;
		await (await bob.mutate.startRun({ runId: "b1", day, startedAt: 1, heading: 0 })).confirmed;
		await (
			await bob.mutate.finishRun({
				runId: "b1",
				day,
				timeMs,
				splits: course.marks.map((_, i) => (i === course.marks.length - 1 ? timeMs : (i + 1) * 1000)),
				trace: [0, 0, 0, 5, 5, 0],
				finishedAt: 2,
			})
		).confirmed;
		await aliceClient.store.waitForServerData();

		({ container } = render(<App {...createTestAppProps(aliceClient)} />));
		const start = await waitFor(() => {
			const button = container.querySelector('[data-testid="start-race"]');
			expect(button).toBeInTheDocument();
			return button as HTMLButtonElement;
		});
		expect(start).toHaveTextContent("Start race");
		// Alice hasn't sailed yet, so the lesson is offered first.
		expect(container.querySelector(".lesson-offer")).toHaveTextContent("New to sailing?");
		await waitFor(() => {
			expect(container.querySelector('[data-testid="leader-chip"]')).toHaveTextContent(
				`Bob Builder ${formatTime(timeMs)}`,
			);
		});
		// No WebGL in Happy DOM: the tile explains instead of crashing.
		expect(container.querySelector('[role="alert"]')).toHaveTextContent("3D graphics");

		fireEvent.click(container.querySelector('[data-testid="open-replays"]')!);
		await waitFor(() => {
			expect(container.querySelector('[data-testid="watch-bob"]')).toBeInTheDocument();
		});
		expect(container.querySelector(".replay-list")).toHaveTextContent("Bob Builder");
		// Initials fallback when there is no profile photo.
		expect(container.querySelector(".avatar-initials")).toHaveTextContent("BB");
	} finally {
		cleanup();
		container.remove();
		harness.dispose();
	}
});
