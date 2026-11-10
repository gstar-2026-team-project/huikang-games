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
		typeId: "cloudrunner-k7q2",
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
			tileTypeId: "cloudrunner-k7q2",
			instanceId: "screenshot",
			userId: "alice",
			clientId: "client-alice",
		}),
	);
	const frame = await waitForBlobFrame(page);
	await frame.locator("[data-testid=mode-daily]").click();
	await frame.locator('#root[data-screen="play"]').waitFor({ state: "attached", timeout: 15_000 });
	// The picture is the world, not the instruments: the glider, the rings of
	// the opening thermal ahead, the first beacon and the clouds beyond.
	await frame.addStyleTag({ content: "#hud, #map, #controls, #rival, #warn, #toast { display: none !important; }" });
	// Bank into the turn for a moment so the long wings read, then capture in flight.
	await frame.waitForFunction(() => (window.__cloudrunnerProbe?.().elapsed ?? 0) > 1.2);
	await page.keyboard.down("ArrowLeft");
	await frame.waitForFunction(() => (window.__cloudrunnerProbe?.().elapsed ?? 0) > 2.1);
	await page.keyboard.up("ArrowLeft");
	await frame.waitForFunction(() => (window.__cloudrunnerProbe?.().elapsed ?? 0) > 2.5);
	await page.screenshot({ path: SCREENSHOT_PATH, fullPage: false });
});
