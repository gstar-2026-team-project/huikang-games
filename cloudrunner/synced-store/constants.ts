// Plain constants shared by mutators and UI. No SDK or zod imports.
/** Free-flight board: most turnpoints reached before landing out. */
export const LEADERBOARD_ID = "most-turnpoints";
export const LEADERBOARD_LABEL = "Most turnpoints in one flight";
export const TURNPOINT_UNIT = { singular: "turnpoint", plural: "turnpoints" } as const;
/** Largest turnpoint count a single flight can plausibly report. */
export const MAX_TURNPOINTS_PER_RUN = 10_000;
export const RUN_END_REASONS = ["ground", "time", "interrupted", "complete"] as const;
export type RunEndReason = (typeof RUN_END_REASONS)[number];
export const RUN_MODES = ["free", "daily"] as const;
export type RunMode = (typeof RUN_MODES)[number];
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** One board per day; the date is in the id and the label so a notification read tomorrow still makes sense. */
export const dailyBoardId = (day: string) => `task-${day}`;
