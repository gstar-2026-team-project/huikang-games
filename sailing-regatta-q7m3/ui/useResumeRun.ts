import { type RefObject, useEffect, useRef, useState } from "react";
import { MAX_RUN_MS } from "../game/constants";
import { type RaceState, resumeRace } from "../game/race";
import type { AppProps } from "./app-contract";
import type { DayData } from "./data";
import type { Phase } from "./Regatta";

/** Longest wait for the first server pull before resuming from the local cache. */
const RESUME_SETTLE_MS = 1500;

/**
 * Resume (or retire) a run left in progress by a reload or navigation. The
 * clock kept running while the player was away; they restart from the last
 * mark they rounded.
 */
export function useResumeRun({
	store,
	data,
	phase,
	runRef,
	resumedRunRef,
	goReady,
	onResume,
	canResume,
}: {
	store: AppProps["store"];
	data: DayData;
	phase: Phase;
	runRef: RefObject<{ runId: string; day: string } | null>;
	resumedRunRef: RefObject<string | null>;
	goReady(): void;
	onResume(race: RaceState, markIndex: number): void;
	canResume(): boolean;
}): void {
	const decided = useRef(false);
	// The local cache can briefly predate the server after a reload; give the
	// first server pull a moment before deciding whether a run is still open.
	const [settled, setSettled] = useState(false);
	useEffect(() => {
		let live = true;
		const timeout = new Promise((resolve) => setTimeout(resolve, RESUME_SETTLE_MS));
		Promise.race([store.waitForServerData(), timeout])
			.catch(() => undefined)
			.then(() => live && setSettled(true));
		return () => {
			live = false;
		};
	}, [store]);

	useEffect(() => {
		if (decided.current || !settled || !canResume()) return;
		decided.current = true;
		const active = data.activeRun;
		if (!active || phase !== "ready") return;
		const elapsed = Date.now() - active.startedAt;
		if (active.day !== data.day || elapsed >= MAX_RUN_MS - 1000 || elapsed < 0) {
			void store.mutate.abandonRun({ runId: active.runId });
			return;
		}
		runRef.current = { runId: active.runId, day: active.day };
		resumedRunRef.current = active.runId;
		const race = resumeRace(
			{
				boat: { x: active.x, y: active.y, heading: active.heading, speed: active.speed },
				markIndex: active.markIndex,
				splits: active.splits,
				trace: active.trace,
			},
			elapsed,
		);
		onResume(race, active.markIndex);
	}, [data, store, settled, phase, runRef, resumedRunRef, onResume, canResume]);

	// A resumed run that fresher data shows already ended (finished or
	// abandoned on another device) is dropped rather than raced twice.
	useEffect(() => {
		const resumed = resumedRunRef.current;
		if (!resumed || phase !== "racing" || runRef.current?.runId !== resumed) return;
		if (data.activeRun?.runId !== resumed) {
			resumedRunRef.current = null;
			goReady();
		}
	}, [data.activeRun, phase, goReady, runRef, resumedRunRef]);
}
