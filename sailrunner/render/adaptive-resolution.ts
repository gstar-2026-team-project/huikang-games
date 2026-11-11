/**
 * Dynamic resolution. Most of a frame's cost here is the water shader, paid per
 * pixel, so a large high-DPI screen on a modest GPU can fall below the display
 * rate. This watches the time between consecutive rendered frames and steps the
 * render resolution down while frames run long, and back up when there is
 * headroom, never above the budget's ratio.
 */

/** Frames slower than this (ms) count as long: 50 fps leaves room under a 60 Hz display. */
const SLOW_MS = 20;
/** Frames faster than this (ms) count as having headroom. */
const FAST_MS = 17.6;
/** Frames judged per decision. */
const WINDOW = 45;
/** Lowest scale of the budget's ratio. */
const MIN_SCALE = 0.45;
const STEP_DOWN = 0.82;
const STEP_UP = 1.1;
/** A gap this long (ms) is a pause, an idle screen or a hidden tab, not a slow frame. */
const GAP_MS = 120;

export class AdaptiveResolution {
	private scale = 1;
	private last = 0;
	private slow = 0;
	private fast = 0;
	private count = 0;

	constructor(
		private readonly maxRatio: number,
		private readonly apply: (ratio: number) => void,
	) {}

	get ratio(): number {
		return this.maxRatio * this.scale;
	}

	/** Call once per rendered frame with a monotonic time (ms). */
	frame(now: number): void {
		const gap = this.last ? now - this.last : 0;
		this.last = now;
		if (gap <= 0 || gap > GAP_MS) return;
		this.count++;
		if (gap > SLOW_MS) this.slow++;
		if (gap < FAST_MS) this.fast++;
		if (this.count < WINDOW) return;
		let next = this.scale;
		// Mostly slow: step down. Nearly all fast: try one step back up.
		if (this.slow > WINDOW * 0.3) next = Math.max(MIN_SCALE, this.scale * STEP_DOWN);
		else if (this.fast > WINDOW * 0.95) next = Math.min(1, this.scale * STEP_UP);
		this.count = this.slow = this.fast = 0;
		if (Math.abs(next - this.scale) > 0.01) {
			this.scale = next;
			this.apply(this.ratio);
		}
	}
}
