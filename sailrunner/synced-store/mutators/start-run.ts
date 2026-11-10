import { notifyActivity } from "poe-tiles-sdk/v1/client.js";
import { courseLabel, generateCourse, isDayKey } from "../../game/course";
import type { TileMutator } from "./types";

export const startRun: TileMutator<"startRun"> = async (ctx, input) => {
	if (!isDayKey(input.day)) throw new Error(`Invalid day ${input.day}`);
	const runs = ctx.privateOfUser(ctx.userId).table("activeRun");
	// A replayed start for the same run must not reset its checkpoints.
	if ((await runs.get("current"))?.runId === input.runId) return;

	const course = generateCourse(input.day);
	await runs.set({
		itemKey: "current",
		value: {
			runId: input.runId,
			day: input.day,
			startedAt: input.startedAt,
			markIndex: 0,
			x: course.start.x,
			y: course.start.y,
			heading: input.heading,
			speed: 0,
			splits: [],
			trace: [],
		},
	});
	await notifyActivity(ctx, {
		preview: `You set sail on ${courseLabel(input.day)}`,
		previewTimestamp: input.startedAt,
		targetUserIds: [ctx.userId],
		recency: "bump",
	});
};
