/** Panel contents for every non-flying screen, as plain data, plus one DOM renderer. */
import { levelCourse } from "../game/levels";
import { dailyDisplay, dayLabel, LEVEL_COUNT } from "../game/modes";

export type PanelAction =
	| "daily" | "levels" | "free" | "level" | "again" | "next" | "menu" | "resume" | "invite" | "back";

export interface PanelButton {
	action: PanelAction;
	label: string;
	sub?: string;
	primary?: boolean;
	disabled?: boolean;
	level?: number;
	testid: string;
}

export interface PanelModel {
	title: string;
	text: string;
	layout: "modes" | "grid" | "actions";
	buttons: PanelButton[];
}

const ringsText = (n: number) => `${n} ${n === 1 ? "ring" : "rings"}`;
export const starRow = (n: number) => "★".repeat(n) + "☆".repeat(Math.max(0, 3 - n));

export interface HomeFacts {
	day: string;
	dailyBest: { rings: number; seconds: number } | null;
	freeBest: number;
	stars: readonly number[];
}

export function homePanel(f: HomeFacts): PanelModel {
	const total = f.stars.reduce((a, b) => a + b, 0);
	return {
		title: "Ready for takeoff",
		text: "Left stick steers. The slider sets your speed: slow down to turn tighter.",
		layout: "modes",
		buttons: [
			{
				action: "daily", primary: true, testid: "mode-daily", label: "Daily challenge",
				sub: f.dailyBest ? `${dayLabel(f.day)} · best ${dailyDisplay(f.dailyBest.rings, f.dailyBest.seconds)}` : `${dayLabel(f.day)} · 40 seconds, most rings wins`,
			},
			{ action: "levels", testid: "mode-levels", label: "Levels", sub: `12 canyon runs · ${total} of ${LEVEL_COUNT * 3} ★` },
			{ action: "free", testid: "mode-free", label: "Free flight", sub: f.freeBest > 0 ? `Endless · best ${f.freeBest}` : "Endless rings" },
			{ action: "invite", testid: "invite", label: "Challenge friends" },
		],
	};
}

export function levelsPanel(stars: readonly number[]): PanelModel {
	const buttons: PanelButton[] = [];
	for (let n = 1; n <= LEVEL_COUNT; n++) {
		buttons.push({ action: "level", level: n, testid: `level-${n}`, label: String(n), sub: starRow(stars[n - 1] ?? 0) });
	}
	buttons.push({ action: "back", testid: "back", label: "Back" });
	return { title: "Levels", text: "Hit every ring for three stars. Blue rings: slow down. Purple: full throttle.", layout: "grid", buttons };
}

export function pausedPanel(): PanelModel {
	return {
		title: "Paused", text: "Your flight is on hold.", layout: "actions",
		buttons: [
			{ action: "resume", primary: true, testid: "resume", label: "Resume" },
			{ action: "menu", testid: "menu", label: "Menu" },
		],
	};
}

export interface OverFacts {
	mode: "free" | "daily" | "level";
	/** finale level only: whether the target ring was hit */
	targetHit?: boolean;
	/** daily only: when the last ring was hit, and today's best */
	seconds?: number;
	bestEntry?: { rings: number; seconds: number };
	title: string;
	rings: number;
	best: number;
	level?: number;
	stars?: number;
	day?: string;
}

export function overPanel(f: OverFacts): PanelModel {
	const menu: PanelButton = { action: "menu", testid: "menu", label: "Menu" };
	if (f.mode === "level" && f.level) {
		const total = levelCourse(f.level).ringCount ?? 0;
		const stars = f.stars ?? 0;
		const hasNext = f.level < LEVEL_COUNT && stars > 0;
		return {
			title: stars > 0 ? `Level ${f.level} cleared` : f.title,
			text: stars > 0
				? `${starRow(stars)}  ${f.rings} of ${total} rings`
				: f.targetHit === false && f.title === "Course complete"
					? `${f.rings} of ${total} rings. Hit the red target ring to clear it.`
					: f.title === "Course complete"
					? `${f.rings} of ${total} rings. Hit more to earn a star.`
					: `${f.rings} of ${total} rings.`,
			layout: "actions",
			buttons: [
				...(hasNext ? [{ action: "next", primary: true, testid: "next", label: `Level ${f.level + 1}` } as PanelButton] : []),
				{ action: "again", primary: !hasNext, testid: "again", label: "Retry" },
				{ action: "levels", testid: "levels", label: "Levels" },
			],
		};
	}
	if (f.mode === "daily" && f.day) {
		const best = f.bestEntry ?? { rings: f.rings, seconds: f.seconds ?? 0 };
		return {
			title: f.title === "Out of time" ? "Time's up" : f.title,
			text: `${f.rings > 0 ? dailyDisplay(f.rings, f.seconds ?? 0) : "0 rings"} · ${dayLabel(f.day)} best ${dailyDisplay(best.rings, best.seconds)}`,
			layout: "actions",
			buttons: [{ action: "again", primary: true, testid: "again", label: "Fly again" }, menu],
		};
	}
	const where = f.mode === "daily" && f.day ? ` · ${dayLabel(f.day)} best ${f.best}` : ` · best ${f.best}`;
	return {
		title: f.title,
		text: `${ringsText(f.rings)}${where}`,
		layout: "actions",
		buttons: [{ action: "again", primary: true, testid: "again", label: "Fly again" }, menu],
	};
}

export function loadingPanel(): PanelModel {
	return { title: "Ready for takeoff", text: "Loading your flights…", layout: "actions", buttons: [] };
}

/** Draw a panel model into the overlay. Buttons carry data-action for one delegated handler. */
export function renderPanel(
	refs: { pTitle: HTMLElement; pText: HTMLElement; pBody: HTMLElement },
	model: PanelModel,
): void {
	refs.pTitle.textContent = model.title;
	refs.pText.textContent = model.text;
	refs.pBody.className = `body-${model.layout}`;
	refs.pBody.replaceChildren(
		...model.buttons.map((b) => {
			const el = document.createElement("button");
			el.type = "button";
			el.dataset.action = b.action;
			el.dataset.testid = b.testid;
			if (b.level) el.dataset.level = String(b.level);
			el.disabled = !!b.disabled;
			el.className = [b.primary ? "primary" : "", b.action === "invite" || b.action === "back" ? "quiet" : ""].join(" ").trim();
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
