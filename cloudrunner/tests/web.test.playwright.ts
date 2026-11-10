import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "../dist-web");
// Serve under a sub-path, as GitHub Pages does, so absolute asset URLs fail here.
const BASE = "/huikang-games/cloudrunner/";
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
	test("a daily flight is saved in the browser and survives a reload", async ({ page }) => {
		test.setTimeout(120_000);
		const errors: string[] = [];
		page.on("pageerror", (error) => errors.push(error.message));
		await page.goto(url);
		const root = page.locator("#root");
		await expect(page.locator("[data-testid=mode-daily]")).toBeVisible({ timeout: 15_000 });
		await expect(root).toHaveAttribute("data-screen", "home");
		// Inviting friends needs Joiner, so the web build hides it.
		await expect(page.locator("[data-testid=invite]")).toBeHidden();

		await page.locator("[data-testid=mode-daily]").click();
		await expect(root).toHaveAttribute("data-screen", "play");
		// The autopilot's plan can be switched on in flight.
		await page.locator("[data-testid=path-toggle]").click();
		await expect(page.locator("[data-testid=path-toggle]")).toHaveText("Ideal path: on");
		// The flight is live: the variometer reads a climb or sink rate.
		await expect(page.locator("[data-testid=vario]")).toHaveText(/^[+-]\d+\.\d$/, { timeout: 10_000 });
		// Hands off, the glider flies through the opening thermal and reaches the first beacon.
		await expect(page.locator("[data-testid=turnpoints]")).toHaveText("1/4", { timeout: 45_000 });
		// Then nose down into the ground to land out.
		await page.keyboard.down("ArrowDown");
		await expect(root).toHaveAttribute("data-screen", "over", { timeout: 30_000 });
		await page.keyboard.up("ArrowDown");
		await expect(page.locator("#pTitle")).toHaveText("Landed out");
		await expect(page.locator("#pText")).toContainText("best 1 turnpoint");
		// Nobody else is on the board, so there is no score to beat.
		await expect(page.locator("[data-testid=rival]")).toBeHidden();

		await page.reload();
		await expect(page.locator("[data-testid=mode-daily]")).toContainText("best 1 turnpoint", { timeout: 15_000 });

		await page.locator("[data-testid=mode-free]").click();
		await expect(root).toHaveAttribute("data-screen", "play");
		await expect(page.locator("[data-testid=turnpoints]")).toHaveText("0");
		expect(errors).toEqual([]);
		await expect(page.locator("#err")).toBeHidden();
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
			await expect(game.locator("[data-testid=mode-daily]")).toBeVisible({ timeout: 15_000 });
			const inner = page.frames().find((frame) => frame !== page.mainFrame());
			expect(await inner?.evaluate(() => [window.innerWidth, window.innerHeight])).toEqual([width, height]);
		}
	});
});
