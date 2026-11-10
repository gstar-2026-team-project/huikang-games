import { createSim, NO_CONTROLS, type Sim, type SimEvent, stepSim } from "../game/flight";
import { levelCourse, levelStars } from "../game/levels";
import { DAILY, daySeed, ENDLESS, LEVEL_COUNT, levelSeed } from "../game/modes";
import { dailyBoardId, LEADERBOARD_ID, type RunEndReason } from "../synced-store/constants";
import type { BoardEntryView, StoreView } from "../synced-store/data/view";
import type { AppProps } from "./app-contract";
import type { FlightInput } from "./controls";
import type { Hud } from "./hud";
import { homePanel, levelsPanel, loadingPanel, overPanel, type PanelAction, type PanelModel, pausedPanel, renderPanel } from "./menu";
import { newlyPassed, type Profile, rivalView } from "./rivals";
import type { ShellRefs } from "./shell";

export type Screen = "loading" | "home" | "levels" | "play" | "paused" | "over";
export type FlightMode = { kind: "free" } | { kind: "daily"; day: string } | { kind: "level"; level: number };

/** Readable beat between the decisive moment and the end panel / host sheet. */
const END_BEAT_MS = 1000;
const MENU_SEED = 20240611;

const END_COPY: Record<RunEndReason, string> = {
	ground: "You hit the ground",
	time: "Out of time",
	interrupted: "Flight cut short",
	complete: "Course complete",
};

/** Owns one flight at a time: take-off, checkpoints, the end reveal and tile-end. */
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
	}

	setView(view: StoreView): void {
		this.view = view;
		this.profiles = new Map(view.profiles);
		if (this.screen === "home") this.showHome();
		else if (this.screen === "levels") this.show("levels", levelsPanel(view.stars));
		this.refreshRival();
	}

	/** After bootstrap: settle a flight left open by a reload, then show the menu. */
	ready(view: StoreView): void {
		this.setView(view);
		const run = view.run;
		if (run?.status === "flying") {
			this.call(this.props.store.mutate.finishRun({ runId: run.runId, rings: run.rings, endedAt: Date.now(), reason: "interrupted" }));
		}
		this.showHome();
	}

	/** One handler for every panel button and launch key. */
	act(action: PanelAction, level?: number): void {
		const v = this.view;
		switch (action) {
			case "daily": void this.takeOff({ kind: "daily", day: this.today() }); break;
			case "free": void this.takeOff({ kind: "free" }); break;
			case "levels": this.show("levels", levelsPanel(v?.stars ?? [])); break;
			case "level": if (level) void this.takeOff({ kind: "level", level }); break;
			case "again": void this.takeOff(this.mode.kind === "daily" ? { kind: "daily", day: this.today() } : this.mode); break;
			case "next":
				if (this.mode.kind === "level" && this.mode.level < LEVEL_COUNT) void this.takeOff({ kind: "level", level: this.mode.level + 1 });
				break;
			case "resume": if (this.screen === "paused") this.show("play", null); break;
			case "menu":
				if (this.screen === "paused") this.abandon();
				this.showHome();
				break;
			case "back": this.showHome(); break;
			case "invite":
				void this.props.poe.room.openInvitePicker().catch(() => this.showError("Could not open the invite sheet."));
				break;
		}
	}

	private showHome(): void {
		const v = this.view;
		const day = this.today();
		const mine = v?.daily.find((e) => e.userId === v.me);
		this.show("home", homePanel({ day, dailyBest: mine ? { rings: mine.score, seconds: mine.seconds ?? 0 } : null, freeBest: v?.pilot?.best ?? 0, stars: v?.stars ?? [] }));
	}

	async takeOff(mode: FlightMode): Promise<void> {
		if (this.screen === "play" || this.screen === "loading") return;
		if (mode.kind === "daily" && !mode.day) return;
		this.clearEndTimer();
		const runId = await this.props.store.makeUniqueId();
		const seed =
			mode.kind === "daily" ? daySeed(mode.day)
			: mode.kind === "level" ? levelSeed(mode.level)
			: Math.floor(Math.random() * 2 ** 31);
		this.mode = mode;
		this.runId = runId;
		this.sim = createSim(seed, mode.kind === "level" ? levelCourse(mode.level) : mode.kind === "daily" ? DAILY : ENDLESS);
		if (this.sim.spec.authored) this.hud.toast(this.sim.spec.authored.tip);
		this.passed = new Set();
		this.input.release();
		this.call(
			this.props.store.mutate.startRun({
				runId, seed, startedAt: Date.now(), mode: mode.kind,
				...(mode.kind === "daily" ? { day: mode.day } : {}),
				...(mode.kind === "level" ? { level: mode.level } : {}),
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

	/** Quitting from pause still counts the flight; the rings so far are kept. */
	private abandon(): void {
		if (!this.runId || this.sim.phase !== "flying") return;
		this.sim.phase = "ended";
		this.call(this.props.store.mutate.finishRun({ runId: this.runId, rings: this.sim.score, endedAt: Date.now(), reason: "interrupted" }));
		this.runId = null;
	}

	step(dt: number): void {
		if (this.screen !== "play") return;
		if (this.input.pendingThrottle !== null) {
			this.sim.throttle = this.input.pendingThrottle;
			this.input.pendingThrottle = null;
		}
		const ctl = this.sim.phase === "flying" ? this.input.read() : NO_CONTROLS;
		const before = this.sim.score;
		stepSim(this.sim, ctl, dt, this.events);
		if (this.sim.score !== before) this.checkOvertakes(before, this.sim.score);
		for (const e of this.events) this.handle(e);
		this.events.length = 0;
	}

	private handle(e: SimEvent): void {
		const haptics = this.props.poe.haptics;
		switch (e.kind) {
			case "ring":
				this.hud.toast(this.missionToast(e.index, true) ?? (e.bonus > 0 ? `+${e.bonus.toFixed(1)}s` : `${this.sim.score} ${this.sim.score === 1 ? "ring" : "rings"}`));
				haptics.impact("light");
				if (this.runId) {
					this.call(this.props.store.mutate.passRing({ runId: this.runId, rings: this.sim.score }, { pendingMutationDedupeKey: "ring-checkpoint" }));
				}
				this.refreshRival();
				break;
			case "miss": this.hud.toast(this.missionToast(e.index, false) ?? (e.why === "fast" ? "Too fast!" : e.why === "slow" ? "Too slow!" : "Missed")); haptics.impact("soft"); break;
			case "crash": haptics.notification("error"); this.finish("ground"); break;
			case "timeout": haptics.notification("warning"); this.finish("time"); this.revealEndAfterBeat(); break;
			case "complete": {
				const ok = this.mode.kind === "level" && levelStars(this.mode.level, this.sim.score, true, this.targetHit()) > 0;
				haptics.notification(ok ? "success" : "warning");
				this.finish("complete");
				this.revealEndAfterBeat();
				break;
			}
			case "ended": this.revealEndAfterBeat(); break;
		}
	}

	/** Persist the result the moment it is known; only the reveal waits. */
	private finish(reason: RunEndReason): void {
		this.input.release();
		this.hud.toast(END_COPY[reason]);
		if (!this.runId) return;
		const targetHit = this.sim.spec.authored ? { targetHit: this.targetHit() } : this.mode.kind === "daily" ? { lastRingAt: this.sim.lastRingAt } : {};
		this.call(this.props.store.mutate.finishRun({ runId: this.runId, rings: this.sim.score, endedAt: Date.now(), reason, ...targetHit }));
	}

	private targetHit(): boolean {
		return this.sim.rings.find((r) => r.target)?.hit === true;
	}

	/** Finale callouts: the target result, else the phase the next ring opens. */
	private missionToast(index: number, hit: boolean): string | null {
		const authored = this.sim.spec.authored;
		if (!authored) return null;
		if (this.sim.rings[index]?.target) return hit ? "Target hit!" : "Target missed";
		return authored.callout(index + 1);
	}

	private revealEndAfterBeat(): void {
		this.clearEndTimer();
		const runId = this.runId;
		const mode = this.mode;
		const reason = this.sim.endReason ?? "time";
		this.endTimer = setTimeout(() => {
			this.endTimer = null;
			if (this.runId !== runId || this.screen !== "play") return;
			const rings = this.sim.score;
			const v = this.view;
			const board = mode.kind === "daily" ? v?.daily : v?.entries;
			const prevBest = mode.kind === "free" ? v?.pilot?.best ?? 0 : myScore(board, v?.me);
			this.lastOver = overPanel({
				mode: mode.kind,
				title: END_COPY[reason],
				rings,
				best: Math.max(prevBest, rings),
				...(mode.kind === "daily" ? { day: mode.day, seconds: this.sim.lastRingAt, bestEntry: dailyBest(v?.daily, v?.me, rings, this.sim.lastRingAt) } : {}),
				...(mode.kind === "level"
					? { level: mode.level, stars: levelStars(mode.level, rings, reason === "complete", this.targetHit()), ...(this.sim.spec.authored ? { targetHit: this.targetHit() } : {}) }
					: {}),
			});
			this.show("over", this.lastOver);
			// Scored modes conclude on the host's ranked sheet; levels end on the panel.
			if (mode.kind !== "level" && (rings > 0 || (board?.length ?? 0) > 0)) {
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
			if (this.mode.kind === "level") return null;
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
		const score = flying ? this.sim.score : myScore(board, view.me);
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
	}
}

function myScore(board: readonly BoardEntryView[] | undefined, me: string | undefined): number {
	return board?.find((e) => e.userId === me)?.score ?? 0;
}

/** Best of today's saved daily entry and this run: more rings, then sooner. */
function dailyBest(board: readonly BoardEntryView[] | undefined, me: string | undefined, rings: number, seconds: number) {
	const saved = board?.find((e) => e.userId === me);
	if (!saved || rings > saved.score || (rings === saved.score && seconds < (saved.seconds ?? 99))) return { rings, seconds };
	return { rings: saved.score, seconds: saved.seconds ?? 0 };
}
