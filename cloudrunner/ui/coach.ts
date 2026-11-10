/**
 * Short contextual tips for a new pilot, driven by the variometer: the first
 * time they fly into lift, and the first time they fall out of it. Pure
 * state: the controller feeds it the flight and shows whatever it returns.
 */

/** Climb rate (m/s) the variometer must show, for SETTLE seconds, to count as "in lift". */
const IN_LIFT = 0.5;
const OUT_OF_LIFT = -0.5;
const SETTLE = 0.6;
/** A climb this long (s) before falling out earns the "you left it" tip. */
const WORTH_A_TIP = 3;
/** Not turning in lift for this long (s) earns a nudge. */
const STRAIGHT_IN_LIFT = 3.5;

export const TIPS = {
	enter: "In lift — keep turning to climb",
	turn: "Rising air! Hold a turn to stay in it",
	leave: "Out of the lift — turn back to it, or glide on to the beacon",
} as const;
export type TipKey = keyof typeof TIPS;

export class Coach {
	private liftT = 0;
	private straightT = 0;
	private inLift = false;
	private climbT = 0;
	private readonly shown = new Set<TipKey>();

	/** One step of flight: returns a tip to show now, or null. */
	step(vario: number, roll: number, dt: number): TipKey | null {
		if (!this.inLift) {
			this.liftT = vario > IN_LIFT ? this.liftT + dt : 0;
			if (this.liftT >= SETTLE) {
				this.inLift = true;
				this.climbT = 0;
				this.straightT = 0;
				return this.once("enter");
			}
			return null;
		}
		this.climbT += dt;
		this.straightT = Math.abs(roll) < 0.15 ? this.straightT + dt : 0;
		if (vario < OUT_OF_LIFT) {
			this.inLift = false;
			this.liftT = 0;
			return this.climbT >= WORTH_A_TIP ? this.once("leave") : null;
		}
		if (this.straightT >= STRAIGHT_IN_LIFT) {
			this.straightT = 0;
			return this.once("turn");
		}
		return null;
	}

	/** A new flight: tips already shown stay shown for the session. */
	reset(): void {
		this.liftT = 0;
		this.straightT = 0;
		this.inLift = false;
		this.climbT = 0;
	}

	private once(key: TipKey): TipKey | null {
		if (this.shown.has(key)) return null;
		this.shown.add(key);
		return key;
	}
}
