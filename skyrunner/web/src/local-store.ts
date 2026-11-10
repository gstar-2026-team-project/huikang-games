/**
 * Browser-only stand-in for the Joiner synced store, used by the standalone
 * web build (GitHub Pages). It keeps one pilot's stats, stars, daily bests and
 * current flight in localStorage and mirrors the rules of
 * `synced-store/mutators` minus everything that needs other pilots: no shared
 * leaderboards, no notifications.
 */
import type { AppStoreClient } from "../../client";
import { levelCourse, levelStars } from "../../game/levels";
import { DAILY_SECONDS, dailyScore, dayKey, daySeed, decodeDailyScore, LEVEL_COUNT, levelSeed } from "../../game/modes";
import type { RunEndReason } from "../../synced-store/constants";
import type { StoreView } from "../../synced-store/data/view";
import type { PilotRow, RunRow } from "../../synced-store/schema";

export const LOCAL_USER_ID = "local";
export const STORAGE_KEY = "skyrunner/v1";

type Mutate = AppStoreClient["mutate"];
type Input<Name extends keyof Mutate> = Parameters<Mutate[Name]>[0];

export interface LocalState {
	pilot: PilotRow | null;
	run: RunRow | null;
	stars: number[];
	/** Best packed daily score (see `dailyScore`) per day key. */
	daily: Record<string, number>;
}

/** The slice of the browser Storage API this store needs. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const EMPTY: LocalState = { pilot: null, run: null, stars: [], daily: {} };

function load(storage: StorageLike | null): LocalState {
	try {
		const saved: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null");
		if (!saved || typeof saved !== "object") return EMPTY;
		const state = saved as Partial<LocalState>;
		return {
			pilot: state.pilot ?? null,
			run: state.run ?? null,
			stars: Array.isArray(state.stars) ? state.stars : [],
			daily: state.daily && typeof state.daily === "object" ? state.daily : {},
		};
	} catch {
		// Blocked or corrupt storage: start fresh rather than fail to load.
		return EMPTY;
	}
}

export class LocalStore {
	private state: LocalState;
	private listeners = new Set<() => void>();

	constructor(
		private storage: StorageLike | null,
		private now: () => number = Date.now,
	) {
		this.state = load(storage);
	}

	getState(): LocalState {
		return this.state;
	}

	private update(patch: Partial<LocalState>): void {
		this.state = { ...this.state, ...patch };
		try {
			this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
		} catch {
			// Private windows and full quotas still get a playable session.
		}
		for (const listener of this.listeners) listener();
	}

	/** What the flight screens read, shaped like the tile's `readView`. */
	view(day = dayKey(this.now())): StoreView {
		const { pilot, run, stars, daily } = this.state;
		const today = daily[day];
		const best = today === undefined ? null : decodeDailyScore(today);
		return {
			me: LOCAL_USER_ID,
			day,
			// The only pilot here is you, so the boards never show a rival.
			entries: pilot && pilot.best > 0 ? [{ userId: LOCAL_USER_ID, score: pilot.best }] : [],
			daily: best ? [{ userId: LOCAL_USER_ID, score: best.rings, seconds: best.seconds }] : [],
			profiles: [[LOCAL_USER_ID, { name: "You", picture: null }]],
			pilot,
			run,
			stars: [...stars],
		};
	}

	startRun(input: Input<"startRun">): void {
		const mode = input.mode ?? "free";
		if (mode === "daily" && !input.day) return;
		if (mode === "level" && !input.level) return;
		const open = this.state.run;
		if (open?.runId === input.runId) return;
		// A flight left open (closed tab, reload) counts as flown, not undone.
		if (open?.status === "flying") this.finalize(open, open.rings, input.startedAt, "interrupted");
		const seed =
			mode === "daily" && input.day
				? daySeed(input.day)
				: mode === "level" && input.level
					? levelSeed(input.level)
					: input.seed;
		this.update({
			run: {
				runId: input.runId,
				seed,
				rings: 0,
				status: "flying",
				startedAt: input.startedAt,
				endedAt: null,
				reason: null,
				mode,
				...(mode === "daily" ? { day: input.day } : {}),
				...(mode === "level" ? { level: input.level } : {}),
			},
		});
	}

	passRing(input: Input<"passRing">): void {
		const run = this.state.run;
		if (!run || run.runId !== input.runId || run.status !== "flying") return;
		if (input.rings <= run.rings) return;
		this.update({ run: { ...run, rings: input.rings } });
	}

	finishRun(input: Input<"finishRun">): void {
		const run = this.state.run;
		if (!run || run.runId !== input.runId || run.status !== "flying") return;
		this.finalize(run, input.rings, input.endedAt, input.reason, input.targetHit ?? false, input.lastRingAt);
	}

	/** Close a flying run exactly once and fold it into the stats for its mode. */
	private finalize(
		run: RunRow,
		reportedRings: number,
		endedAt: number,
		reason: RunEndReason,
		targetHit = false,
		lastRingAt?: number,
	): void {
		const mode = run.mode ?? "free";
		let rings = Math.max(reportedRings, run.rings);
		if (mode === "level" && run.level) rings = Math.min(rings, levelCourse(run.level).ringCount ?? rings);
		const prev = this.state.pilot;
		const patch: Partial<LocalState> = {
			run: { ...run, rings, status: "done", endedAt, reason },
			pilot: {
				userId: LOCAL_USER_ID,
				best: Math.max(prev?.best ?? 0, mode === "free" ? rings : 0),
				flights: (prev?.flights ?? 0) + 1,
				totalRings: (prev?.totalRings ?? 0) + rings,
				lastRings: rings,
				updatedAt: endedAt,
			},
		};
		if (mode === "daily" && run.day && rings > 0) {
			const score = dailyScore(rings, Math.min(DAILY_SECONDS, lastRingAt ?? DAILY_SECONDS));
			const days = Object.entries(this.state.daily);
			// Only today's best is ever shown, so older days are dropped.
			const kept = Object.fromEntries(days.filter(([day]) => day === run.day));
			patch.daily = { ...kept, [run.day]: Math.max(score, kept[run.day] ?? 0) };
		} else if (mode === "level" && run.level) {
			const stars = levelStars(run.level, rings, reason === "complete", targetHit);
			const prevStars = this.state.stars;
			if (stars > (prevStars[run.level - 1] ?? 0)) {
				const next = Array.from({ length: Math.max(prevStars.length, run.level) }, (_, i) => prevStars[i] ?? 0);
				next[run.level - 1] = stars;
				patch.stars = next.slice(0, LEVEL_COUNT);
			}
		}
		this.update(patch);
	}

	/** The subset of the synced-store client the UI calls, backed by this store. */
	client(): AppStoreClient {
		const run = <T>(action: (input: T) => void) => async (input: T) => action(input);
		const client = {
			waitForBootstrap: async () => undefined,
			makeUniqueId: async () => crypto.randomUUID(),
			// Readers are written against the synced store; here the view is local.
			query: async () => this.view(),
			subscribe: (_reader: unknown, onView: (view: StoreView) => void) => {
				const listener = () => onView(this.view());
				this.listeners.add(listener);
				queueMicrotask(listener);
				return () => this.listeners.delete(listener);
			},
			mutate: {
				startRun: run<Input<"startRun">>((input) => this.startRun(input)),
				passRing: run<Input<"passRing">>((input) => this.passRing(input)),
				finishRun: run<Input<"finishRun">>((input) => this.finishRun(input)),
			},
		};
		// Only these members are used by the UI; the rest of the SDK client
		// (sync, files, agents) has no meaning without a server.
		return client as unknown as AppStoreClient;
	}
}
