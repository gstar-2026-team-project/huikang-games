/** Panel contents for every non-flying screen, as plain data, plus one DOM renderer. */
import { DAILY_TURNPOINTS, dailyDisplay, dayLabel, turnpointsText } from "../game/modes";

export type PanelAction = "daily" | "free" | "again" | "menu" | "resume" | "invite";

export interface PanelButton {
	action: PanelAction;
	label: string;
	sub?: string;
	primary?: boolean;
	testid: string;
}

export interface PanelModel {
	title: string;
	text: string;
	/** A short numbered how-to under the text (the menu's). */
	steps?: string[];
	buttons: PanelButton[];
}

/** How to fly, in three steps: shown on the menu. */
export const HOW_TO: readonly string[] = [
	"Fly to a cloud: the golden column under it is rising air.",
	"When the vario turns green and beeps, hold a turn to circle and climb.",
	"Glide on to the numbered beacon and cross its ring.",
];

export interface HomeFacts {
	day: string;
	dailyBest: { turnpoints: number; seconds: number } | null;
	freeBest: number;
}

export function homePanel(f: HomeFacts): PanelModel {
	return {
		title: "Ready to launch",
		text: "No engine: rising air is your only way up.",
		steps: [...HOW_TO],
		buttons: [
			{
				action: "daily", primary: true, testid: "mode-daily", label: "Daily task",
				sub: f.dailyBest
					? `${dayLabel(f.day)} · best ${dailyDisplay(f.dailyBest.turnpoints, f.dailyBest.seconds)}`
					: `${dayLabel(f.day)} · ${DAILY_TURNPOINTS} turnpoints, fastest wins`,
			},
			{ action: "free", testid: "mode-free", label: "Free flight", sub: f.freeBest > 0 ? `Endless · best ${turnpointsText(f.freeBest)}` : "Endless turnpoints until you land" },
			{ action: "invite", testid: "invite", label: "Challenge friends" },
		],
	};
}

export function pausedPanel(): PanelModel {
	return {
		title: "Paused", text: "Your flight is on hold.",
		buttons: [
			{ action: "resume", primary: true, testid: "resume", label: "Resume" },
			{ action: "menu", testid: "menu", label: "Menu" },
		],
	};
}

export type OverReason = "ground" | "time" | "complete" | "interrupted";

export interface OverFacts {
	mode: "free" | "daily";
	reason: OverReason;
	turnpoints: number;
	/** free flight: the pilot's record, this flight included */
	best: number;
	/** daily only: when the last turnpoint was reached, the date, and today's best */
	seconds?: number;
	day?: string;
	bestEntry?: { turnpoints: number; seconds: number };
}

const OVER_TITLE: Record<OverReason, string> = {
	ground: "Landed out",
	time: "Out of time",
	complete: "Task complete",
	interrupted: "Flight cut short",
};

export function overPanel(f: OverFacts): PanelModel {
	const buttons: PanelButton[] = [
		{ action: "again", primary: true, testid: "again", label: "Fly again" },
		{ action: "menu", testid: "menu", label: "Menu" },
	];
	const title = OVER_TITLE[f.reason];
	if (f.mode === "daily" && f.day) {
		const best = f.bestEntry ?? { turnpoints: f.turnpoints, seconds: f.seconds ?? 0 };
		const flown = f.reason === "complete"
			? `All ${DAILY_TURNPOINTS} turnpoints in ${(f.seconds ?? 0).toFixed(1)} s`
			: f.turnpoints > 0
				? `${f.turnpoints} of ${DAILY_TURNPOINTS} turnpoints`
				: f.reason === "ground" ? "You came down before the first beacon. Climb under a cloud first." : "No turnpoints";
		return {
			title,
			text: best.turnpoints > 0 ? `${flown} · ${dayLabel(f.day)} best ${dailyDisplay(best.turnpoints, best.seconds)}` : flown,
			buttons,
		};
	}
	return { title, text: `${turnpointsText(f.turnpoints)} · best ${turnpointsText(f.best)}`, buttons };
}

export function loadingPanel(): PanelModel {
	return { title: "Ready to launch", text: "Loading your flights…", buttons: [] };
}

/** Draw a panel model into the overlay. Buttons carry data-action for one delegated handler. */
export function renderPanel(
	refs: { pTitle: HTMLElement; pText: HTMLElement; pSteps: HTMLElement; pBody: HTMLElement },
	model: PanelModel,
): void {
	refs.pTitle.textContent = model.title;
	refs.pText.textContent = model.text;
	const steps = model.steps ?? [];
	refs.pSteps.hidden = steps.length === 0;
	refs.pSteps.replaceChildren(
		...steps.map((text) => {
			const li = document.createElement("li");
			li.textContent = text;
			return li;
		}),
	);
	refs.pBody.replaceChildren(
		...model.buttons.map((b) => {
			const el = document.createElement("button");
			el.type = "button";
			el.dataset.action = b.action;
			el.dataset.testid = b.testid;
			el.className = [b.primary ? "primary" : "", b.action === "invite" ? "quiet" : ""].join(" ").trim();
			const label = document.createElement("b");
			label.textContent = b.label;
			el.append(label);
			if (b.sub) {
				const sub = document.createElement("small");
				sub.textContent = b.sub;
				el.append(sub);
			}
			return el;
		}),
	);
}
