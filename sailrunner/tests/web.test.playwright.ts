import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { sailCourse } from "./autopilot";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "../dist-web");
// Serve under a sub-path, as GitHub Pages does, so absolute asset URLs fail here.
const BASE = "/huikang-games/sailrunner/";
const TYPES: Record<string, string> = {
	".html": "text/html",
	".js": "text/javascript",
	".css": "text/css",
};

let server: Server;
let url = "";

test.beforeAll(async () => {
	if (!existsSync(join(DIST_DIR, "index.html"))) {
		throw new Error('dist-web/index.html not found. Run "bun run build:web" first.');
	}
	server = createServer((request, response) => {
		const path = decodeURIComponent((request.url ?? "").split("?")[0] ?? "");
		const file = join(DIST_DIR, normalize(path.slice(BASE.length) || "index.html"));
		if (!path.startsWith(BASE) || !file.startsWith(DIST_DIR) || !existsSync(file)) {
			response.writeHead(404).end();
			return;
		}
		response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
		response.end(readFileSync(file));
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${BASE}`;
});

test.afterAll(() => {
	server.close();
});

test.describe("standalone web build", () => {
	test("a full race is saved in the browser, survives a reload, and can be watched back", async ({ page }) => {
		test.setTimeout(240_000);
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(url);
		const frame = page.mainFrame();
		await expect(page.locator('[data-testid="start-race"]')).toBeVisible({ timeout: 15_000 });
		await expect(page.locator('[role="alert"]')).toHaveCount(0);
		// A first-time visitor is offered the lesson, and has no leaderboard to open.
		await expect(page.locator('[data-testid="start-lesson"]')).toBeVisible();
		await expect(page.getByRole("button", { name: /Leaderboard/ })).toHaveCount(0);

		await page.locator('[data-testid="start-race"]').click();
		await expect(page.locator('[data-testid="pad-left"]')).toBeVisible({ timeout: 8_000 });
		await sailCourse(frame, 200_000);

		const banner = page.locator('[data-testid="finish-banner"]');
		await expect(banner).toBeVisible();
		const time = (await banner.locator(".finish-time").textContent()) ?? "";
		expect(time).toMatch(/^\d:\d\d\.\d$/);

		// The local results sheet stands in for the host's leaderboard.
		const results = page.locator('[data-testid="results-sheet"]');
		await expect(results).toContainText(`Your best today: ${time}`, { timeout: 10_000 });
		await results.getByRole("button", { name: "Race again" }).click();
		await expect(page.locator(".ready-meta")).toContainText(`Your best ${time}`);

		await page.reload();
		await expect(page.locator(".ready-meta")).toContainText(`Your best ${time}`, { timeout: 15_000 });

		await page.locator('[data-testid="open-replays"]').click();
		await page.locator('[data-testid="watch-local"]').click();
		await expect(page.locator('[data-testid="replay-bar"]')).toContainText(`Watching You · ${time}`);
		await expect.poll(() => page.evaluate(() => window.__regattaProbe?.().mode)).toBe("replay");
		expect(errors).toEqual([]);
	});

	test("the display query parameter runs the game at that screen size", async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 1000 });
		for (const [display, width, height] of [["mobile", 390, 844], ["768x768", 768, 768]] as const) {
			await page.goto(`${url}?display=${display}`);
			const sized = page.locator("[data-testid=sized-frame]");
			await expect(sized).toBeVisible();
			const box = await sized.boundingBox();
			expect([box?.width, box?.height]).toEqual([width, height]);
			// Centred in the window, with the game seeing a viewport of that size.
			expect(box?.x).toBe((1200 - width) / 2);
			const game = page.frameLocator("[data-testid=sized-frame]");
			await expect(game.locator('[data-testid="start-race"]')).toBeVisible({ timeout: 15_000 });
			const inner = page.frames().find((frame) => frame !== page.mainFrame());
			expect(await inner?.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height]);
		}
	});
});
