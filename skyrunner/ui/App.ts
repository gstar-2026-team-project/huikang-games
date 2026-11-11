import { dayKey } from "../game/modes";
import { readView } from "../synced-store/data/view";
import type { AppProps } from "./app-contract";
import { FlightInput } from "./controls";
import { FlightController } from "./flight";
import { Hud } from "./hud";
import { Loop } from "./loop";
import type { PanelAction } from "./menu";
import { PALETTES } from "../render/palette";
import { Minimap } from "../render/minimap";
import { Scene } from "../render/scene";
import { mountShell } from "./shell";

/** Mount Skyrunner into `root`. Returns an unmount function. */
export function mountApp(root: HTMLElement, props: AppProps): () => void {
	const ui = mountShell(root);
	const cleanups: (() => void)[] = [];
	const showError = (msg: string) => {
		ui.err.textContent = `Something went wrong: ${msg}`;
		ui.err.hidden = false;
	};
	const onWindowError = (ev: ErrorEvent) => showError(ev.message);
	window.addEventListener("error", onWindowError);
	cleanups.push(() => window.removeEventListener("error", onWindowError));

	const input = new FlightInput(ui);
	cleanups.push(() => input.dispose());
	const hud = new Hud(ui);
	const flight = new FlightController(props, ui, input, hud, showError);
	cleanups.push(() => flight.dispose());

	// Every non-scrolling surface: no iOS magnifier loupe on held fingers.
	cleanups.push(props.suppressLongPressMagnifier(root, { preserveTaps: true }));

	const ctx = ui.view.getContext("2d");
	const budget = props.createRenderBudget ? props.createRenderBudget({ canvas: ui.view }) : null;
	if (budget) cleanups.push(() => budget.dispose());
	const scene = ctx ? new Scene(ctx) : null;
	const minimap = new Minimap(ui.map);
	const darkQ = window.matchMedia?.("(prefers-color-scheme: dark)");
	const palette = () => (darkQ?.matches ? PALETTES.dark : PALETTES.light);

	// The ideal line through the next rings is a view option, off until asked for.
	let showPath = false;
	const onPathToggle = () => {
		showPath = !showPath;
		ui.path.textContent = showPath ? "Ideal path: on" : "Ideal path: off";
		ui.path.setAttribute("aria-pressed", String(showPath));
		loop.wake();
	};
	ui.path.addEventListener("click", onPathToggle);
	cleanups.push(() => ui.path.removeEventListener("click", onPathToggle));
	const resize = () => {
		const ratio = budget?.defaults.pixelRatio ?? Math.min(2, window.devicePixelRatio || 1);
		scene?.resize(ui.view.clientWidth || window.innerWidth, ui.view.clientHeight || window.innerHeight, ratio);
		minimap.resize(ratio);
		loop.wake();
	};

	const loop = new Loop(
		{
			step: (dt) => flight.step(dt),
			render: (dt, nowMs) => {
				const playing = flight.screen === "play";
				scene?.draw(flight.sim, palette(), playing ? null : nowMs / 1000, showPath && playing);
				if (playing) minimap.draw(flight.sim, palette(), darkQ?.matches ? "dark" : "light");
				hud.update(flight.sim, playing && flight.sim.phase === "flying", input.knob, dt);
			},
			// The home screen is the first thing a player sees: it moves at full rate.
			isIdle: () => flight.screen !== "play" && flight.screen !== "home" && !hud.busy,
		},
		budget,
	);
	loop.onError = (err) => showError(err instanceof Error ? err.message : String(err));
	flight.onScreenChange = () => loop.wake();
	window.addEventListener("resize", resize);
	cleanups.push(() => window.removeEventListener("resize", resize));
	const onScheme = () => loop.wake();
	darkQ?.addEventListener?.("change", onScheme);
	cleanups.push(() => darkQ?.removeEventListener?.("change", onScheme));
	root.addEventListener("pointerdown", () => loop.wake());

	// One delegated handler for every panel button.
	ui.pBody.addEventListener("click", (ev) => {
		const btn = (ev.target as HTMLElement | null)?.closest<HTMLButtonElement>("button[data-action]");
		if (!btn || btn.disabled) return;
		const level = btn.dataset.level ? Number(btn.dataset.level) : undefined;
		flight.act(btn.dataset.action as PanelAction, level);
	});

	// Pause the flight and stop drawing while the host covers the tile.
	const setForeground = (fg: boolean) => {
		if (fg) loop.start();
		else {
			flight.pause();
			loop.stop();
		}
	};
	cleanups.push(props.subscribePoeTileForegroundState((fg) => setForeground(fg)));

	resize();
	setForeground(props.isPoeTileForeground());
	cleanups.push(() => loop.stop());

	let disposed = false;
	let booted = false;
	// The daily board is keyed by date, so the view is re-subscribed when the day rolls over.
	let day = dayKey(Date.now());
	let unsubscribe = () => undefined as void;
	const subscribe = () => {
		unsubscribe();
		const stop = props.store.subscribe(readView(day), (view) => {
			if (booted) flight.setView(view);
		});
		unsubscribe = () => stop();
	};
	subscribe();
	cleanups.push(() => unsubscribe());
	flight.today = () => {
		const now = dayKey(Date.now());
		if (now !== day) {
			day = now;
			subscribe();
		}
		return day;
	};
	props.store
		.waitForBootstrap()
		.then(() => props.store.query(readView(day)))
		.then((view) => {
			if (disposed) return;
			booted = true;
			flight.ready(view);
		})
		.catch((err: unknown) => showError(`Could not load your flights (${String(err)})`));

	return () => {
		disposed = true;
		for (const c of cleanups.reverse()) c();
	};
}
