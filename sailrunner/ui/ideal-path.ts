import { planCourse, type Side } from "../game/coach";
import type { Course, Point } from "../game/course";
import { windAt } from "../game/physics";
import type { BoatPose } from "../render/boat";

/** The ideal path is replanned from the boat this often (simulation steps). */
const REPLAN_STEPS = 12;

/**
 * The optional computed path through the remaining buoys, replanned as the
 * boat moves and the wind shifts. Empty while hidden.
 */
export class IdealPath {
	shown = false;
	route: Point[] = [];
	private side: Side = 1;
	private sincePlan = 0;

	/** Count one simulation step; true when the path is due a replan. */
	tick(): boolean {
		return this.shown && ++this.sincePlan >= REPLAN_STEPS;
	}

	clear(): void {
		this.route = [];
		this.sincePlan = 0;
	}

	/** Plan from the boat through every buoy from `nextMark` on, for the wind at `ms`. */
	plan(course: Course, pose: BoatPose, nextMark: number, ms: number): Point[] {
		const plan = planCourse(pose, course.marks.slice(nextMark), windAt(course, ms / 1000), this.side);
		this.side = plan.side;
		this.route = plan.route;
		this.sincePlan = 0;
		return this.route;
	}
}
