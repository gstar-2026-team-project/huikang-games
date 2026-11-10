import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "../dist-web");
// Serve under a sub-path, as GitHub Pages does, so absolute asset URLs fail here.
const BASE = "/huikang-games/skyrunner/";
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
		test.setTimeout(60_000);
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
		// Hands off, the plane flies level through the first ring.
		await expect(page.locator("[data-testid=rings]")).toHaveText("1", { timeout: 15_000 });
		// Then dive into the ground to end the flight.
		await page.keyboard.down("ArrowDown");
		await expect(root).toHaveAttribute("data-screen", "over", { timeout: 20_000 });
		await page.keyboard.up("ArrowDown");
		await expect(page.locator("#pText")).toContainText("best 1 ring");
		// Nobody else is on the board, so there is no score to beat.
		await expect(page.locator("[data-testid=rival]")).toBeHidden();

		await page.reload();
		await expect(page.locator("[data-testid=mode-daily]")).toContainText("best 1 ring", { timeout: 15_000 });

		await page.locator("[data-testid=mode-levels]").click();
		await page.locator("[data-testid=level-1]").click();
		await expect(root).toHaveAttribute("data-screen", "play");
		expect(errors).toEqual([]);
		await expect(page.locator("#err")).toBeHidden();
	});
});
