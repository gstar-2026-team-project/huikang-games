/** The level list: generated canyon runs, with the authored mission course as the finale. */
import { CORNER } from "./corner";
import { authoredStars, MISSION } from "./mission";
import { type CourseSpec, LEVEL_COUNT, levelSpec, starsFor } from "./modes";

/** The last level flies the authored mission course instead of a generated canyon. */
export const FINALE_LEVEL = LEVEL_COUNT;
/** Level 6 is a short hand-built run: one hard corner, a pull-up, and a dive onto a target. */
export const CORNER_LEVEL = 6;

export function levelCourse(level: number): CourseSpec {
	if (level === FINALE_LEVEL) return MISSION;
	if (level === CORNER_LEVEL) return CORNER;
	return levelSpec(level);
}

/** Stars for a level attempt; hand-built levels also need their target ring hit. */
export function levelStars(level: number, hits: number, completed: boolean, targetHit: boolean): number {
	const spec = levelCourse(level);
	if (!spec.authored) return starsFor(level, hits, completed);
	return authoredStars(spec.ringCount ?? 0, spec.authored.twoStarMisses, hits, completed, targetHit);
}
