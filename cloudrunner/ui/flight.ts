import { createSim, groundBelow, NO_CONTROLS, type Sim, type SimEvent, stepSim } from "../game/flight";
import { DAILY, daySeed, FREE, turnpointsText } from "../game/modes";
import { thermalsNear } from "../game/thermals";
import { dailyBoardId, LEADERBOARD_ID, type RunEndReason } from "../synced-store/constants";
import type { BoardEntryView, StoreView } from "../synced-store/data/view";
import type { AppProps } from "./app-contract";
import type { FlightInput } from "./controls";
import type { Hud } from "./hud";
import { homePanel, loadingPanel, overPanel, type PanelAction, type PanelModel, pausedPanel, renderPanel } from "./menu";
import { newlyPassed, type Profile, rivalView } from "./rivals";
import type { ShellRefs } from "./shell";

export type Screen = "loading" | "home" | "play" | "paused" | "over";
export type FlightMode = { kind: "free" } | { kind: "daily"; day: string };

/** Read-only snapshot for automated play: where the glider is, and the air and beacons around it. */
export interface CloudrunnerProbe {
	screen: Screen;
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
	speed: number;
	/** climb rate, m/s up */
	climb: number;
	/** metres above the ground below */
	agl: number;
	elapsed: number;
	/** turnpoints reached so far */
	turnpoints: number;
	next: { x: number; z: number } | null;
	thermals: { x: number; z: number; radius: number; strength: number }[];
}

declare global {
	interface Window {
		__cloudrunnerProbe?: () => CloudrunnerProbe;
	}
}

/** Readable beat between the decisive moment and the end panel / host sheet. */
const END_BEAT_MS = 1000;
const MENU_SEED = 20240611;

const END_TOAST: Record<RunEndReason, string> = {
	ground: "Landed out",
	time: "Out of time",
	interrupted: "Flight cut short",
	complete: "Task complete!",
};

/** Owns one flight at a time: launch, checkpoints, the end reveal and tile-end. */
export class FlightController {
	sim: Sim = createSim(MENU_SEED);
	screen: Screen = "loading";
	mode: FlightMode = { kind: "free" };
	private runId: string | null = null;
	private view: StoreView | null = null;
	private profiles = new Map<string, Profile>();
	private passed = new Set<string>();
	private endTimer: ReturnType<typeof setTimeout> | null = null;
	private hintShown = true;
	private lastOver: PanelModel | null = null;
	private readonly events: SimEvent[] = [];
	onScreenChange: () => void = () => undefined;
	/** Asked before a daily flight: today's date key, refreshing the view if the day rolled over. */
	today: () => string = () => this.view?.day ?? "";

	constructor(
		private readonly props: AppProps,
		private readonly ui: ShellRefs,
		private readonly input: FlightInput,
		private readonly hud: Hud,
		private readonly showError: (msg: string) => void,
	) {
		this.show("loading", loadingPanel());
		input.onFirstInput = () => {
			if (this.screen === "play" && this.hintShown) {
				this.hintShown = false;
				ui.hint.hidden = true;
			}
		};
		input.onLaunchKey = () => {
			if (this.screen === "paused") this.act("resume");
			else if (this.screen === "home") this.act("daily");
			else if (this.screen === "over") this.act(this.lastOver?.buttons[0]?.action ?? "again");
		};
		window.__cloudrunnerProbe = () => this.probe();
	}

	private probe(): CloudrunnerProbe {
		const sim = this.sim;
		const p = sim.plane;
		const tp = sim.turnpoints[sim.next];
		return {
			screen: this.screen,
			x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
			speed: p.v,
			climb: sim.climb,
			agl: p.y - groundBelow(sim),
			elapsed: sim.elapsed,
			turnpoints: sim.next,
			next: tp ? { x: tp.x, z: tp.z } : null,
			thermals: thermalsNear(sim.seed, p.x, p.z, sim.elapsed, 2).map((th) => ({ x: th.x, z: th.z, radius: th.radius, strength: th.strength })),
		};
	}

	setView(view: StoreView): void {
		this.view = view;
		this.profiles = new Map(view.profiles);
		if (this.screen === "home") this.showHome();
		this.refreshRival();
	}

	/** After bootstrap: settle a flight left open by a reload, then show the menu. */
	ready(view: StoreView): void {
		this.setView(view);
		const run = view.run;
		if (run?.status === "flying") {
			this.call(this.props.store.mutate.finishRun({ runId: run.runId, turnpoints: run.turnpoints, endedAt: Date.now(), reason: "interrupted" }));
		}
		this.showHome();
	}

	/** One handler for every panel button and launch key. */
	act(action: PanelAction): void {
		switch (action) {
			case "daily": void this.launch({ kind: "daily", day: this.today() }); break;
			case "free": void this.launch({ kind: "free" }); break;
			case "again": void this.launch(this.mode.kind === "daily" ? { kind: "daily", day: this.today() } : this.mode); break;
			case "resume": if (this.screen === "paused") this.show("play", null); break;
			case "menu":
				if (this.screen === "paused") this.abandon();
				this.showHome();
				break;
			case "invite":
				void this.props.poe.room.openInvitePicker().catch(() => this.showError("Could not open the invite sheet."));
				break;
		}
	}

	private showHome(): void {
		const v = this.view;
		const mine = v?.daily.find((e) => e.userId === v.me);
		this.show("home", homePanel({
			day: this.today(),
			dailyBest: mine ? { turnpoints: mine.score, seconds: mine.seconds ?? 0 } : null,
			freeBest: v?.pilot?.best ?? 0,
		}));
	}

	async launch(mode: FlightMode): Promise<void> {
		if (this.screen === "play" || this.screen === "loading") return;
		if (mode.kind === "daily" && !mode.day) return;
		this.clearEndTimer();
		const runId = await this.props.store.makeUniqueId();
		const seed = mode.kind === "daily" ? daySeed(mode.day) : Math.floor(Math.random() * 2 ** 31);
		this.mode = mode;
		this.runId = runId;
		this.sim = createSim(seed, mode.kind === "daily" ? DAILY : FREE);
		this.passed = new Set();
		this.input.release();
		this.call(
			this.props.store.mutate.startRun({
				runId, seed, startedAt: Date.now(), mode: mode.kind,
				...(mode.kind === "daily" ? { day: mode.day } : {}),
			}),
		);
		this.ui.hint.hidden = !this.hintShown;
		this.show("play", null);
	}

	pause(): void {
		if (this.screen !== "play" || this.sim.phase !== "flying") return;
		this.input.release();
		this.show("paused", pausedPanel());
	}

	/** Quitting from pause still counts the flight; the turnpoints so far are kept. */
	private abandon(): void {
		if (!this.runId || this.sim.phase !== "flying") return;
		this.sim.phase = "ended";
		this.call(this.props.store.mutate.finishRun({ runId: this.runId, endedAt: Date.now(), reason: "interrupted", ...this.result() }));
		this.runId = null;
	}

	step(dt: number): void {
		if (this.screen !== "play") return;
		const ctl = this.sim.phase === "flying" ? this.input.read() : NO_CONTROLS;
		const before = this.sim.next;
		stepSim(this.sim, ctl, dt, this.events);
		if (this.sim.next !== before) this.checkOvertakes(before, this.sim.next);
		for (const e of this.events) this.handle(e);
		this.events.length = 0;
	}

	private handle(e: SimEvent): void {
		const haptics = this.props.poe.haptics;
		switch (e.kind) {
			case "turnpoint": {
				const total = this.sim.spec.count;
				this.hud.toast(total === null ? turnpointsText(this.sim.next) : `Turnpoint ${this.sim.next} of ${total}`);
				haptics.impact("light");
				if (this.runId) {
					this.call(this.props.store.mutate.reachTurnpoint({ runId: this.runId, turnpoints: this.sim.next }, { pendingMutationDedupeKey: "turnpoint-checkpoint" }));
				}
				this.refreshRival();
				break;
			}
			case "crash": haptics.notification("error"); this.finish("ground"); break;
			case "timeout": haptics.notification("warning"); this.finish("time"); this.revealEndAfterBeat(); break;
			case "complete": haptics.notification("success"); this.finish("complete"); this.revealEndAfterBeat(); break;
			case "ended": this.revealEndAfterBeat(); break;
		}
	}

	/** What a finished flight reports: turnpoints, and for the daily task when the last one was reached. */
	private result(): { turnpoints: number; seconds?: number } {
		return { turnpoints: this.sim.next, ...(this.mode.kind === "daily" && this.sim.next > 0 ? { seconds: this.sim.lastTurnpointAt } : {}) };
	}

	/** Persist the result the moment it is known; only the reveal waits. */
	private finish(reason: RunEndReason): void {
		this.input.release();
		this.hud.toast(END_TOAST[reason]);
		if (!this.runId) return;
		this.call(this.props.store.mutate.finishRun({ runId: this.runId, endedAt: Date.now(), reason, ...this.result() }));
	}

	private revealEndAfterBeat(): void {
		this.clearEndTimer();
		const runId = this.runId;
		const mode = this.mode;
		const reason = this.sim.endReason ?? "time";
		this.endTimer = setTimeout(() => {
			this.endTimer = null;
			if (this.runId !== runId || this.screen !== "play") return;
			const turnpoints = this.sim.next;
			const seconds = this.sim.lastTurnpointAt;
			const v = this.view;
			const board = mode.kind === "daily" ? v?.daily : v?.entries;
			this.lastOver = overPanel({
				mode: mode.kind,
				reason,
				turnpoints,
				best: Math.max(v?.pilot?.best ?? 0, turnpoints),
				...(mode.kind === "daily" ? { day: mode.day, seconds, bestEntry: dailyBest(v?.daily, v?.me, turnpoints, seconds) } : {}),
			});
			this.show("over", this.lastOver);
			// Both modes conclude on the host's ranked sheet once there is a score to rank.
			if (turnpoints > 0 || (board?.length ?? 0) > 0) {
				void this.openTileEnd(runId, mode.kind === "daily" ? dailyBoardId(mode.day) : LEADERBOARD_ID);
			}
		}, END_BEAT_MS);
	}

	private async openTileEnd(runId: string | null, leaderboardId: string): Promise<void> {
		try {
			const result = await this.props.poe.room.tileEnd({ leaderboardId, ...(runId ? { round: runId } : {}) });
			if (result.outcome === "playAgain" && this.runId === runId) this.act("again");
		} catch (err) {
			// The in-tile panel is already showing, so the player can still fly again.
			console.warn("tileEnd failed", err);
		}
	}

	private board(): BoardEntryView[] | null {
		const v = this.view;
		if (!v) return null;
		if (this.screen === "play" || this.screen === "paused" || this.screen === "over") {
			return this.mode.kind === "daily" ? v.daily : v.entries;
		}
		return this.screen === "home" ? v.daily : null;
	}

	private checkOvertakes(before: number, after: number): void {
		const view = this.view;
		const board = this.board();
		if (!view || !board) return;
		for (const e of newlyPassed(board, view.me, before, after, this.passed)) {
			this.passed.add(e.userId);
			const p = this.profiles.get(e.userId) ?? { name: "a pilot", picture: null };
			this.hud.banner(p.name, p.picture);
			this.props.poe.haptics.notification("success");
		}
	}

	refreshRival(): void {
		const view = this.view;
		if (!view) return;
		const board = this.board() ?? [];
		const flying = this.screen === "play" || this.screen === "paused";
		const score = flying ? this.sim.next : (board.find((e) => e.userId === view.me)?.score ?? 0);
		this.hud.rival(rivalView(board, this.profiles, view.me, score), score, (userId) => {
			void this.props.poe.users.openProfile({ userId }).catch(() => undefined);
		});
	}

	private show(screen: Screen, panel: PanelModel | null): void {
		if (panel) renderPanel(this.ui, panel);
		this.screen = screen;
		this.ui.overlay.hidden = !panel;
		this.ui.controls.classList.toggle("off", !!panel);
		this.ui.root.dataset.screen = screen;
		this.refreshRival();
		this.onScreenChange();
	}

	private clearEndTimer(): void {
		if (this.endTimer) clearTimeout(this.endTimer);
		this.endTimer = null;
	}

	private call(p: Promise<unknown>): void {
		p.catch((err: unknown) => this.showError(err instanceof Error ? err.message : String(err)));
	}

	dispose(): void {
		this.clearEndTimer();
		delete window.__cloudrunnerProbe;
	}
}

/** Best of today's saved daily entry and this flight: more turnpoints, then sooner. */
function dailyBest(board: readonly BoardEntryView[] | undefined, me: string | undefined, turnpoints: number, seconds: number) {
	const saved = board?.find((e) => e.userId === me);
	if (!saved || turnpoints > saved.score || (turnpoints === saved.score && seconds < (saved.seconds ?? Number.POSITIVE_INFINITY))) return { turnpoints, seconds };
	return { turnpoints: saved.score, seconds: saved.seconds ?? 0 };
}
