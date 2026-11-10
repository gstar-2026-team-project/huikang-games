import { expect, test } from "bun:test";
import { innerFrameUrl, MAX_SCREEN, MIN_SCREEN, requestedScreenSize } from "./screen-size";

test("the display query parameter picks a named or exact screen size", () => {
	expect(requestedScreenSize("?display=mobile")).toEqual({ width: 390, height: 844 });
	expect(requestedScreenSize("?display=Tablet")).toEqual({ width: 768, height: 1024 });
	expect(requestedScreenSize("?display=desktop")).toEqual({ width: 1280, height: 800 });
	expect(requestedScreenSize("?display=768x768")).toEqual({ width: 768, height: 768 });
	expect(requestedScreenSize("?display=5X99999")).toEqual({ width: MIN_SCREEN, height: MAX_SCREEN });
});

test("a missing or unusable display leaves the game full-window", () => {
	expect(requestedScreenSize("")).toBeNull();
	expect(requestedScreenSize("?display=")).toBeNull();
	expect(requestedScreenSize("?display=huge")).toBeNull();
	expect(requestedScreenSize("?display=768")).toBeNull();
	expect(requestedScreenSize("?other=768x768")).toBeNull();
});

test("the inner frame keeps the address but drops the display", () => {
	expect(innerFrameUrl("https://example.com/games/play/?display=mobile&debug=1#top")).toBe(
		"https://example.com/games/play/?debug=1#top",
	);
});
