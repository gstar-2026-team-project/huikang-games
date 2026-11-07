/** 83456 → "1:23.4" */
export function formatTime(ms: number): string {
	const clamped = Math.max(0, ms);
	const minutes = Math.floor(clamped / 60_000);
	const seconds = Math.floor((clamped % 60_000) / 1000);
	const tenths = Math.floor((clamped % 1000) / 100);
	return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

/** Signed split delta: "+2.3s" when behind, "−1.1s" when ahead. */
export function formatDelta(ms: number): string {
	const sign = ms > 0 ? "+" : ms < 0 ? "−" : "±";
	return `${sign}${(Math.abs(ms) / 1000).toFixed(1)}s`;
}

/** World units per second → knots-ish number for the speed gauge. */
export function toKnots(speed: number): number {
	return speed * 0.75;
}
