import { expect, test } from "bun:test";
import { Coach, TIPS } from "./coach";

const DT = 1 / 60;
function run(coach: Coach, vario: number, roll: number, seconds: number): string[] {
	const out: string[] = [];
	for (let t = 0; t < seconds; t += DT) {
		const tip = coach.step(vario, roll, DT);
		if (tip) out.push(tip);
	}
	return out;
}

test("the first climb says to keep turning; falling out of it says what to do next; each tip shows once", () => {
	const coach = new Coach();
	expect(run(coach, -3, 0, 5)).toEqual([]);
	// A blip of lift is not a climb.
	expect(run(coach, 1, 0, 0.3)).toEqual([]);
	expect(run(coach, 2, 0.5, 4)).toEqual(["enter"]);
	expect(run(coach, -2, 0.5, 1)).toEqual(["leave"]);
	expect(run(coach, 2, 0.5, 4)).toEqual([]);
	expect(run(coach, -2, 0.5, 1)).toEqual([]);
	expect(TIPS.enter).toBe("In lift — keep turning to climb");
});

test("flying straight through lift earns a nudge to turn", () => {
	const coach = new Coach();
	expect(run(coach, 2, 0, 5)).toEqual(["enter", "turn"]);
	// A new flight keeps the tips already learned.
	coach.reset();
	expect(run(coach, 2, 0, 5)).toEqual([]);
});
