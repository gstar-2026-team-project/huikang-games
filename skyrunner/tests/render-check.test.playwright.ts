//
// Finds the battery-hungry rendering patterns the production power report
// measures, before the tile has a single player. Drive via:
//   bun run render-check
// which builds the tile, installs Chromium, and runs this file under the
// `mobile-viewport` project (iPhone 13 on Chromium). It prints a table, writes
// `.visual-checks/render-check.json`, and fails on findings. Set
// `RENDER_CHECK_REPORT_ONLY=1` to print the report without failing on them.
// The `tile-creator` skill's render-check reference explains every code.

import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, type Frame, test } from "@playwright/test";
import { TestServer } from "poe-tiles-sdk/v1/test-utils/playwright.js";
import {
	checkRenderCost,
	formatRenderCheckReport,
	partialCauses,
	type RenderCheckReport,
	type RenderCheckScreen,
	renderCheckDeadlineMs,
	renderCheckTimeoutMs,
} from "poe-tiles-sdk/v1/test-utils/render-check.js";
import { visualCheckPath } from "../scripts/visual-check";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TILE_DIR = join(__dirname, "..");
const DIST_DIR = join(TILE_DIR, "dist");

// Destructured rather than read as `process.env["RENDER_CHECK"]`: biome's
// `useLiteralKeys` rejects the computed string key, and dot access would break
// type-check under the monorepo tsconfig's `noPropertyAccessFromIndexSignature`.
const { RENDER_CHECK, RENDER_CHECK_REPORT_ONLY } = process.env;

test.skip(
	!RENDER_CHECK,
	"Render check — run `bun run render-check`, not the default suite.",
);

// The screens the check walks, in order, through the tile's real UI. Replace
// the single opening screen with the tile's real screens and their kinds:
// `idle` for a menu, game-over card, pause or how-to overlay (nothing should
// move there); `play` for active play, with `exercise` to keep playing it
// while it is measured (taps, drags, held keys, until `ctx.signal` fires) and
// `assert` to confirm the screen is still showing after the hold and after
// the probes. Each `reach` starts from whatever state the previous screen
// left, on the same page, so the list is an ordered walk. A screen the
// player leaves open and comes back to (a farm, a lobby, a collection, a
// board between moves) is `idle`, reached in the fullest state a player can
// own. Keep `kind: "unknown"` only for a screen you have not classified: it
// is measured and probed, but judged by the screen-agnostic rules alone.
const screenOf = (frame: Frame) => frame.locator("#root").getAttribute("data-screen");
let playChecks = 0;

const screens: RenderCheckScreen[] = [
	{
		name: "mode menu",
		kind: "idle",
		reach: async ({ frame }) => {
			await expect(frame.locator("[data-testid=mode-daily]")).toBeVisible({ timeout: 15_000 });
		},
		assert: async ({ frame }) => (await screenOf(frame)) === "home",
	},
	{
		name: "level grid",
		kind: "idle",
		reach: async ({ frame }) => {
			await frame.locator("[data-testid=mode-levels]").click();
			await expect(frame.locator("#root")).toHaveAttribute("data-screen", "levels");
		},
		assert: async ({ frame }) => (await screenOf(frame)) === "levels",
	},
	{
		name: "flying",
		kind: "play",
		reach: async ({ frame }) => {
			playChecks = 0;
			await frame.locator("[data-testid=level-1]").click();
			await expect(frame.locator("#root")).toHaveAttribute("data-screen", "play");
		},
		exercise: async ({ page, signal }) => {
			// Gentle weaving: bank one way, then the other, until the hold ends.
			let left = true;
			while (!signal.aborted) {
				const key = left ? "ArrowLeft" : "ArrowRight";
				await page.keyboard.down(key);
				await new Promise((r) => setTimeout(r, 400));
				await page.keyboard.up(key);
				await new Promise((r) => setTimeout(r, 400));
				left = !left;
			}
		},
		// After the hold the flight is live; covering the tile then pauses it.
		assert: async ({ frame }) => {
			playChecks++;
			const screen = await screenOf(frame);
			return playChecks === 1 ? screen === "play" : screen === "paused";
		},
	},
	{
		name: "paused",
		kind: "idle",
		reach: async ({ frame }) => {
			await expect(frame.locator("#root")).toHaveAttribute("data-screen", "paused");
		},
		assert: async ({ frame }) => (await screenOf(frame)) === "paused",
	},
	{
		name: "flight over",
		kind: "idle",
		reach: async ({ frame, page }) => {
			await frame.locator("[data-testid=resume]").click();
			await expect(frame.locator("#root")).toHaveAttribute("data-screen", "play");
			await page.keyboard.down("ArrowDown");
			await expect(frame.locator("#root")).toHaveAttribute("data-screen", "over", { timeout: 30_000 });
			await page.keyboard.up("ArrowDown");
		},
		assert: async ({ frame }) => (await screenOf(frame)) === "over",
	},
];

const server = new TestServer();
let latest: RenderCheckReport | null = null;

test.setTimeout(renderCheckTimeoutMs(screens.length));

test.beforeAll(async () => {
	if (!existsSync(join(DIST_DIR, "index.html"))) {
		throw new Error('dist/index.html not found. Run "bun run build" first.');
	}
	await server.start();
	await server.registerTile({
		typeId: "skyrunner-52a09d606400",
		content: { type: "directory", dir: DIST_DIR },
	});
});

test.afterAll(async () => {
	await server.closeAndWaitForTesting();
});

async function attach(report: RenderCheckReport): Promise<void> {
	const json = JSON.stringify(report, null, 2);
	writeFileSync(visualCheckPath("render-check.json", TILE_DIR), json);
	await test
		.info()
		.attach("render-check", { body: json, contentType: "application/json" });
}

// A run that Playwright's timeout ends still leaves the last progress
// snapshot behind as evidence.
test.afterEach(async () => {
	if (latest) await attach(latest);
});

test("render check", async ({ page }) => {
	const report = await checkRenderCost(
		{ page, server },
		{
			sessionUrl: server.sessionUrl({
				tileTypeId: "skyrunner-52a09d606400",
				instanceId: "render-check",
				userId: "alice",
				clientId: "client-alice",
			}),
			screens,
			tileRootDir: TILE_DIR,
			deadlineMs: renderCheckDeadlineMs(screens.length),
			onProgress: (snapshot) => {
				latest = snapshot;
			},
		},
	);
	latest = null;
	console.log(formatRenderCheckReport(report));
	await attach(report);
	// A worker-rendered canvas is the only unobservable state to skip on; a tile
	// page or frame that never mounts must fail, or the check proves nothing.
	const offMainThread =
		report.status === "unobservable" &&
		(report.reason ?? "").includes("transferControlToOffscreen");
	test.skip(
		report.status === "inconclusive" || offMainThread,
		`render check ${report.status}: ${report.reason ?? ""}`,
	);
	expect(report.status, report.reason ?? "").not.toBe("unobservable");
	if (RENDER_CHECK_REPORT_ONLY) return;
	const message = [
		...report.findings.map((f) => `${f.code} [${f.screen}]: ${f.sentence}`),
		...(report.partial ? [`partial: ${partialCauses(report).join("; ")}`] : []),
	].join("\n");
	expect(report.findings, message).toEqual([]);
	for (const screen of report.screens ?? []) expect(screen.status, screen.name).toBe("measured");
});
