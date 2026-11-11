import { expect, test } from "bun:test";
import { arrowRotation, clockText, liftGlow, sinkingIntoGround, VARIO_FULL_SCALE, varioFill, varioText } from "./hud";
import { BEEP_THRESHOLD, beepFor } from "./vario-audio";

test("the clock reads minutes and seconds flown", () => {
	expect(clockText(0)).toBe("0:00");
	expect(clockText(59.9)).toBe("0:59");
	expect(clockText(142.5)).toBe("2:22");
	expect(clockText(-3)).toBe("0:00");
});

test("the climb meter reads a signed climb rate to one decimal", () => {
	expect(varioText(3.24)).toBe("+3.2");
	expect(varioText(-5.06)).toBe("-5.1");
	expect(varioText(0)).toBe("0.0");
	expect(varioText(-0.04)).toBe("0.0");
});

test("the pull-up warning comes on low or when the ground is seconds away, not in a normal glide", () => {
	expect(sinkingIntoGround(300, -5)).toBe(false);
	expect(sinkingIntoGround(20, -5)).toBe(true);
	expect(sinkingIntoGround(20, 4)).toBe(false);
	expect(sinkingIntoGround(100, -40)).toBe(true);
	expect(sinkingIntoGround(100, -20)).toBe(false);
});

test("the climb meter bar fills up in lift and down in sink, and small rates still show", () => {
	expect(varioFill(0)).toBe(0);
	expect(varioFill(VARIO_FULL_SCALE)).toBe(1);
	expect(varioFill(-VARIO_FULL_SCALE * 2)).toBe(-1);
	expect(varioFill(1)).toBeGreaterThan(1 / VARIO_FULL_SCALE);
	expect(varioFill(-4)).toBeCloseTo(-varioFill(4), 9);
	expect(varioFill(3)).toBeGreaterThan(varioFill(2));
});

test("the audible climb meter beeps higher and faster the faster the climb", () => {
	const slow = beepFor(1), fast = beepFor(6);
	expect(fast.freq).toBeGreaterThan(slow.freq);
	expect(fast.period).toBeLessThan(slow.period);
	expect(beepFor(50)).toEqual(beepFor(10));
	expect(BEEP_THRESHOLD).toBeGreaterThan(0);
});

test("the cyan edge glow shows only while climbing, stronger the faster the climb", () => {
	expect(liftGlow(-3)).toBe(0);
	expect(liftGlow(0.1)).toBe(0);
	expect(liftGlow(1)).toBeGreaterThan(0.3);
	expect(liftGlow(3)).toBe(1);
	expect(liftGlow(1)).toBeLessThan(liftGlow(2));
});

test("pointer arrows (a right-pointing glyph) point up for dead ahead and turn with the bearing", () => {
	expect(arrowRotation(0)).toBe("rotate(-90deg)");
	expect(arrowRotation(Math.PI / 2)).toBe("rotate(0deg)");
	expect(arrowRotation(-Math.PI / 2)).toBe("rotate(-180deg)");
});
