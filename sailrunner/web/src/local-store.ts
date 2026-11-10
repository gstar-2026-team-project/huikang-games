/**
 * Browser-only stand-in for the Joiner synced store, used by the standalone
 * web build (GitHub Pages). It keeps one player's runs, in-progress run, and
 * preferences in localStorage and mirrors the rules of `synced-store/mutators`
 * minus everything that needs other players: no shared leaderboard, no
 * notifications.
 */
import type { PoeUserInfo } from "poe-tiles-sdk/v1/shared.js";
import type { AppStoreClient } from "../../client";
import { MAX_RUN_MS, MAX_SPEED, RUN_RETENTION_DAYS } from "../../game/constants";
import { courseLength, generateCourse, isDayKey, shiftDay } from "../../game/course";
import type { DayData, RunRow } from "../../ui/data";

export const LOCAL_USER_ID = "local";
export const STORAGE_KEY = "sailrunner/v1";

type ActiveRun = NonNullable<DayData["activeRun"]>;
type Mutate = AppStoreClient["mutate"];
type Input<Name extends keyof Mutate> = Parameters<Mutate[Name]>[0];

export interface LocalState {
	runs: RunRow[];
	activeRun: ActiveRun | null;
	muted: boolean;
	tutorialDone: boolean;
}

/** The slice of the browser Storage API this store needs. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const EMPTY: LocalState = { runs: [], activeRun: null, muted: false, tutorialDone: false };
const PROFILE: PoeUserInfo = { userId: LOCAL_USER_ID, displayName: "You", profilePicture: "" };

function load(storage: StorageLike | null): LocalState {
	try {
		const saved: unknown = JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null");
		if (!saved || typeof saved !== "object") return EMPTY;
		const state = saved as Partial<LocalState>;
		return {
			runs: Array.isArray(state.runs) ? state.runs : [],
			activeRun: state.activeRun ?? null,
			muted: state.muted === true,
			tutorialDone: state.tutorialDone === true,
		};
	} catch {
		// Blocked or corrupt storage: start fresh rather than fail to load.
		return EMPTY;
	}
}

export class LocalStore {
	private state: LocalState;
	private listeners = new Set<() => void>();

	constructor(private storage: StorageLike | null) {
		this.state = load(storage);
	}

	getState = (): LocalState => this.state;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	private update(patch: Partial<LocalState>): void {
		this.state = { ...this.state, ...patch };
		try {
			this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.state));
		} catch {
			// Private windows and full quotas still get a playable session.
		}
		for (const listener of this.listeners) listener();
	}

	startRun(input: Input<"startRun">): void {
		if (!isDayKey(input.day)) throw new Error(`Invalid day ${input.day}`);
		if (this.state.activeRun?.runId === input.runId) return;
		const course = generateCourse(input.day);
		this.update({
			activeRun: {
				runId: input.runId,
				day: input.day,
				startedAt: input.startedAt,
				markIndex: 0,
				x: course.start.x,
				y: course.start.y,
				heading: input.heading,
				speed: 0,
				splits: [],
				trace: [],
			},
		});
	}

	checkpointRun(input: Input<"checkpointRun">): void {
		const current = this.state.activeRun;
		if (current?.runId !== input.runId || input.markIndex <= current.markIndex) return;
		this.update({
			activeRun: {
				...current,
				markIndex: input.markIndex,
				x: input.x,
				y: input.y,
				heading: input.heading,
				speed: input.speed,
				splits: [...input.splits],
				trace: [...input.trace],
			},
		});
	}

	finishRun(input: Input<"finishRun">): void {
		if (!isDayKey(input.day)) throw new Error(`Invalid day ${input.day}`);
		const current = this.state.activeRun;
		if (current?.runId !== input.runId || current.day !== input.day) return;
		const course = generateCourse(input.day);
		const fastestPossibleMs = (courseLength(course) / MAX_SPEED) * 1000;
		if (
			input.splits.length !== course.marks.length ||
			input.splits[input.splits.length - 1] !== input.timeMs ||
			input.timeMs < fastestPossibleMs ||
			input.timeMs > MAX_RUN_MS
		) {
			throw new Error("Run result is not consistent with the course");
		}
		const cutoff = shiftDay(input.day, RUN_RETENTION_DAYS);
		const kept = this.state.runs.filter((run) => run.day >= cutoff);
		const previous = kept.find((run) => run.day === input.day);
		if (previous && previous.timeMs <= input.timeMs) {
			this.update({ activeRun: null, runs: kept });
			return;
		}
		this.update({
			activeRun: null,
			runs: [
				...kept.filter((run) => run !== previous),
				{
					userId: LOCAL_USER_ID,
					day: input.day,
					timeMs: input.timeMs,
					splits: [...input.splits],
					trace: [...input.trace],
					finishedAt: input.finishedAt,
				},
			],
		});
	}

	abandonRun(input: Input<"abandonRun">): void {
		if (this.state.activeRun?.runId === input.runId) this.update({ activeRun: null });
	}

	completeTutorial(): void {
		if (!this.state.tutorialDone) this.update({ tutorialDone: true });
	}

	setMuted(input: Input<"setMuted">): void {
		this.update({ muted: input.muted });
	}

	/** The subset of the synced-store client the UI calls, backed by this store. */
	client(): AppStoreClient {
		const run = <T>(action: (input: T) => void) => async (input: T) => action(input);
		const client = {
			waitForBootstrap: async () => undefined,
			waitForServerData: async () => undefined,
			makeUniqueId: async () => crypto.randomUUID(),
			mutate: {
				startRun: run<Input<"startRun">>((input) => this.startRun(input)),
				checkpointRun: run<Input<"checkpointRun">>((input) => this.checkpointRun(input)),
				finishRun: run<Input<"finishRun">>((input) => this.finishRun(input)),
				abandonRun: run<Input<"abandonRun">>((input) => this.abandonRun(input)),
				completeTutorial: run<Input<"completeTutorial">>(() => this.completeTutorial()),
				setMuted: run<Input<"setMuted">>((input) => this.setMuted(input)),
			},
		};
		// Only these members are used by the UI; the rest of the SDK client
		// (sync, files, agents) has no meaning without a server.
		return client as unknown as AppStoreClient;
	}
}

/** Shape one day's local state the way the tile's live query does. */
export function toDayData(state: LocalState, day: string): DayData {
	return {
		day,
		userId: LOCAL_USER_ID,
		runs: state.runs.filter((run) => run.day === day).sort((a, b) => a.timeMs - b.timeMs),
		// No shared leaderboard on the web: an empty board hides its entry points.
		board: { entries: [] } as unknown as DayData["board"],
		activeRun: state.activeRun ?? undefined,
		muted: state.muted,
		tutorialDone: state.tutorialDone,
		profiles: { [LOCAL_USER_ID]: PROFILE },
	};
}
