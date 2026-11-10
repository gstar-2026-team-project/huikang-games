import { expect, test } from "bun:test";
import { clockText, sinkingIntoGround, varioText } from "./hud";

test("the clock reads minutes and seconds flown", () => {
	expect(clockText(0)).toBe("0:00");
	expect(clockText(59.9)).toBe("0:59");
	expect(clockText(142.5)).toBe("2:22");
	expect(clockText(-3)).toBe("0:00");
});

test("the variometer reads a signed climb rate to one decimal", () => {
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
