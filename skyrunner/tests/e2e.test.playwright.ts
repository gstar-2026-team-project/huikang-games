import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { TestServer, waitForBlobFrame } from "poe-tiles-sdk/v1/test-utils/playwright.js";
import { openTwoUserTile } from "./multiplayer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "../dist");
const TYPE_ID = "skyrunner-52a09d606400";

const server = new TestServer();

test.beforeAll(async () => {
	if (!existsSync(join(DIST_DIR, "index.html"))) {
		throw new Error('dist/index.html not found. Run "bun run build" first.');
	}
	await server.start();
	await server.registerTile({ typeId: TYPE_ID, content: { type: "directory", dir: DIST_DIR } });
});

test.afterAll(() => {
	server.close();
});

test.describe("skyrunner", () => {
	test("loads on the mode menu", async ({ page }) => {
		await page.goto(
			server.sessionUrl({ tileTypeId: TYPE_ID, instanceId: "smoke", userId: "alice", clientId: "client-alice" }),
		);
		const frame = await waitForBlobFrame(page);
		await expect(frame.locator("[data-testid=mode-daily]")).toBeVisible({ timeout: 15_000 });
		await expect(frame.locator("#root")).toHaveAttribute("data-screen", "home");
	});

	test("one pilot's daily flight shows up as the other pilot's score to beat", async ({ browser }) => {
		test.setTimeout(60_000);
		const sessions = await openTwoUserTile({
			server,
			browser,
			tileTypeId: TYPE_ID,
			instanceId: "two-pilots",
			readySelector: "[data-testid=mode-daily]",
		});
		try {
			const a = sessions.alice;
			await expect(sessions.bob.frame.locator("[data-testid=rival]")).toBeHidden();
			await a.frame.locator("[data-testid=mode-daily]").click();
			await expect(a.frame.locator("#root")).toHaveAttribute("data-screen", "play");
			// Hands off, the plane flies level through the first ring.
			await expect(a.frame.locator("[data-testid=rings]")).toHaveText("1", { timeout: 15_000 });
			// Then dive into the ground to end the flight.
			await a.frame.locator("#stickZone").focus().catch(() => undefined);
			await a.page.keyboard.down("ArrowDown");
			await expect(a.frame.locator("#root")).toHaveAttribute("data-screen", "over", { timeout: 20_000 });
			await a.page.keyboard.up("ArrowDown");

			const rival = sessions.bob.frame.locator("[data-testid=rival]");
			await expect(rival).toBeVisible({ timeout: 10_000 });
			await expect(rival).toContainText("To beat: Alice · 1");
		} finally {
			await sessions.close();
		}
	});
});
