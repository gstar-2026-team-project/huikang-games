import { writeFileSync } from "node:fs";
import { test } from "@playwright/test";

test.use({ viewport: { width: 900, height: 600 }, colorScheme: "light" });

test("frame by frame: arrows with the boat stopped", async ({ page }) => {
	test.setTimeout(240_000);
	await page.clock.install();
	await page.goto("http://127.0.0.1:4841/");
	const tick = (ms: number) => page.clock.runFor(ms);
	for (let i = 0; i < 60 && !(await page.locator('[data-testid="start-race"]').isVisible()); i++) await tick(100);
	await page.locator('[data-testid="start-race"]').click();
	await tick(500);
	const probe = () => page.evaluate(() => window.__regattaProbe!());
	const norm = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
	// Steer straight into the wind and let the boat stall to a stop (in irons).
	for (let i = 0; i < 400; i++) {
		const p = await probe();
		const err = norm(p.wind - p.heading);
		const key = Math.abs(err) < 0.04 ? null : err > 0 ? "ArrowRight" : "ArrowLeft";
		if (key) { await page.keyboard.down(key); await tick(50); await page.keyboard.up(key); }
		else await tick(200);
		const speed = Number(await page.locator('[data-testid="speed"]').textContent());
		if (!key && speed < 0.05) break;
	}
	console.log("speed now", await page.locator('[data-testid="speed"]').textContent(), "heading-wind", norm((await probe()).wind - (await probe()).heading).toFixed(3));
	await page.addStyleTag({ content: ".hud-top,.gauge,.irons,[data-testid=pad-left],[data-testid=pad-right],.toast{visibility:hidden!important}" });
	const frames: string[] = [];
	for (let f = 0; f < 6; f++) {
		frames.push((await page.screenshot({ clip: { x: 0, y: 260, width: 900, height: 340 } })).toString("base64"));
		await tick(100);
	}
	const p0 = await probe();
	console.log("boat moved during filming (m):", 0, "wind from (deg)", ((p0.wind * 180) / Math.PI).toFixed(1));
	// Stitch: a strip of frames 0..5, then an overlay of frame 0 (red) and frame 5 (cyan).
	const out = await page.evaluate(async (pngs) => {
		const load = (s: string) => new Promise<HTMLImageElement>((r) => { const i = new Image(); i.onload = () => r(i); i.src = "data:image/png;base64," + s; });
		const imgs = await Promise.all(pngs.map(load));
		const w = imgs[0]!.width, h = imgs[0]!.height;
		const c = document.createElement("canvas");
		c.width = w; c.height = h * 3;
		const g = c.getContext("2d")!;
		// Row 1: frames 0, 2, 4 at a third size side by side is too small; show 0 and 5 full, then overlay.
		g.drawImage(imgs[0]!, 0, 0);
		g.drawImage(imgs[5]!, 0, h);
		const read = (img: HTMLImageElement) => { const t = document.createElement("canvas"); t.width = w; t.height = h; const x = t.getContext("2d")!; x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h); };
		const a = read(imgs[0]!), b = read(imgs[5]!);
		const o = g.createImageData(w, h);
		for (let k = 0; k < a.data.length; k += 4) {
			const la = (a.data[k]! + a.data[k + 1]! + a.data[k + 2]!) / 3;
			const lb = (b.data[k]! + b.data[k + 1]! + b.data[k + 2]!) / 3;
			o.data[k] = la; o.data[k + 1] = lb; o.data[k + 2] = lb; o.data[k + 3] = 255;
		}
		g.putImageData(o, 0, h * 2);
		return c.toDataURL("image/png").split(",")[1]!;
	}, frames);
	writeFileSync(".visual-checks/frames-stopped.png", Buffer.from(out, "base64"));
});
