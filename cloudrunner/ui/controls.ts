import type { Controls } from "../game/flight";
import type { ShellRefs } from "./shell";

const DEADZONE = 0.06;
const STICK_TRAVEL = 0.38; // fraction of the zone the knob travels
/** Bank from an arrow key: about half stick, the turn that keeps a glider circling in a thermal. */
const KEY_BANK = 0.5;

/** Touch stick and keyboard, folded into one Controls value. */
export class FlightInput {
	private stick = { x: 0, y: 0 };
	private stickId: number | null = null;
	private readonly keys = new Set<string>();
	invert = false;
	/** Called on the first stick or key input of a flight. */
	onFirstInput: () => void = () => undefined;
	/** Called for Space/Enter while no flight is running. */
	onLaunchKey: () => void = () => undefined;
	private readonly cleanups: (() => void)[] = [];

	constructor(private readonly ui: ShellRefs) {
		const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
			el.addEventListener(type, fn as EventListener);
			this.cleanups.push(() => el.removeEventListener(type, fn as EventListener));
		};
		const zone = ui.stickZone;
		on(zone, "pointerdown", (e) => {
			e.preventDefault();
			this.stickId = e.pointerId;
			zone.setPointerCapture?.(e.pointerId);
			this.setStick(e);
			this.onFirstInput();
		});
		on(zone, "pointermove", (e) => { if (e.pointerId === this.stickId) this.setStick(e); });
		const endStick = (e: PointerEvent) => {
			if (e.pointerId !== this.stickId) return;
			this.stickId = null;
			this.stick.x = 0;
			this.stick.y = 0;
		};
		on(zone, "pointerup", endStick);
		on(zone, "pointercancel", endStick);

		on(ui.invert, "click", () => {
			this.invert = !this.invert;
			ui.invert.textContent = this.invert ? "Drag down: climb" : "Drag up: climb";
		});
		on(window, "keydown", (e) => {
			const k = keyName(e);
			if (k.startsWith("Arrow") || k === " ") e.preventDefault();
			if (k === " " || k === "Enter") {
				this.onLaunchKey();
				return;
			}
			this.keys.add(k);
			if (k.startsWith("Arrow") || "wasd".includes(k)) this.onFirstInput();
		});
		on(window, "keyup", (e) => { this.keys.delete(keyName(e)); });
		on(window, "blur", () => this.keys.clear());
	}

	private setStick(e: PointerEvent): void {
		const r = this.ui.stickZone.getBoundingClientRect();
		let dx = (e.clientX - (r.left + r.width / 2)) / (r.width * STICK_TRAVEL);
		let dy = -(e.clientY - (r.top + r.height / 2)) / (r.height * STICK_TRAVEL);
		const l = Math.hypot(dx, dy);
		if (l > 1) {
			dx /= l;
			dy /= l;
		}
		this.stick.x = Math.abs(dx) < DEADZONE ? 0 : dx;
		this.stick.y = Math.abs(dy) < DEADZONE ? 0 : dy;
	}

	/** Knob offset in [-1,1] for drawing. */
	get knob(): { x: number; y: number } {
		return this.stick;
	}

	read(): Controls {
		let roll = this.stick.x;
		let pitch = this.stick.y;
		const k = this.keys;
		// Keys give the half bank that holds a thermal; Shift tightens it to full bank.
		const keyBank = k.has("Shift") ? 1 : KEY_BANK;
		if (k.has("ArrowLeft") || k.has("a")) roll = -keyBank;
		if (k.has("ArrowRight") || k.has("d")) roll = keyBank;
		if (k.has("ArrowUp") || k.has("w")) pitch = 1;
		if (k.has("ArrowDown") || k.has("s")) pitch = -1;
		if (this.invert) pitch = -pitch;
		return { roll, pitch };
	}

	release(): void {
		this.stick.x = 0;
		this.stick.y = 0;
		this.stickId = null;
		this.keys.clear();
	}

	dispose(): void {
		for (const c of this.cleanups) c();
	}
}

function keyName(e: KeyboardEvent): string {
	return e.key.length === 1 ? e.key.toLowerCase() : e.key;
}
