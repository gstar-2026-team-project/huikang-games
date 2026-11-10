import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { TestServer, waitForBlobFrame } from "poe-tiles-sdk/v1/test-utils/playwright.js";
import { openTwoUserTile } from "./multiplayer";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "../dist");
const TYPE_ID = "cloudrunner-k7q2";

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

test.describe("cloudrunner", () => {
	test("loads on the mode menu", async ({ page }) => {
		await page.goto(
			server.sessionUrl({ tileTypeId: TYPE_ID, instanceId: "smoke", userId: "alice", clientId: "client-alice" }),
		);
		const frame = await waitForBlobFrame(page);
		await expect(frame.locator("[data-testid=mode-daily]")).toBeVisible({ timeout: 15_000 });
		await expect(frame.locator("[data-testid=mode-free]")).toBeVisible();
		await expect(frame.locator("#root")).toHaveAttribute("data-screen", "home");
	});

	test("one pilot's daily flight shows up as the other pilot's score to beat", async ({ browser }) => {
		test.setTimeout(120_000);
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
			// The flight is live: the clock runs and the variometer reads a climb or sink rate.
			await expect(a.frame.locator("[data-testid=vario]")).toHaveText(/^[+-]\d+\.\d$/, { timeout: 10_000 });
			await expect(a.frame.locator("[data-testid=time]")).not.toHaveText("0:00", { timeout: 10_000 });
			const probe = await a.frame.evaluate(() => window.__cloudrunnerProbe?.());
			expect(probe?.screen).toBe("play");
			expect(probe?.thermals.length).toBeGreaterThan(0);
			// Hands off, the glider flies through the opening thermal and reaches the first beacon.
			await expect(a.frame.locator("[data-testid=turnpoints]")).toHaveText("1/4", { timeout: 45_000 });
			// Then nose down into the ground to land out.
			await a.frame.locator("#stickZone").focus().catch(() => undefined);
			await a.page.keyboard.down("ArrowDown");
			await expect(a.frame.locator("#root")).toHaveAttribute("data-screen", "over", { timeout: 30_000 });
			await a.page.keyboard.up("ArrowDown");
			await expect(a.frame.locator("#pTitle")).toHaveText("Landed out");
			await expect(a.frame.locator("#pText")).toContainText("best 1 turnpoint");

			const rival = sessions.bob.frame.locator("[data-testid=rival]");
			await expect(rival).toBeVisible({ timeout: 10_000 });
			await expect(rival).toContainText("To beat: Alice · 1");
		} finally {
			await sessions.close();
		}
	});
});
