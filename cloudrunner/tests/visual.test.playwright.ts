// Layout snapshots for manual review. Run with VISUAL=1; skipped otherwise.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { TestServer, waitForBlobFrame } from "poe-tiles-sdk/v1/test-utils/playwright.js";
import { visualCheckPath } from "../scripts/visual-check";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TILE_DIR = join(__dirname, "..");
const { VISUAL } = process.env;
test.skip(!VISUAL, "Manual layout snapshots — run with VISUAL=1.");

const server = new TestServer();
test.beforeAll(async () => {
	await server.start();
	await server.registerTile({ typeId: "cloudrunner-k7q2", content: { type: "directory", dir: join(TILE_DIR, "dist") } });
});
test.afterAll(() => server.close());

const sizes = [
	{ name: "phone", width: 390, height: 760 },
	{ name: "feed", width: 350, height: 509 },
	{ name: "desktop", width: 780, height: 414 },
];

for (const scheme of ["light", "dark"] as const) {
	for (const size of sizes) {
		test(`${size.name} ${scheme}`, async ({ browser }) => {
			test.setTimeout(60_000);
			const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: scheme });
			const page = await context.newPage();
			await page.goto(server.sessionUrl({ tileTypeId: "cloudrunner-k7q2", instanceId: `vis-${size.name}-${scheme}`, userId: "alice", clientId: "c" }));
			const frame = await waitForBlobFrame(page);
			const shot = (n: string) => page.screenshot({ path: visualCheckPath(`${size.name}-${scheme}-${n}.png`, TILE_DIR) });
			await expect(frame.locator("[data-testid=mode-daily]")).toBeVisible({ timeout: 15_000 });
			await page.waitForTimeout(300);
			await shot("home");
			await frame.locator("[data-testid=mode-free]").click();
			await page.waitForTimeout(1500);
			await shot("play");
			await page.keyboard.down("ArrowDown");
			await expect(frame.locator("#root")).toHaveAttribute("data-screen", "over", { timeout: 30_000 });
			await page.keyboard.up("ArrowDown");
			await page.waitForTimeout(300);
			await shot("over");
			await context.close();
		});
	}
}
