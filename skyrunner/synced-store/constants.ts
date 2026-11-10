// Plain constants shared by mutators and UI. No SDK or zod imports.
/** Free-flight board (the original endless mode). */
export const LEADERBOARD_ID = "best-rings";
export const LEADERBOARD_LABEL = "Most rings in one flight";
export const RING_UNIT = { singular: "ring", plural: "rings" } as const;
/** Largest ring count a single flight can plausibly report. */
export const MAX_RINGS_PER_RUN = 10_000;
export const RUN_END_REASONS = ["ground", "time", "interrupted", "complete"] as const;
export type RunEndReason = (typeof RUN_END_REASONS)[number];
// "mission" is retired (the course is now the last level); kept so older test rows still parse.
export const RUN_MODES = ["free", "daily", "level", "mission"] as const;
export type RunMode = (typeof RUN_MODES)[number];
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** One board per day; the date is in the id and the label so a notification read tomorrow still makes sense. */
/** v2 boards rank rings with a time tie-break (40-second runs); "daily-" boards were ring counts only. */
export const dailyBoardId = (day: string) => `daily40-${day}`;
