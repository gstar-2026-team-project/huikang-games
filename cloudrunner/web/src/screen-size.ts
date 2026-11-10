/**
 * Lets the page URL pick the game's screen size: `?display=mobile` or
 * `?display=768x768` runs the game inside a frame of exactly that many CSS
 * pixels, centred in the window. The game runs in an iframe of that size, so
 * its layout, media queries and canvas see a real viewport of the requested
 * size.
 */

export const MIN_SCREEN = 100;
export const MAX_SCREEN = 4000;

export interface ScreenSize {
	/** CSS pixels. */
	width: number;
	height: number;
}

/** Named sizes for `?display=<name>`. */
export const DISPLAY_PRESETS: Record<string, ScreenSize> = {
	mobile: { width: 390, height: 844 },
	tablet: { width: 768, height: 1024 },
	desktop: { width: 1280, height: 800 },
};

const clamp = (value: number) => Math.min(MAX_SCREEN, Math.max(MIN_SCREEN, value));

/** The size asked for by `?display=`, or null when it is absent or unusable. */
export function requestedScreenSize(search: string): ScreenSize | null {
	const display = new URLSearchParams(search).get("display")?.trim().toLowerCase();
	if (!display) return null;
	const preset = DISPLAY_PRESETS[display];
	if (preset) return preset;
	const match = /^(\d+)x(\d+)$/.exec(display);
	if (!match) return null;
	return { width: clamp(Number(match[1])), height: clamp(Number(match[2])) };
}

/** The same page address without the display parameter, for the inner frame. */
export function innerFrameUrl(href: string): string {
	const url = new URL(href);
	url.searchParams.delete("display");
	return url.toString();
}

/**
 * When this is the top window and the URL asks for a size, replace the page
 * with a sized frame running the game and return true. The caller then skips
 * mounting the game in this window.
 */
export function mountSizedFrame(title: string): boolean {
	const size = requestedScreenSize(window.location.search);
	if (!size || window.self !== window.top) return false;
	const frame = document.createElement("iframe");
	frame.src = innerFrameUrl(window.location.href);
	frame.title = title;
	frame.dataset.testid = "sized-frame";
	frame.style.cssText = `display:block;flex:none;margin:auto;border:0;background:#000;box-shadow:0 0 0 1px rgba(255,255,255,0.25);width:${size.width}px;height:${size.height}px`;
	// A frame larger than the window scrolls instead of being cut off.
	document.documentElement.style.cssText = "height:auto;overflow:auto";
	document.body.style.cssText =
		"display:flex;min-height:100dvh;height:auto;margin:0;overflow:auto;background:#16181c";
	document.body.replaceChildren(frame);
	// Keyboard controls only reach the game while its frame has focus.
	frame.addEventListener("load", () => frame.contentWindow?.focus());
	return true;
}
