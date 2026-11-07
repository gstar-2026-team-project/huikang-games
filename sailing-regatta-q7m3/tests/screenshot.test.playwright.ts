//
// Captures a square screenshot that can replace the default `profilePicture`
// in `.poe-tile.json`. Drive via:
//   bun run regenerate-screenshot
// which builds the app and writes `assets/screenshot.png`. If you point
// `profilePicture` at that file, commit it with the rest of the tile.

import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import {
	TestServer,
	waitForBlobFrame,
} from "poe-tiles-sdk/v1/test-utils/playwright.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "../dist");
const ASSETS_DIR = join(__dirname, "../assets");
const SCREENSHOT_PATH = join(ASSETS_DIR, "screenshot.png");

const server = new TestServer();

// This file is an asset generator, not a CI test: it boots a full TestServer
// + blob iframe purely to capture this tile's marketing screenshot
// (assets/screenshot.png). It asserts nothing your e2e
// suite doesn't already cover, so it is skipped in the default Playwright
// suite to keep CI fast. Regenerate the screenshot on demand with
// `bun run regenerate-screenshot`.
// Destructured rather than read as `process.env["REGEN_SCREENSHOTS"]`: biome's
// `useLiteralKeys` rejects the computed string key, and dot access would break
// type-check under the monorepo tsconfig's `noPropertyAccessFromIndexSignature`.
const { REGEN_SCREENSHOTS } = process.env;

test.skip(
	!REGEN_SCREENSHOTS,
	"Asset generator — run `bun run regenerate-screenshot`, not the default suite.",
);

test.beforeAll(async () => {
	if (!existsSync(join(DIST_DIR, "index.html"))) {
		throw new Error('dist/index.html not found. Run "bun run build" first.');
	}
	mkdirSync(ASSETS_DIR, { recursive: true });
	await server.start();
	await server.registerTile({
		typeId: "sailing-regatta-q7m3",
		content: { type: "directory", dir: DIST_DIR },
	});
});

test.afterAll(async () => {
	await server.closeAndWaitForTesting();
});

// Square mobile viewport (360x360 CSS px) with 2x DPR. CSS pixels stay
// below Tailwind's `sm` breakpoint (640px) so apps render their actual
// mobile layout; the 2x DPR keeps the output PNG at 720x720.
test.use({
	viewport: { width: 360, height: 360 },
	deviceScaleFactor: 2,
});

test("capture profile picture", async ({ page }) => {
	await page.goto(
		server.sessionUrl({
			tileTypeId: "sailing-regatta-q7m3",
			instanceId: "screenshot",
			userId: "alice",
			clientId: "client-alice",
		}),
	);
	const frame = await waitForBlobFrame(page);
	await frame.locator('[data-testid="start-race"]').waitFor({ timeout: 15_000 });
	// The icon shows the boat on the water, without the HUD.
	await frame.addStyleTag({ content: ".hud { display: none !important; }" });
	// Wait until the render loop has drawn the boat at the start line.
	await frame.waitForFunction(() => window.__regattaProbe?.().mode === "ready");
	await frame.evaluate(
		() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
	);
	await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
});
