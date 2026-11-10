import type { RenderBudget } from "poe-tiles-sdk/v1/client.js";
import { DT, MAX_FRAME_TIME } from "../game/constants";

const AMBIENT_MS = 250; // one frame this often on screens where nothing moves
const WAKE_MS = 1000; // full rate this long after input or a phase change

export interface LoopHooks {
	/** One fixed simulation step. */
	step(dt: number): void;
	/** Draw the current state; `dt` is the real time since the last draw. */
	render(dt: number, nowMs: number): void;
	/** True on menus, pause and game-over screens. */
	isIdle(): boolean;
}

/** Fixed-step simulation with a budget-gated renderer that idles on still screens. */
export class Loop {
	private raf = 0;
	private last = 0;
	private acc = 0;
	private lastRender = 0;
	private wakeUntil = 0;
	private running = false;
	onError: (err: unknown) => void = () => undefined;

	constructor(
		private readonly hooks: LoopHooks,
		private readonly budget: RenderBudget | null,
	) {}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.last = performance.now();
		this.lastRender = 0;
		this.wake();
		this.raf = requestAnimationFrame(this.frame);
	}

	stop(): void {
		this.running = false;
		if (this.raf) cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	/** Back to full rate for a moment (input, phase change, resize). */
	wake(): void {
		this.wakeUntil = performance.now() + WAKE_MS;
	}

	private readonly frame = (now: number): void => {
		if (!this.running) return;
		try {
			const dt = Math.min(MAX_FRAME_TIME, Math.max(0, (now - this.last) / 1000));
			this.last = now;
			const idle = this.hooks.isIdle();
			if (!idle) {
				this.acc += dt;
				while (this.acc >= DT) {
					this.hooks.step(DT);
					this.acc -= DT;
				}
			} else this.acc = 0;
			const awake = !idle || now < this.wakeUntil;
			const ambientDue = now - this.lastRender >= AMBIENT_MS;
			if (!awake && !ambientDue) {
				this.budget?.shouldRenderFrame(now, { idle: true });
			} else if (!this.budget || this.budget.shouldRenderFrame(now)) {
				const rdt = this.lastRender ? Math.min(MAX_FRAME_TIME, (now - this.lastRender) / 1000) : 0;
				this.lastRender = now;
				const draw = () => this.hooks.render(rdt, now);
				if (this.budget) this.budget.renderFrame(draw);
				else draw();
			}
		} catch (err) {
			this.stop();
			this.onError(err);
			return;
		}
		this.raf = requestAnimationFrame(this.frame);
	};
}
