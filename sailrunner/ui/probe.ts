export type Mode = "ready" | "racing" | "lesson" | "replay" | "paused";

/** Read-only snapshot for browser tests that sail the course (tests/autopilot.ts). */
export interface RegattaProbe {
	mode: Mode;
	x: number;
	y: number;
	heading: number;
	wind: number;
	nextMark: { x: number; y: number } | null;
	lessonStep: number | null;
}

declare global {
	interface Window {
		__regattaProbe?: () => RegattaProbe;
	}
}
