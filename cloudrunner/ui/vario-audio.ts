import type { resumeAudioContext as ResumeAudioContext } from "poe-tiles-sdk/v1/client.js";

/** Below this climb rate (m/s) the vario is silent. */
export const BEEP_THRESHOLD = 0.3;
const GAIN = 0.12;
/** Look-ahead for scheduling beeps (s): longer than a frame, so no beep is late. */
const AHEAD = 0.12;
const MUTE_KEY = "cloudrunner-muted";

/** Beep pitch (Hz) and spacing (s) for a climb rate: higher and quicker the faster you climb, like a glider's vario. */
export function beepFor(climb: number): { freq: number; period: number } {
	const c = Math.max(0, Math.min(10, climb));
	return { freq: 560 + c * 85, period: Math.max(0.14, 0.62 - c * 0.05) };
}

function storage(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/**
 * The audible variometer: short beeps while climbing, rising in pitch and
 * rate with the climb, silence in sink. Created on the first user gesture.
 */
export class VarioAudio {
	private ctx: AudioContext | null = null;
	private nextBeep = 0;
	muted = false;

	constructor(private readonly resume: typeof ResumeAudioContext) {
		try {
			this.muted = storage()?.getItem(MUTE_KEY) === "1";
		} catch {
			this.muted = false;
		}
	}

	/** Call from a real user gesture so autoplay rules let audio start. */
	unlock(): void {
		if (this.muted) return;
		if (this.ctx) {
			this.resume(this.ctx);
			return;
		}
		const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctor) return;
		try {
			this.ctx = new Ctor();
			this.resume(this.ctx);
		} catch {
			this.ctx = null;
		}
	}

	setMuted(muted: boolean): void {
		this.muted = muted;
		try {
			storage()?.setItem(MUTE_KEY, muted ? "1" : "0");
		} catch {
			// Preference just lasts the session.
		}
		if (!muted) this.unlock();
	}

	/** Called every rendered frame with the variometer reading; `active` is false off the flying screen. */
	update(climb: number, active: boolean): void {
		const ctx = this.ctx;
		if (!ctx || this.muted || !active || climb < BEEP_THRESHOLD || ctx.state !== "running") {
			if (ctx) this.nextBeep = Math.max(this.nextBeep, ctx.currentTime);
			return;
		}
		const now = ctx.currentTime;
		if (this.nextBeep < now) this.nextBeep = now + 0.02;
		while (this.nextBeep < now + AHEAD) {
			const { freq, period } = beepFor(climb);
			this.beep(ctx, freq, this.nextBeep, period * 0.5);
			this.nextBeep += period;
		}
	}

	private beep(ctx: AudioContext, freq: number, at: number, length: number): void {
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.setValueAtTime(freq, at);
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(GAIN, at + 0.01);
		gain.gain.setValueAtTime(GAIN, at + length - 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
		osc.connect(gain).connect(ctx.destination);
		osc.start(at);
		osc.stop(at + length + 0.02);
	}

	dispose(): void {
		void this.ctx?.close().catch(() => undefined);
		this.ctx = null;
	}
}
