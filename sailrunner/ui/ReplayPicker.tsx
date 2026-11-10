import type { PoeUserInfo } from "poe-tiles-sdk/v1/shared.js";
import { formatTime } from "../game/format";
import { Avatar } from "./Avatar";
import { playerName, type RunRow } from "./data";

const REPLAY_SPEEDS = [1, 2, 4];

/** Cycle 1× → 2× → 4× → 1×. */
export function nextReplaySpeed(speed: number): number {
	return REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(speed) + 1) % REPLAY_SPEEDS.length] ?? 1;
}

interface Props {
	label: string;
	runs: RunRow[];
	profiles: Record<string, PoeUserInfo>;
	userId: string;
	onWatch(run: RunRow): void;
	onProfile(userId: string): void;
	onClose(): void;
}

export function ReplayPicker({ label, runs, profiles, userId, onWatch, onProfile, onClose }: Props) {
	return (
		<div className="sheet-backdrop" role="presentation">
			<div className="sheet replay-sheet" role="dialog" aria-label="Replays">
				<div className="sheet-header">
					<h2>Replays · {label}</h2>
					<button type="button" className="icon-button" onClick={onClose} aria-label="Close replays">
						✕
					</button>
				</div>
				<ol className="replay-list">
					{runs.map((run, index) => {
						const profile = profiles[run.userId];
						return (
							<li key={run.userId} className="replay-row">
								<span className="rank">{index + 1}</span>
								<button
									type="button"
									className="avatar-button"
									onClick={() => onProfile(run.userId)}
									aria-label={`Open ${playerName(profile)}'s profile`}
								>
									<Avatar profile={profile} size={32} />
								</button>
								<span className="replay-name">
									{playerName(profile)}
									{run.userId === userId ? " (you)" : ""}
								</span>
								<span className="replay-time">{formatTime(run.timeMs)}</span>
								<button
									type="button"
									className="watch"
									onClick={() => onWatch(run)}
									data-testid={`watch-${run.userId}`}
								>
									▶ Watch
								</button>
							</li>
						);
					})}
				</ol>
			</div>
		</div>
	);
}

export function ReplayBar({
	profile,
	timeMs,
	speed,
	onSpeed,
	onClose,
}: {
	profile: PoeUserInfo | undefined;
	timeMs: number;
	speed: number;
	onSpeed(): void;
	onClose(): void;
}) {
	return (
		<div className="replay-bar" data-testid="replay-bar">
			<Avatar profile={profile} size={26} />
			<span className="replay-title">
				Watching {playerName(profile)} · {formatTime(timeMs)}
			</span>
			<button type="button" className="secondary small" onClick={onSpeed} aria-label="Replay speed">
				{speed}×
			</button>
			<button type="button" className="icon-button" onClick={onClose} aria-label="Stop replay">
				✕
			</button>
		</div>
	);
}
