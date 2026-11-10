import { STALL_SPEED } from "../game/constants";
import { groundBelow, type Sim } from "../game/flight";
import { initials, type Profile, type RivalView } from "./rivals";
import type { ShellRefs } from "./shell";

const TOAST_SECONDS = 1.2;
/** Ground readout bands (m above the ground). */
const GROUND_LOW = 60;
const GROUND_DANGER = 25;
/** Warn when the ground is this many seconds away at the current sink rate. */
const IMPACT_WARN_SECONDS = 3;
/** Variometer bands (m/s): green when going up, red when coming down faster than any steady glide. */
const VARIO_CLIMBING = 0.5;
const VARIO_SINKING_FAST = -9;
/** The daily clock turns red this many seconds before the limit. */
const TIME_LOW_SECONDS = 30;

/** Pull-up warning: very low, or sinking fast enough to hit within IMPACT_WARN_SECONDS. */
export function sinkingIntoGround(agl: number, climbRate: number): boolean {
	if (agl < GROUND_DANGER && climbRate < 1) return true;
	return climbRate < -1 && agl / -climbRate < IMPACT_WARN_SECONDS;
}

/** "2:05" from seconds flown. */
export function clockText(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "+3.2" or "-5.0": the glider's climb rate in m/s. */
export function varioText(climb: number): string {
	const v = Math.round(climb * 10) / 10;
	return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

const BANNER_SECONDS = 2.2;
const TOAST_FADE = 0.3;

/** Writes HUD values only when they change, from the render step. */
export class Hud {
	private last = new Map<string, string>();
	private toastT = 0;
	private bannerT = 0;
	private lastRivalKey = "";

	constructor(private readonly ui: ShellRefs) {}

	private text(key: string, el: HTMLElement, value: string): void {
		if (this.last.get(key) === value) return;
		this.last.set(key, value);
		el.textContent = value;
	}
	private style(key: string, el: HTMLElement, prop: "transform" | "opacity", value: string): void {
		if (this.last.get(key) === value) return;
		this.last.set(key, value);
		el.style[prop] = value;
	}
	private flag(key: string, el: HTMLElement, state: string, classes: readonly string[]): void {
		if (this.last.get(key) === state) return;
		this.last.set(key, state);
		for (const c of classes) el.classList.toggle(c, c === state);
	}

	toast(message: string): void {
		this.ui.toast.textContent = message;
		this.toastT = TOAST_SECONDS;
	}

	banner(name: string, picture: string | null): void {
		const b = this.ui.banner;
		b.replaceChildren(avatar({ name, picture }), document.createTextNode(`Passed ${name}!`));
		b.hidden = false;
		this.bannerT = BANNER_SECONDS;
	}

	/** True while a toast or banner is still fading and needs frames. */
	get busy(): boolean {
		return this.toastT > 0 || this.bannerT > 0;
	}

	update(sim: Sim, flying: boolean, knob: { x: number; y: number }, dt: number): void {
		const ui = this.ui;
		const p = sim.plane;
		const total = sim.spec.count;
		this.text("tp", ui.tpVal, total === null ? String(sim.next) : `${sim.next}/${total}`);
		this.text("time", ui.timeVal, clockText(sim.elapsed));
		const limit = sim.spec.timeLimit;
		this.flag("timeLow", ui.timePill, limit !== null && sim.elapsed > limit - TIME_LOW_SECONDS ? "low" : "", ["low"]);
		// Height above the ground under the glider: amber when low, red when about to touch.
		const agl = Math.max(0, p.y - groundBelow(sim));
		this.text("alt", ui.altVal, String(Math.round(agl)));
		this.flag("agl", ui.altPill, agl < GROUND_DANGER ? "danger" : agl < GROUND_LOW ? "near" : "", ["danger", "near"]);
		// Variometer: the one number that says whether this air is worth circling in.
		const climb = flying ? sim.climb : 0;
		this.text("vario", ui.varioVal, varioText(climb));
		this.flag("vario", ui.varioPill, climb > VARIO_CLIMBING ? "up" : climb < VARIO_SINKING_FAST ? "down" : "", ["up", "down"]);
		this.text("spd", ui.spdVal, String(Math.round(p.v * 3.6)));
		this.style("knob", ui.knob, "transform", `translate(${(knob.x * 46).toFixed(0)}px,${(-knob.y * 46).toFixed(0)}px)`);
		let warn = "";
		if (flying && p.v < STALL_SPEED) warn = "STALL";
		else if (flying && sinkingIntoGround(agl, sim.climb)) warn = "PULL UP";
		this.text("warn", ui.warn, warn);

		if (this.toastT > 0) {
			this.toastT = Math.max(0, this.toastT - dt);
			const a = Math.min(1, this.toastT / TOAST_FADE);
			this.style("toastA", ui.toast, "opacity", a.toFixed(2));
		}
		if (this.bannerT > 0) {
			this.bannerT = Math.max(0, this.bannerT - dt);
			if (this.bannerT === 0) ui.banner.hidden = true;
		}
	}

	rival(view: RivalView, best: number, onTap: (userId: string) => void): void {
		const el = this.ui.rival;
		const key = view.target
			? `t|${view.target.userId}|${view.target.score}|${view.target.name}|${view.target.picture}`
			: view.leading
				? `lead|${best}`
				: "none";
		if (key === this.lastRivalKey) return;
		this.lastRivalKey = key;
		// No other scores yet: no leaderboard layer at all.
		if (view.others === 0) {
			el.hidden = true;
			return;
		}
		el.hidden = false;
		el.classList.toggle("lead", !view.target);
		const target = view.target;
		if (target) {
			const who = document.createElement("span");
			who.className = "who";
			who.textContent = `To beat: ${target.name} · ${target.score}`;
			el.replaceChildren(avatar(target), who);
			el.onclick = () => onTap(target.userId);
		} else {
			el.textContent = "🏆 You lead the valley";
			el.onclick = null;
		}
	}
}

export function avatar(p: Profile): HTMLElement {
	if (p.picture) {
		const img = document.createElement("img");
		img.className = "av";
		img.alt = "";
		img.src = p.picture;
		img.onerror = () => img.replaceWith(initialsBadge(p.name));
		return img;
	}
	return initialsBadge(p.name);
}

function initialsBadge(name: string): HTMLElement {
	const span = document.createElement("span");
	span.className = "av";
	span.textContent = initials(name);
	return span;
}
