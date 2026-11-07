import type { PoeUserInfo } from "poe-tiles-sdk/v1/shared.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { courseLabel, generateCourse, leaderboardIdFor } from "../game/course";
import { formatDelta } from "../game/format";
import { createRace, type RaceEvent, type RaceState } from "../game/race";
import type { AppProps } from "./app-contract";
import { SoundBoard } from "./audio";
import { type DayData, playerName, type RunRow } from "./data";
import { HudView, type Leader } from "./HudView";
import { Countdown, FinishBanner, type FinishInfo, HelpSheet, ReadyPanel, Toast } from "./Panels";
import { RaceController } from "./race-controller";
import { nextReplaySpeed, ReplayBar, ReplayPicker } from "./ReplayPicker";
import { SteerPads } from "./SteerPads";
import { useResumeRun } from "./useResumeRun";
import { CoachCard, LessonDone, useLesson } from "./Lesson";

export type Phase =
	| "ready"
	| "countdown"
	| "racing"
	| "finished"
	| "results"
	| "picker"
	| "replay"
	| "lesson"
	| "lessonDone";

/** Hold the decisive finish on screen this long before the end sheet. */
const FINISH_BEAT_MS = 1700;
const TOAST_MS = 2200;
export function Regatta({ store, poe, resumeAudioContext, suppressLongPressMagnifier, data }: AppProps & { data: DayData }) {
	const [phase, setPhase] = useState<Phase>("ready");
	const [count, setCount] = useState(3);
	const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
	const [finish, setFinish] = useState<FinishInfo | null>(null);
	const [help, setHelp] = useState(false);
	const [replay, setReplay] = useState<{ run: RunRow; speed: number } | null>(null);
	const [pickerFromEnd, setPickerFromEnd] = useState(false);
	const [graphicsError, setGraphicsError] = useState(false);

	const stageRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const hudRef = useRef<HTMLDivElement>(null);
	const minimapRef = useRef<HTMLCanvasElement>(null);
	const timerRef = useRef<HTMLSpanElement>(null);
	const marksRef = useRef<HTMLSpanElement>(null);
	const speedRef = useRef<HTMLSpanElement>(null);
	const speedBarRef = useRef<HTMLSpanElement>(null);
	const windRef = useRef<HTMLSpanElement>(null);
	const ironsRef = useRef<HTMLDivElement>(null);
	const controllerRef = useRef<RaceController | null>(null);
	const sound = useMemo(() => new SoundBoard(resumeAudioContext), [resumeAudioContext]);
	const runRef = useRef<{ runId: string; day: string } | null>(null);
	const dataRef = useRef(data);
	dataRef.current = data;
	const resumedRunRef = useRef<string | null>(null);
	const timersRef = useRef<number[]>([]);

	const course = useMemo(() => generateCourse(data.day), [data.day]);
	const label = courseLabel(data.day);
	const leaderboardId = leaderboardIdFor(data.day);
	sound.muted = data.muted;

	const later = useCallback((fn: () => void, ms: number) => {
		timersRef.current.push(window.setTimeout(fn, ms));
	}, []);
	const showToast = useCallback(
		(text: string) => {
			const id = Date.now();
			setToast({ text, id });
			later(() => setToast((t) => (t?.id === id ? null : t)), TOAST_MS);
		},
		[later],
	);

	const goReady = useCallback(() => {
		runRef.current = null;
		setReplay(null);
		setFinish(null);
		controllerRef.current?.showReady();
		setPhase("ready");
	}, []);

	const openEnd = useCallback(async () => {
		setPhase("results");
		try {
			const result = await poe.room.tileEnd({
				leaderboardId,
				actions: { review: { label: "Watch replays" } },
			});
			if (result.outcome === "review") {
				setPickerFromEnd(true);
				setPhase("picker");
			} else goReady();
		} catch (error) {
			console.error(error);
			showToast("Couldn't open the leaderboard. Try again.");
			goReady();
		}
	}, [poe, leaderboardId, goReady, showToast]);

	const lesson = useLesson({
		store,
		haptics: poe.haptics,
		sound,
		controllerRef,
		later,
		onEnter: useCallback(() => setPhase("lesson"), []),
		onDone: useCallback(() => setPhase("lessonDone"), []),
	});
	const lessonStepRef = useRef(lesson.onStep);
	lessonStepRef.current = lesson.onStep;

	const handleRaceEvent = useCallback(
		(event: RaceEvent, race: RaceState) => {
			const run = runRef.current;
			const controller = controllerRef.current;
			if (!run || !controller) return;
			const current = dataRef.current;
			if (event.type === "mark") {
				sound.play("mark", event.index);
				poe.haptics.notification("success");
				void store.mutate.checkpointRun({
					runId: run.runId,
					markIndex: race.markIndex,
					x: race.boat.x,
					y: race.boat.y,
					heading: race.boat.heading,
					speed: race.boat.speed,
					splits: [...race.splits],
					trace: [...race.trace],
				});
				const reference = current.runs[0];
				const split = reference?.splits[event.index];
				if (reference && split !== undefined) {
					const who = reference.userId === current.userId ? "your best" : playerName(current.profiles[reference.userId]);
					showToast(`Mark ${event.index + 1} · ${formatDelta(event.elapsedMs - split)} vs ${who}`);
				} else showToast(`Mark ${event.index + 1} rounded!`);
			} else if (event.type === "finish") {
				controller.pause();
				sound.play("finish");
				poe.haptics.notification("success");
				const myBest = current.runs.find((r) => r.userId === current.userId)?.timeMs ?? Number.POSITIVE_INFINITY;
				const passed = current.board.entries
					.filter((e) => e.userId !== current.userId && e.score < myBest && e.score > event.elapsedMs)
					.map((e) => current.profiles[e.userId] ?? ({ userId: e.userId } as PoeUserInfo));
				setFinish({ timeMs: event.elapsedMs, newBest: event.elapsedMs < myBest, passed });
				setPhase("finished");
				store.mutate
					.finishRun({
						runId: run.runId,
						day: run.day,
						timeMs: event.elapsedMs,
						splits: [...race.splits],
						trace: [...race.trace],
						finishedAt: Date.now(),
					})
					.catch((error: unknown) => {
						console.error(error);
						showToast("Your time couldn't be saved.");
					});
				runRef.current = null;
				resumedRunRef.current = null;
				later(() => void openEnd(), FINISH_BEAT_MS);
			} else {
				controller.pause();
				sound.play("timeout");
				poe.haptics.notification("error");
				void store.mutate.abandonRun({ runId: run.runId });
				showToast("Time's up. That run wasn't scored.");
				later(goReady, 1200);
			}
		},
		[poe, store, sound, showToast, later, openEnd, goReady],
	);
	const eventRef = useRef(handleRaceEvent);
	eventRef.current = handleRaceEvent;

	// Mount the renderer once; the loop reports race events through a ref.
	useEffect(() => {
		const canvas = canvasRef.current;
		const minimap = minimapRef.current;
		const stage = stageRef.current;
		const hud = hudRef.current;
		const nodes = [timerRef, marksRef, speedRef, speedBarRef, windRef, ironsRef].map((r) => r.current);
		if (!canvas || !minimap || !stage || !hud || nodes.some((n) => !n)) return;
		let controller: RaceController;
		try {
			controller = new RaceController(
				canvas,
				minimap,
				{
					timer: timerRef.current!,
					marks: marksRef.current!,
					speed: speedRef.current!,
					speedBar: speedBarRef.current!,
					windArrow: windRef.current!,
					irons: ironsRef.current!,
				},
				{
					onRaceEvent: (event, race) => eventRef.current(event, race),
					onReplayEnd: () => setPhase((p) => (p === "replay" ? "picker" : p)),
					onLessonStep: (step, done) => lessonStepRef.current(step, done),
				},
			);
		} catch (error) {
			console.error(error);
			setGraphicsError(true);
			return;
		}
		controllerRef.current = controller;
		const resize = () => {
			const rect = stage.getBoundingClientRect();
			controller.resize(rect.width, rect.height, Math.round(Math.min(118, Math.max(84, rect.width * 0.26))));
		};
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(stage);
		const scheme = window.matchMedia("(prefers-color-scheme: dark)");
		const onScheme = () => controller.refreshPalette();
		scheme.addEventListener("change", onScheme);
		const removers = [suppressLongPressMagnifier(canvas), suppressLongPressMagnifier(hud, { preserveTaps: true })];
		return () => {
			observer.disconnect();
			scheme.removeEventListener("change", onScheme);
			for (const remove of removers) remove();
			for (const id of timersRef.current) window.clearTimeout(id);
			controller.dispose();
			controllerRef.current = null;
		};
	}, [suppressLongPressMagnifier]);

	// New day's course: only swap it in while nobody is mid-race.
	useEffect(() => {
		if (phase === "ready" || phase === "picker") controllerRef.current?.setCourse(course);
	}, [course, phase]);

	useResumeRun({
		store,
		data,
		phase,
		runRef,
		resumedRunRef,
		goReady,
		onResume: (race, markIndex) => {
			controllerRef.current?.setCourse(course);
			controllerRef.current?.startRace(race);
			setPhase("racing");
			showToast(markIndex > 0 ? `Resumed at mark ${markIndex}` : "Resumed your run");
		},
		canResume: () => controllerRef.current !== null,
	});

	const startRace = useCallback(() => {
		sound.unlock();
		poe.haptics.impact("light");
		setPhase("countdown");
		setCount(3);
		sound.play("tick");
		const step = (n: number) => {
			if (n > 0) {
				setCount(n);
				sound.play("tick");
				later(() => step(n - 1), 1000);
				return;
			}
			setCount(0);
			void (async () => {
				const runId = await store.makeUniqueId();
				const race = createRace(course);
				runRef.current = { runId, day: course.day };
				controllerRef.current?.startRace(race);
				setPhase("racing");
				sound.play("horn");
				poe.haptics.impact("medium");
				store.mutate
					.startRun({ runId, day: course.day, startedAt: Date.now(), heading: race.boat.heading })
					.catch((error: unknown) => {
						console.error(error);
						showToast("Couldn't start the run. Check your connection.");
					});
			})();
		};
		later(() => step(2), 1000);
	}, [sound, poe, store, course, later, showToast]);

	const restart = useCallback(() => {
		const run = runRef.current;
		if (run) void store.mutate.abandonRun({ runId: run.runId });
		goReady();
	}, [store, goReady]);

	const closePicker = useCallback(() => {
		if (pickerFromEnd) {
			setPickerFromEnd(false);
			void openEnd();
		} else goReady();
	}, [pickerFromEnd, openEnd, goReady]);

	const watch = useCallback((run: RunRow) => {
		sound.unlock();
		setReplay({ run, speed: 2 });
		controllerRef.current?.setCourse(generateCourse(run.day));
		controllerRef.current?.startReplay(run, 2);
		setPhase("replay");
	}, [sound]);

	const nextSpeed = useCallback(() => {
		setReplay((r) => {
			if (!r) return r;
			const speed = nextReplaySpeed(r.speed);
			controllerRef.current?.setReplaySpeed(speed);
			return { ...r, speed };
		});
	}, []);

	const openProfile = useCallback(
		(userId: string) => {
			poe.users.openProfile({ userId }).catch(() => showToast("Couldn't open that profile."));
		},
		[poe, showToast],
	);

	const toggleMute = useCallback(() => {
		sound.unlock();
		void store.mutate.setMuted({ muted: !data.muted });
	}, [sound, store, data.muted]);

	const top = data.runs[0];
	const leader: Leader | null =
		top && (phase === "racing" || phase === "ready" || phase === "countdown")
			? { profile: data.profiles[top.userId], timeMs: top.timeMs, isMe: top.userId === data.userId }
			: null;
	const myBest = data.runs.find((r) => r.userId === data.userId)?.timeMs ?? null;
	const racing = phase === "racing";
	const atHelm = racing || phase === "lesson";
	const showGauge = atHelm || phase === "countdown" || phase === "replay" || phase === "finished";

	return (
		<div ref={stageRef} className="stage" data-phase={phase} data-testid="stage">
			<canvas ref={canvasRef} className="scene" data-testid="scene" />
			<div ref={hudRef} className="hud">
				<HudView
					refs={{ timer: timerRef, marks: marksRef, speed: speedRef, speedBar: speedBarRef, windArrow: windRef, irons: ironsRef, minimap: minimapRef }}
					showRace={showGauge}
					muted={data.muted}
					leader={leader}
					onHelp={() => setHelp(true)}
					onMute={toggleMute}
					onRestart={racing ? restart : null}
				/>
				{atHelm && <SteerPads onPad={(side, down) => controllerRef.current?.setPad(side, down)} haptics={poe.haptics} />}
				{phase === "ready" && (
					<ReadyPanel
						label={label}
						bestMs={myBest}
						hasRuns={data.runs.length > 0}
						hasBoard={data.board.entries.length > 0}
						onStart={startRace}
						onReplays={() => setPhase("picker")}
						onBoard={() => void openEnd()}
						lessonFirst={!data.tutorialDone && myBest === null}
						onLesson={lesson.start}
					/>
				)}
				{phase === "lesson" && <CoachCard step={lesson.step} cheer={lesson.cheer} onExit={goReady} />}
				{phase === "lessonDone" && <LessonDone onRace={startRace} onAgain={lesson.start} />}
				{phase === "countdown" && <Countdown value={count} />}
				{phase === "finished" && finish && <FinishBanner info={finish} />}
				{phase === "replay" && replay && (
					<ReplayBar
						profile={data.profiles[replay.run.userId]}
						timeMs={replay.run.timeMs}
						speed={replay.speed}
						onSpeed={nextSpeed}
						onClose={() => setPhase("picker")}
					/>
				)}
				{toast && <Toast key={toast.id} text={toast.text} />}
				{graphicsError && (
					<div className="graphics-error" role="alert">
						This device couldn't start 3D graphics, so the race can't be shown. Try reopening the tile.
					</div>
				)}
			</div>
			{phase === "picker" && (
				<ReplayPicker
					label={label}
					runs={data.runs}
					profiles={data.profiles}
					userId={data.userId}
					onWatch={watch}
					onProfile={openProfile}
					onClose={closePicker}
				/>
			)}
			{help && <HelpSheet onClose={() => setHelp(false)} />}
		</div>
	);
}
