import type { PoeAPI } from "poe-tiles-sdk/v1/client.js";
import { resumeAudioContext, suppressLongPressMagnifier } from "poe-tiles-sdk/v1/client.js";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { courseLabel, dayKey } from "../../game/course";
import { formatTime } from "../../game/format";
import { Regatta } from "../../ui/Regatta";
import { type LocalStore, toDayData } from "./local-store";

/** How often to check whether the UTC day (and so the course) has rolled over. */
const DAY_CHECK_MS = 60_000;

type TileEndResult = Awaited<ReturnType<PoeAPI["room"]["tileEnd"]>>;
type EndOutcome = "playAgain" | "review";

const noop = () => undefined;

/**
 * Sailrunner outside Joiner: the same `Regatta` UI, fed from localStorage
 * instead of the synced store, with a local end-of-race sheet in place of the
 * host's leaderboard.
 */
export function WebApp({ local }: { local: LocalStore }) {
	const state = useSyncExternalStore(local.subscribe, local.getState);
	const [day, setDay] = useState(() => dayKey(Date.now()));
	const [end, setEnd] = useState<{ resolve(outcome: EndOutcome): void } | null>(null);

	useEffect(() => {
		const id = window.setInterval(() => setDay(dayKey(Date.now())), DAY_CHECK_MS);
		return () => window.clearInterval(id);
	}, []);

	const store = useMemo(() => local.client(), [local]);
	const data = useMemo(() => toDayData(state, day), [state, day]);
	const poe = useMemo(() => {
		const api = {
			haptics: { impact: noop, notification: noop, selection: noop },
			room: {
				tileEnd: () =>
					new Promise<TileEndResult>((resolve) => {
						setEnd({
							resolve: (outcome) => {
								setEnd(null);
								resolve({ outcome, playAgain: outcome === "playAgain" } as TileEndResult);
							},
						});
					}),
			},
			users: { openProfile: async () => undefined },
		};
		// Only the host capabilities the UI calls; there is no Joiner host here.
		return api as unknown as PoeAPI;
	}, []);

	const best = data.runs[0]?.timeMs ?? null;
	return (
		<>
			<Regatta
				store={store}
				poe={poe}
				resumeAudioContext={resumeAudioContext}
				suppressLongPressMagnifier={suppressLongPressMagnifier}
				data={data}
			/>
			{end && (
				<div className="sheet-backdrop" role="presentation" style={{ position: "fixed" }}>
					<div className="sheet" role="dialog" aria-label="Race results" data-testid="results-sheet">
						<h2>{courseLabel(day)}</h2>
						<p className="hint">
							{best === null ? "No finished run yet today." : `Your best today: ${formatTime(best)}`}
							<br />
							Times are saved in this browser only.
						</p>
						<button type="button" className="primary" onClick={() => end.resolve("playAgain")}>
							Race again
						</button>
						{best !== null && (
							<button type="button" className="secondary" onClick={() => end.resolve("review")}>
								▶ Watch replays
							</button>
						)}
					</div>
				</div>
			)}
		</>
	);
}
