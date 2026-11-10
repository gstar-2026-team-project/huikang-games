/** Static markup for the play surface, HUD, controls and panels. */
export const SHELL_HTML = `
<canvas id="view" data-testid="view"></canvas>
<canvas id="map" data-testid="map" aria-label="Map of where you are heading"></canvas>
<div id="hud" data-testid="hud">
  <div class="pill" id="rings"><b data-testid="rings">0</b><small>Rings</small></div>
  <div class="pill" id="time"><b>25.0</b><small>Time</small></div>
  <div class="pill" id="alt"><b>120</b><small>Ground m</small></div>
  <div class="pill" id="spd"><b>223</b><small>km/h</small></div>
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
  <div id="throttle" aria-label="Throttle"><div id="thrFill"></div><div id="thrLabel">THR</div></div>
  <div id="hint">Fly through the golden rings</div>
</div>
<div id="overlay" data-testid="overlay">
  <div id="panel">
    <h2 id="pTitle">Ready for takeoff</h2>
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
	ringsVal: HTMLElement;
	timeVal: HTMLElement;
	timePill: HTMLElement;
	altVal: HTMLElement;
	altPill: HTMLElement;
	spdVal: HTMLElement;
	spdPill: HTMLElement;
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
	throttle: HTMLElement;
	thrFill: HTMLElement;
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
		ringsVal: q("#rings b"),
		timeVal: q("#time b"),
		timePill: q("#time"),
		altVal: q("#alt b"),
		altPill: q("#alt"),
		spdVal: q("#spd b"),
		spdPill: q("#spd"),
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
		throttle: q("#throttle"),
		thrFill: q("#thrFill"),
		hint: q("#hint"),
		overlay: q("#overlay"),
		pTitle: q("#pTitle"),
		pText: q("#pText"),
		pBody: q("#pBody"),
	};
}
