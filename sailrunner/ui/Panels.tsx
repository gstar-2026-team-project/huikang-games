import type { PoeUserInfo } from "poe-tiles-sdk/v1/shared.js";
import { formatSpeed, formatTime } from "../game/format";
import type { RaceStats } from "../game/stats";
import { Avatar } from "./Avatar";
import { playerName } from "./data";

export function ReadyPanel({
	label,
	bestMs,
	hasRuns,
	hasBoard,
	onStart,
	onReplays,
	onBoard,
	lessonFirst,
	onLesson,
}: {
	label: string;
	bestMs: number | null;
	hasRuns: boolean;
	hasBoard: boolean;
	onStart(): void;
	onReplays(): void;
	onBoard(): void;
	/** New sailors see the lesson offered first. */
	lessonFirst: boolean;
	onLesson(): void;
}) {
	return (
		<div className="ready-panel">
			<p className="hint">
				Hold <b>◀</b> <b>▶</b> to steer. You can't sail straight into the wind, so zig-zag to reach
				upwind buoys.
			</p>
			<div className="ready-meta">
				<span>{label}</span>
				{bestMs !== null && <span>Your best {formatTime(bestMs)}</span>}
			</div>
			{lessonFirst && (
				<button type="button" className="lesson-offer" onClick={onLesson} data-testid="start-lesson">
					<span>🎓 New to sailing?</span>
					<span className="lesson-offer-sub">Take the 1-minute lesson on steering and sailing upwind</span>
				</button>
			)}
			<button type="button" className="primary" onClick={onStart} data-testid="start-race">
				Start race
			</button>
			{!lessonFirst && (
				<button type="button" className="text-button" onClick={onLesson} data-testid="start-lesson">
					🎓 Learn to sail
				</button>
			)}
			{(hasRuns || hasBoard) && (
				<div className="ready-row">
					{hasRuns && (
						<button type="button" className="secondary" onClick={onReplays} data-testid="open-replays">
							▶ Watch replays
						</button>
					)}
					{hasBoard && (
						<button type="button" className="secondary" onClick={onBoard}>
							🏆 Leaderboard
						</button>
					)}
				</div>
			)}
		</div>
	);
}

export interface FinishInfo {
	timeMs: number;
	newBest: boolean;
	passed: PoeUserInfo[];
	stats: RaceStats;
}

export function FinishBanner({ info }: { info: FinishInfo }) {
	return (
		<div className="finish-banner" data-testid="finish-banner" role="status">
			<span className="finish-title">Finished!</span>
			<span className="finish-time">{formatTime(info.timeMs)}</span>
			{info.newBest && <span className="finish-best">New personal best</span>}
			<dl className="finish-stats" data-testid="finish-stats">
				<div>
					<dt>Avg speed</dt>
					<dd>{formatSpeed(info.stats.avgSpeed)}</dd>
				</div>
				<div>
					<dt>Top speed</dt>
					<dd>{formatSpeed(info.stats.topSpeed)}</dd>
				</div>
				<div>
					<dt>Velocity to buoys</dt>
					<dd>{formatSpeed(info.stats.avgVmg)}</dd>
				</div>
				<div>
					<dt>Distance</dt>
					<dd>{Math.round(info.stats.distance)} m</dd>
				</div>
			</dl>
			{info.passed.length > 0 && (
				<span className="finish-passed">
					{info.passed.slice(0, 3).map((profile) => (
						<Avatar key={profile.userId} profile={profile} size={22} />
					))}
					Passed {info.passed.map(playerName).slice(0, 2).join(" & ")}
					{info.passed.length > 2 ? ` +${info.passed.length - 2}` : ""} 🎉
				</span>
			)}
		</div>
	);
}

export function Toast({ text }: { text: string }) {
	return (
		<div className="toast" role="status">
			{text}
		</div>
	);
}

export function HelpSheet({ onClose }: { onClose(): void }) {
	return (
		<div className="sheet-backdrop" onClick={onClose} role="presentation">
			<div className="sheet" role="dialog" aria-label="How to play" onClick={(e) => e.stopPropagation()}>
				<h2>How to play</h2>
				<UpwindDiagram />
				<ul>
					<li>Sail through the glowing ring around each buoy, in order, then cross the green finish.</li>
					<li>Hold the ◀ ▶ pads (or the arrow keys) to steer. The sails trim themselves.</li>
					<li>
						You can't sail within about 40° of the wind. To reach an upwind buoy, zig-zag (tack) across
						the wind. The arrows drifting on the water, the waves and the arrow by the speed gauge all show
						the way the wind is blowing.
					</li>
					<li>Tap 🧭 to draw a suggested path through the buoys on the water and the map.</li>
					<li>
						The map follows the leg you are sailing. Its arrows show the wind, and the shaded wedge at
						your boat is the no-go zone.
					</li>
					<li>The bar under your speed turns green on your fastest angles, often across the wind.</li>
					<li>
						Speed is how fast the boat moves (m/s). "To buoy" is your velocity toward the next buoy: how
						many meters per second you actually close on it. Upwind it is lower than your speed because
						you're zig-zagging; if it goes red, you're sailing away.
					</li>
					<li>The wind shifts a little during the race, the same way for everyone.</li>
					<li>Everyone gets the same new course each day (UTC). Your best time counts on the leaderboard.</li>
					<li>After a race, watch anyone's run from the replays.</li>
				</ul>
				<button type="button" className="primary" onClick={onClose}>
					Got it
				</button>
			</div>
		</div>
	);
}

/** No-go zone and the zig-zag (tacking) path to a buoy straight upwind. */
function UpwindDiagram() {
	return (
		<figure className="diagram">
			<svg viewBox="0 0 220 150" role="img" aria-label="Sailing upwind: zig-zag around the no-go zone">
				<path d="M110 132 L60 72 A78 78 0 0 1 160 72 Z" className="diagram-nogo" />
				<text x="110" y="92" className="diagram-label">no-go zone</text>
				<path d="M110 132 L70 92 L130 52 L98 26" className="diagram-path" />
				<circle cx="104" cy="20" r="7" className="diagram-buoy" />
				<path d="M110 128 l-5 9 h10 z" className="diagram-boat" />
				<path d="M190 14 V46" className="diagram-wind" />
				<path d="M184 40 L190 50 L196 40" className="diagram-wind" />
				<text x="190" y="62" className="diagram-label">wind</text>
			</svg>
			<figcaption>
				You can't point into the wind, so tack: sail about 45° to one side, then the other.
			</figcaption>
		</figure>
	);
}
