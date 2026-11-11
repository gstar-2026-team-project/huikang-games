/** Static markup for the play surface, HUD, controls and panels. */
export const SHELL_HTML = `
<canvas id="view" data-testid="view"></canvas>
<div id="liftGlow" aria-hidden="true"></div>
<canvas id="map" data-testid="map" aria-label="Map of rising air and beacons around you"></canvas>
<div id="hud" data-testid="hud">
  <div class="pill" id="tp"><b data-testid="turnpoints">0</b><small>Beacons</small></div>
  <div class="pill" id="time"><b data-testid="time">0:00</b><small>Time</small></div>
  <div class="pill" id="alt"><b>400</b><small>Ground m</small></div>
  <div class="pill" id="spd"><b>144</b><small>km/h</small></div>
</div>
<div id="pointers">
  <div class="chip beacon" data-testid="beacon-pointer" hidden><svg class="arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 6h8V2l6.5 6L9 14v-4H1Z"/></svg><span class="ctext">Beacon 1</span></div>
  <div class="chip lift" data-testid="lift-pointer" hidden><svg class="arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M1 6h8V2l6.5 6L9 14v-4H1Z"/></svg><span class="ctext">Lift</span></div>
</div>
<button id="rival" type="button" data-testid="rival" hidden></button>
<div id="warn"></div>
<div id="vario" data-testid="vario-box" aria-label="Climb meter">
  <div class="vbar"><div class="vfill"></div><div class="vzero"></div><div class="vtick t1"></div><div class="vtick t2"></div><div class="vtick t3"></div><div class="vtick t4"></div></div>
  <div class="vread"><small class="vcap">Climb</small><span class="vword">Sinking</span><b data-testid="vario">-3.0</b><small>m/s</small></div>
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
  <div id="hint">Fly into the white column under a cloud, then circle to climb.</div>
</div>
<div id="overlay" data-testid="overlay">
  <div id="panel">
    <h2 id="pTitle">Ready to launch</h2>
    <p id="pText">Loading your flights…</p>
    <ol id="pSteps" data-testid="how-to" hidden></ol>
    <p id="pKeys" hidden></p>
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
	liftGlow: HTMLElement;
	beaconChip: HTMLElement;
	beaconArrow: SVGElement;
	beaconText: HTMLElement;
	liftChip: HTMLElement;
	liftArrow: SVGElement;
	liftText: HTMLElement;
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
	pKeys: HTMLElement;
	pBody: HTMLElement;
}

export function mountShell(root: HTMLElement): ShellRefs {
	root.innerHTML = SHELL_HTML;
	const q = <T extends HTMLElement>(sel: string): T => {
		const el = root.querySelector<T>(sel);
		if (!el) throw new Error(`Missing element ${sel}`);
		return el;
	};
	const svg = (sel: string): SVGElement => {
		const el = root.querySelector<SVGElement>(sel);
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
		liftGlow: q("#liftGlow"),
		beaconChip: q(".chip.beacon"),
		beaconArrow: svg(".chip.beacon .arrow"),
		beaconText: q(".chip.beacon .ctext"),
		liftChip: q(".chip.lift"),
		liftArrow: svg(".chip.lift .arrow"),
		liftText: q(".chip.lift .ctext"),
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
		pKeys: q("#pKeys"),
		pBody: q("#pBody"),
	};
}
