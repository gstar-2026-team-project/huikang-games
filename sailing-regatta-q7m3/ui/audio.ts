import type { resumeAudioContext as ResumeAudioContext } from "poe-tiles-sdk/v1/client.js";

/** Peak gain for every cue: loud enough to carry on a phone speaker, never startling. */
const CUE_PEAK = 0.22;

export type Cue = "tick" | "horn" | "mark" | "finish" | "timeout";

/** Small synthesized cue set; created lazily from the first user gesture. */
export class SoundBoard {
	private context: AudioContext | null = null;
	muted = false;

	constructor(private resume: typeof ResumeAudioContext) {}

	/** Call from a real user gesture so autoplay policy lets audio start. */
	unlock(): void {
		if (this.context) {
			this.resume(this.context);
			return;
		}
		const Ctor =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return;
		this.context = new Ctor();
		this.resume(this.context);
	}

	/** `level` escalates the mark chime as the player works round the course. */
	play(cue: Cue, level = 0): void {
		const ctx = this.context;
		if (this.muted || !ctx) return;
		this.resume(ctx);
		const t = ctx.currentTime;
		const jitter = 1 + (Math.random() - 0.5) * 0.02;
		switch (cue) {
			case "tick":
				this.tone(ctx, 660 * jitter, t, 0.09, "square", 0.5);
				break;
			case "horn":
				this.tone(ctx, 220, t, 0.7, "sawtooth", 0.6);
				this.tone(ctx, 330, t, 0.7, "sawtooth", 0.35);
				break;
			case "mark": {
				// Rising major arpeggio; each mark starts a step higher.
				const base = 523.25 * 2 ** (level * (4 / 12)) * jitter;
				this.tone(ctx, base, t, 0.16, "triangle", 1);
				this.tone(ctx, base * 1.26, t + 0.08, 0.16, "triangle", 0.9);
				this.tone(ctx, base * 1.5, t + 0.16, 0.28, "triangle", 0.9);
				break;
			}
			case "finish":
				[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
					this.tone(ctx, f, t + i * 0.11, 0.5, "triangle", 1);
				});
				this.tone(ctx, 261.63, t + 0.33, 0.8, "sine", 0.8);
				break;
			case "timeout":
				this.tone(ctx, 330, t, 0.25, "sawtooth", 0.6);
				this.tone(ctx, 247, t + 0.22, 0.45, "sawtooth", 0.6);
				break;
		}
	}

	private tone(
		ctx: AudioContext,
		frequency: number,
		start: number,
		duration: number,
		type: OscillatorType,
		weight: number,
	): void {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = type;
		osc.frequency.value = frequency;
		const peak = CUE_PEAK * weight * (type === "sawtooth" || type === "square" ? 0.45 : 1);
		gain.gain.setValueAtTime(0.0001, start);
		gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		osc.connect(gain).connect(ctx.destination);
		osc.start(start);
		osc.stop(start + duration + 0.05);
	}
}
