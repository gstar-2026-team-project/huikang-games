import type { PoeUserInfo } from "poe-tiles-sdk/v1/shared.js";
import type { Ref } from "react";
import { formatTime } from "../game/format";
import { Avatar } from "./Avatar";
import { playerName } from "./data";

export interface HudRefs {
	timer: Ref<HTMLSpanElement>;
	marks: Ref<HTMLSpanElement>;
	speed: Ref<HTMLSpanElement>;
	speedBar: Ref<HTMLSpanElement>;
	windArrow: Ref<HTMLSpanElement>;
	irons: Ref<HTMLDivElement>;
	minimap: Ref<HTMLCanvasElement>;
}

export interface Leader {
	profile: PoeUserInfo | undefined;
	timeMs: number;
	isMe: boolean;
}

interface Props {
	refs: HudRefs;
	showRace: boolean;
	muted: boolean;
	leader: Leader | null;
	onHelp(): void;
	onMute(): void;
	onRestart: (() => void) | null;
}

/** Always-mounted HUD; the loop writes the live values straight into these nodes. */
export function HudView({ refs, showRace, muted, leader, onHelp, onMute, onRestart }: Props) {
	return (
		<>
			<div className="hud-top">
				<canvas ref={refs.minimap} className="minimap" aria-label="Course map" />
				<div className="hud-center">
					<span ref={refs.timer} className="timer" data-testid="race-timer">
						0:00.0
					</span>
					<span ref={refs.marks} className="marks" data-testid="race-marks" />
					{leader && (
						<span className="leader-chip" data-testid="leader-chip">
							<Avatar profile={leader.profile} size={18} />
							<span>
								{leader.isMe ? "Your best" : `${playerName(leader.profile)}`} {formatTime(leader.timeMs)}
							</span>
						</span>
					)}
				</div>
				<div className="hud-buttons">
					<button type="button" className="icon-button" onClick={onHelp} aria-label="How to play">
						?
					</button>
					<button
						type="button"
						className="icon-button"
						onClick={onMute}
						aria-label={muted ? "Unmute" : "Mute"}
						aria-pressed={muted}
					>
						{muted ? "🔇" : "🔊"}
					</button>
					{onRestart && (
						<button type="button" className="icon-button" onClick={onRestart} aria-label="Restart run">
							↺
						</button>
					)}
				</div>
			</div>
			<div ref={refs.irons} className="irons" data-show="false" role="status">
				In irons! Turn away from the wind
			</div>
			<div className="gauge" data-visible={showRace}>
				<span className="wind-dial" aria-label="Wind direction">
					<span ref={refs.windArrow} className="wind-arrow">
						↑
					</span>
				</span>
				<span className="speed">
					<span ref={refs.speed} className="speed-value">
						0.0
					</span>
					<span className="speed-unit">kn</span>
					<span className="speed-track">
						<span ref={refs.speedBar} className="speed-bar" data-tone="bad" />
					</span>
				</span>
			</div>
		</>
	);
}
