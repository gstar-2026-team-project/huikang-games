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

/** World units are meters, so speeds are already m/s: 9.24 → "9.2 m/s". */
export function formatSpeed(speed: number): string {
	return `${speed.toFixed(1)} m/s`;
}
