/** Static markup for the play surface, HUD, controls and panels. */
export const SHELL_HTML = `
<canvas id="view" data-testid="view"></canvas>
<canvas id="map" data-testid="map" aria-label="Map of thermals and turnpoints around you"></canvas>
<div id="hud" data-testid="hud">
  <div class="pill" id="tp"><b data-testid="turnpoints">0</b><small>Beacons</small></div>
  <div class="pill" id="time"><b data-testid="time">0:00</b><small>Time</small></div>
  <div class="pill" id="alt"><b>400</b><small>Ground m</small></div>
  <div class="pill" id="vario"><b data-testid="vario">0.0</b><small>Climb m/s</small></div>
  <div class="pill" id="spd"><b>144</b><small>km/h</small></div>
</div>
<button id="rival" type="button" data-testid="rival" hidden></button>
<div id="warn"></div>
<div id="toast"></div>
<div id="banner" hidden></div>
<div id="err" role="alert" hidden></div>
<div id="controls">
  <button id="invert" type="button">Drag up: climb</button>
  <button id="path" type="button" data-testid="path-toggle" aria-pressed="false">Ideal path: off</button>
  <div id="stickZone" aria-label="Steering stick"><div id="knob"></div></div>
  <div id="hint">Circle under a cloud to climb, then glide to the beacon</div>
</div>
<div id="overlay" data-testid="overlay">
  <div id="panel">
    <h2 id="pTitle">Ready to launch</h2>
    <p id="pText">Loading your flights…</p>
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
	varioPill: HTMLElement;
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
		varioPill: q("#vario"),
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
		pBody: q("#pBody"),
	};
}
