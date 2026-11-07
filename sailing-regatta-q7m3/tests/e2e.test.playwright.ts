import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import {
	TestServer,
	waitForBlobFrame,
} from "poe-tiles-sdk/v1/test-utils/playwright.js";
import { sailCourse } from "./autopilot";
import { openTwoUserTile } from "./multiplayer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "../dist");
const TILE = "sailing-regatta-q7m3";

const server = new TestServer();

test.beforeAll(async () => {
	if (!existsSync(join(DIST_DIR, "index.html"))) {
		throw new Error('dist/index.html not found. Run "bun run build" first.');
	}
	await server.start();
	await server.registerTile({
		typeId: TILE,
		content: { type: "directory", dir: DIST_DIR },
	});
});

test.afterAll(() => {
	server.close();
});

test.describe("regatta", () => {
	test("opens on the playable start line", async ({ page }) => {
		await page.goto(
			server.sessionUrl({
				tileTypeId: TILE,
				instanceId: "regatta-smoke",
				userId: "alice",
				clientId: "client-alice",
			}),
		);
		const frame = await waitForBlobFrame(page);
		await expect(frame.locator('[data-testid="start-race"]')).toBeVisible({ timeout: 15_000 });
		await expect(frame.locator('[role="alert"]')).toHaveCount(0);
		await expect(frame.locator('[data-testid="race-marks"]')).toHaveText(/Mark 1 of 4/);
	});

	test("the sailing lesson teaches steering with the real controls", async ({ page }) => {
		await page.goto(
			server.sessionUrl({
				tileTypeId: TILE,
				instanceId: "regatta-lesson",
				userId: "alice",
				clientId: "client-alice",
			}),
		);
		const frame = await waitForBlobFrame(page);
		await frame.locator('[data-testid="start-lesson"]').click();
		const coach = frame.locator('[data-testid="coach"]');
		await expect(coach).toContainText("Hold ▶ to turn right");
		// Every lesson step has a buoy, so speed and velocity toward it are both live numbers.
		await expect(frame.locator('[data-testid="speed"]')).not.toHaveText("0.0");
		await expect(frame.locator('[data-testid="vmg"]')).toHaveText(/^-?\d+\.\d$/);
		// The live coach suggests the first move and highlights that pad.
		await expect(frame.locator('[data-testid="action-hint"]')).toContainText("Turn right");
		await expect(frame.locator('[data-testid="pad-right"]')).toHaveAttribute("data-hint", "true");
		await expect(frame.locator('[data-testid="pad-left"]')).toHaveAttribute("data-hint", "false");
		// Sail the two steering buoys with the real controls.
		await sailCourse(frame, 60_000, (probe) => (probe.lessonStep ?? 0) >= 2);
		await expect(coach).toContainText("straight across the wind");
		expect(await frame.evaluate(() => window.__regattaProbe?.().lessonStep)).toBe(2);
		await expect(frame.locator('[data-testid="vmg"]')).toBeVisible();
		await coach.getByRole("button", { name: "Exit lesson" }).click();
		await expect(frame.locator('[data-testid="start-race"]')).toBeVisible();
	});

	test("a full race reaches the other player, survives a reload, and can be watched back", async ({ browser }) => {
		test.setTimeout(240_000);
		const sessions = await openTwoUserTile({
			server,
			browser,
			tileTypeId: TILE,
			instanceId: "regatta-two-users",
			readySelector: '[data-testid="start-race"]',
		});
		try {
			const alice = sessions.alice.frame;
			const bob = sessions.bob.frame;
			await alice.locator('[data-testid="start-race"]').click();
			await expect(alice.locator('[data-testid="pad-left"]')).toBeVisible({ timeout: 8_000 });
			// During a race there is always a next buoy, so velocity toward it is a number.
			await expect(alice.locator('[data-testid="vmg"]')).toHaveText(/^-?\d+\.\d$/);
			await sailCourse(alice, 200_000);

			const banner = alice.locator('[data-testid="finish-banner"]');
			await expect(banner).toBeVisible();
			const time = (await banner.locator(".finish-time").textContent()) ?? "";
			expect(time).toMatch(/^\d:\d\d\.\d$/);
			await expect(banner.locator('[data-testid="finish-stats"]')).toContainText("Velocity to buoys");

			// Bob's screen shows Alice's time as the one to beat, with her name.
			await expect(bob.locator('[data-testid="leader-chip"]')).toContainText(`Alice ${time}`, { timeout: 10_000 });

			// Alice's best persists across a reload.
			await sessions.alice.page.reload();
			const reloaded = await waitForBlobFrame(sessions.alice.page);
			await expect(reloaded.locator(".ready-meta")).toContainText(`Your best ${time}`, { timeout: 15_000 });

			// Bob watches Alice's run.
			await bob.locator('[data-testid="open-replays"]').click();
			await bob.locator('[data-testid="watch-alice"]').click();
			await expect(bob.locator('[data-testid="replay-bar"]')).toContainText(`Watching Alice · ${time}`);
			await expect.poll(() => bob.evaluate(() => window.__regattaProbe?.().mode)).toBe("replay");
			const start = await bob.evaluate(() => window.__regattaProbe?.());
			await expect
				.poll(async () => {
					const now = await bob.evaluate(() => window.__regattaProbe?.());
					return Math.hypot((now?.x ?? 0) - (start?.x ?? 0), (now?.y ?? 0) - (start?.y ?? 0));
				})
				.toBeGreaterThan(10);
		} finally {
			await sessions.close();
		}
	});
});
