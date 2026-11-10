/** Static markup for the play surface, HUD, controls and panels. */
export const SHELL_HTML = `
<canvas id="view" data-testid="view"></canvas>
<canvas id="map" data-testid="map" aria-label="Map of thermals and turnpoints around you"></canvas>
<div id="hud" data-testid="hud">
  <div class="pill" id="tp"><b data-testid="turnpoints">0</b><small>Beacons</small></div>
  <div class="pill" id="time"><b data-testid="time">0:00</b><small>Time</small></div>
  <div class="pill" id="alt"><b>400</b><small>Ground m</small></div>
  <div class="pill" id="spd"><b>144</b><small>km/h</small></div>
</div>
<button id="rival" type="button" data-testid="rival" hidden></button>
<div id="warn"></div>
<div id="vario" data-testid="vario-box" aria-label="Variometer: climb rate">
  <div class="vbar"><div class="vfill"></div><div class="vzero"></div><div class="vtick t1"></div><div class="vtick t2"></div><div class="vtick t3"></div><div class="vtick t4"></div></div>
  <div class="vread"><span class="vword">Sink</span><b data-testid="vario">-3.0</b><small>m/s</small></div>
</div>
<div id="tip" data-testid="tip" aria-live="polite"></div>
<div id="toast"></div>
<div id="banner" hidden></div>
<div id="err" role="alert" hidden></div>
<div id="controls">
  <button id="invert" type="button">Drag up: climb</button>
  <button id="path" type="button" data-testid="path-toggle" aria-pressed="false">Ideal path: off</button>
  <button id="mute" type="button" data-testid="mute" aria-pressed="false" aria-label="Sound">Sound on</button>
  <div id="stickZone" aria-label="Steering stick"><div id="knob"></div></div>
  <div id="hint">Fly to a cloud: the air under it rises. Circle there to climb.</div>
</div>
<div id="overlay" data-testid="overlay">
  <div id="panel">
    <h2 id="pTitle">Ready to launch</h2>
    <p id="pText">Loading your flights…</p>
    <ol id="pSteps" data-testid="how-to" hidden></ol>
    <div id="pBody"></div>
  </div>
</div>
`;

export interface ShellRefs {
	root: HTMLElement;
	map: HTMLCanvasElement;
	view: HTMLCanvasElement;
	hud: HTMLElement;
	tpVal: HTMLElement;
	timeVal: HTMLElement;
	timePill: HTMLElement;
	altVal: HTMLElement;
	altPill: HTMLElement;
	varioVal: HTMLElement;
	varioBox: HTMLElement;
	varioFill: HTMLElement;
	varioWord: HTMLElement;
	tip: HTMLElement;
	mute: HTMLButtonElement;
	spdVal: HTMLElement;
	rival: HTMLButtonElement;
	warn: HTMLElement;
	toast: HTMLElement;
	banner: HTMLElement;
	err: HTMLElement;
	controls: HTMLElement;
	invert: HTMLButtonElement;
	path: HTMLButtonElement;
	stickZone: HTMLElement;
	knob: HTMLElement;
	hint: HTMLElement;
	overlay: HTMLElement;
	pTitle: HTMLElement;
	pText: HTMLElement;
	pSteps: HTMLElement;
	pBody: HTMLElement;
}

export function mountShell(root: HTMLElement): ShellRefs {
	root.innerHTML = SHELL_HTML;
	const q = <T extends HTMLElement>(sel: string): T => {
		const el = root.querySelector<T>(sel);
		if (!el) throw new Error(`Missing element ${sel}`);
		return el;
	};
	return {
		root,
		map: q<HTMLCanvasElement>("#map"),
		view: q<HTMLCanvasElement>("#view"),
		hud: q("#hud"),
		tpVal: q("#tp b"),
		timeVal: q("#time b"),
		timePill: q("#time"),
		altVal: q("#alt b"),
		altPill: q("#alt"),
		varioVal: q("#vario b"),
		varioBox: q("#vario"),
		varioFill: q("#vario .vfill"),
		varioWord: q("#vario .vword"),
		tip: q("#tip"),
		mute: q<HTMLButtonElement>("#mute"),
		spdVal: q("#spd b"),
		rival: q<HTMLButtonElement>("#rival"),
		warn: q("#warn"),
		toast: q("#toast"),
		banner: q("#banner"),
		err: q("#err"),
		controls: q("#controls"),
		invert: q<HTMLButtonElement>("#invert"),
		path: q<HTMLButtonElement>("#path"),
		stickZone: q("#stickZone"),
		knob: q("#knob"),
		hint: q("#hint"),
		overlay: q("#overlay"),
		pTitle: q("#pTitle"),
		pText: q("#pText"),
		pSteps: q("#pSteps"),
		pBody: q("#pBody"),
	};
}
