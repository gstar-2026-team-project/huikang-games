import type { Frame } from "@playwright/test";

/** Mirror of ui/race-controller's RegattaProbe; kept structural so tests need no UI imports. */
interface Probe {
	mode: string;
	x: number;
	y: number;
	heading: number;
	wind: number;
	nextMark: { x: number; y: number } | null;
}

const TACK_ANGLE = (50 * Math.PI) / 180;
const POLL_MS = 40;

function normalize(angle: number): number {
	let a = angle % (Math.PI * 2);
	if (a > Math.PI) a -= Math.PI * 2;
	if (a < -Math.PI) a += Math.PI * 2;
	return a;
}

async function press(frame: Frame, key: string, down: boolean): Promise<void> {
	await frame.evaluate(
		([k, d]) => window.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { key: k as string })),
		[key, down] as const,
	);
}

/**
 * Sail the live course with the real arrow-key controls until the race ends.
 * Points at each mark, tacking upwind when the mark is inside the no-go zone.
 */
export async function sailCourse(frame: Frame, timeoutMs: number): Promise<void> {
	let tack = 1;
	let held: string | null = null;
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const probe = await frame.evaluate(() => window.__regattaProbe?.() ?? null);
		if (!probe || probe.mode !== "racing" || !probe.nextMark) break;
		const p = probe as Probe;
		const mark = p.nextMark!;
		const bearing = Math.atan2(mark.x - p.x, mark.y - p.y);
		let desired = bearing;
		if (Math.abs(normalize(bearing - p.wind)) < TACK_ANGLE) {
			const options = [p.wind + TACK_ANGLE, p.wind - TACK_ANGLE];
			const off = (h: number) => Math.abs(normalize(h - bearing));
			const current = options[tack === 1 ? 0 : 1]!;
			const other = options[tack === 1 ? 1 : 0]!;
			if (off(other) + 0.35 < off(current)) tack = -tack;
			desired = options[tack === 1 ? 0 : 1]!;
		}
		const error = normalize(desired - p.heading);
		const want = Math.abs(error) < 0.08 ? null : error > 0 ? "ArrowRight" : "ArrowLeft";
		if (want !== held) {
			if (held) await press(frame, held, false);
			if (want) await press(frame, want, true);
			held = want;
		}
		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}
	if (held) await press(frame, held, false);
}
