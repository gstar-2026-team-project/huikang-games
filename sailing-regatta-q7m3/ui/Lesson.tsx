import type { PoeAPI } from "poe-tiles-sdk/v1/client.js";
import { type RefObject, useCallback, useState } from "react";
import { TUTORIAL_STEPS } from "../game/tutorial";
import type { AppProps } from "./app-contract";
import type { SoundBoard } from "./audio";
import type { RaceController } from "./race-controller";

/** Hold "Nice!" on screen briefly between lesson steps. */
const STEP_CHEER_MS = 900;

export function useLesson({
	store,
	haptics,
	sound,
	controllerRef,
	later,
	onEnter,
	onDone,
}: {
	store: AppProps["store"];
	haptics: PoeAPI["haptics"];
	sound: SoundBoard;
	controllerRef: RefObject<RaceController | null>;
	later(fn: () => void, ms: number): void;
	onEnter(): void;
	onDone(): void;
}) {
	const [step, setStep] = useState(0);
	const [cheer, setCheer] = useState(false);

	const start = useCallback(() => {
		sound.unlock();
		haptics.impact("light");
		setStep(0);
		setCheer(false);
		controllerRef.current?.startLesson();
		onEnter();
	}, [sound, haptics, controllerRef, onEnter]);

	const onStep = useCallback(
		(next: number, done: boolean) => {
			if (done) {
				sound.play("finish");
				haptics.notification("success");
				void store.mutate.completeTutorial({});
				onDone();
				return;
			}
			sound.play("mark", Math.min(next - 1, 4));
			haptics.notification("success");
			setCheer(true);
			later(() => {
				setCheer(false);
				setStep(next);
			}, STEP_CHEER_MS);
		},
		[sound, haptics, store, later, onDone],
	);

	return { step, cheer, start, onStep };
}

export function CoachCard({ step, cheer, onExit }: { step: number; cheer: boolean; onExit(): void }) {
	const current = TUTORIAL_STEPS[step] ?? TUTORIAL_STEPS[TUTORIAL_STEPS.length - 1]!;
	return (
		<div className="coach" data-testid="coach" role="status" aria-live="polite">
			<div className="coach-head">
				<span className="coach-title">
					{current.title} · {Math.min(step + 1, TUTORIAL_STEPS.length)}/{TUTORIAL_STEPS.length}
				</span>
				<button type="button" className="coach-exit" onClick={onExit}>
					Exit lesson
				</button>
			</div>
			<p className="coach-text" data-cheer={cheer}>
				{cheer ? "Nice! ✓" : current.text}
			</p>
			<div className="coach-dots" aria-hidden="true">
				{TUTORIAL_STEPS.map((_, i) => (
					<span key={i} data-state={i < step || (i === step && cheer) ? "done" : i === step ? "now" : "todo"} />
				))}
			</div>
		</div>
	);
}

export function LessonDone({ onRace, onAgain }: { onRace(): void; onAgain(): void }) {
	return (
		<div className="ready-panel" data-testid="lesson-done">
			<p className="lesson-done-title">You're ready to race! ⛵</p>
			<p className="hint">
				Remember: sail across the wind for speed, and zig-zag about 45° off the wind to go upwind.
			</p>
			<button type="button" className="primary" onClick={onRace}>
				Start race
			</button>
			<button type="button" className="secondary" onClick={onAgain}>
				Practice again
			</button>
		</div>
	);
}
