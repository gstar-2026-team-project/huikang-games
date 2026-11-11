import type { PoeUserInfo } from "poe-tiles-sdk/v1/shared.js";
import { useMemo, useRef } from "react";
import { formatTime } from "../game/format";
import { Avatar } from "./Avatar";
import { playerName } from "./data";
import type { HudNodes } from "./race-controller";

/** Element refs for the always-mounted HUD; the render loop writes into them. */
export function useHudRefs() {
	const timer = useRef<HTMLSpanElement>(null);
	const marks = useRef<HTMLSpanElement>(null);
	const speed = useRef<HTMLSpanElement>(null);
	const speedBar = useRef<HTMLSpanElement>(null);
	const vmg = useRef<HTMLSpanElement>(null);
	const windArrow = useRef<HTMLSpanElement>(null);
	const irons = useRef<HTMLDivElement>(null);
	const pointer = useRef<HTMLSpanElement>(null);
	const pointerArrow = useRef<HTMLSpanElement>(null);
	const pointerText = useRef<HTMLSpanElement>(null);
	const minimap = useRef<HTMLCanvasElement>(null);
	return useMemo(() => {
		const refs = { timer, marks, speed, speedBar, vmg, windArrow, irons, minimap, pointer, pointerArrow, pointerText };
		/** The mounted nodes, or null if any is missing. */
		const nodes = (): HudNodes | null => {
			const n = {
				timer: timer.current,
				marks: marks.current,
				speed: speed.current,
				speedBar: speedBar.current,
				vmg: vmg.current,
				windArrow: windArrow.current,
				irons: irons.current,
				pointer: pointer.current,
				pointerArrow: pointerArrow.current,
				pointerText: pointerText.current,
			};
			return Object.values(n).every(Boolean) ? (n as HudNodes) : null;
		};
		return { refs, nodes };
	}, []);
}

export type HudRefs = ReturnType<typeof useHudRefs>["refs"];

export interface Leader {
	profile: PoeUserInfo | undefined;
	timeMs: number;
	isMe: boolean;
}

interface Props {
	refs: HudRefs;
	showRace: boolean;
	muted: boolean;
	showPath: boolean;
	leader: Leader | null;
	onHelp(): void;
	onMute(): void;
	onPath(): void;
	onRestart: (() => void) | null;
}

/** Always-mounted HUD; the loop writes the live values straight into these nodes. */
export function HudView({ refs, showRace, muted, showPath, leader, onHelp, onMute, onPath, onRestart }: Props) {
	return (
		<>
			<div className="hud-top">
				<canvas ref={refs.minimap} className="minimap" aria-label="Course map" />
				<div className="hud-center">
					<span ref={refs.timer} className="timer" data-testid="race-timer">
						0:00.0
					</span>
					<span ref={refs.marks} className="marks" data-testid="race-marks" />
					<span ref={refs.pointer} className="mark-pointer" data-testid="mark-pointer" hidden>
						<span ref={refs.pointerArrow} className="mark-pointer-arrow" aria-hidden="true">
							➤
						</span>
						<span ref={refs.pointerText} />
					</span>
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
					<button
						type="button"
						className="icon-button"
						onClick={onPath}
						aria-label={showPath ? "Hide ideal path" : "Show ideal path"}
						aria-pressed={showPath}
						data-testid="path-toggle"
					>
						🧭
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
				<span className="metric">
					<span className="metric-label">Speed</span>
					<span className="metric-value">
						<span ref={refs.speed} data-testid="speed">
							0.0
						</span>
						<span className="metric-unit">m/s</span>
					</span>
					<span className="speed-track">
						<span ref={refs.speedBar} className="speed-bar" data-tone="bad" />
					</span>
				</span>
				<span className="metric" title="Velocity made good: how fast you are closing on the next buoy">
					<span className="metric-label">To buoy</span>
					<span className="metric-value">
						<span ref={refs.vmg} data-testid="vmg" data-tone="ok">
							0.0
						</span>
						<span className="metric-unit">m/s</span>
					</span>
				</span>
			</div>
		</>
	);
}
