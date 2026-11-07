import {
	getLeaderboard,
	getUserInfo,
	notifyActivity,
	setLeaderboardScore,
} from "poe-tiles-sdk/v1/client.js";
import { usableDisplayName } from "poe-tiles-sdk/v1/shared.js";
import { MAX_RUN_MS, MAX_SPEED, RUN_RETENTION_DAYS } from "../../game/constants";
import {
	courseLabel,
	courseLength,
	generateCourse,
	isDayKey,
	leaderboardIdFor,
	shiftDay,
} from "../../game/course";
import { formatTime } from "../../game/format";
import { raceStats, statsMarkdown } from "../../game/stats";
import type { TileMutator } from "./types";

export function runKey(day: string, userId: string): string {
	return `${day}/${userId}`;
}

export const finishRun: TileMutator<"finishRun"> = async (ctx, input) => {
	if (!isDayKey(input.day)) throw new Error(`Invalid day ${input.day}`);
	const active = ctx.privateOfUser(ctx.userId).table("activeRun");
	const current = await active.get("current");
	// Already recorded (a replay after confirmation) or never started: no-op.
	if (current?.runId !== input.runId || current.day !== input.day) return;

	const course = generateCourse(input.day);
	const fastestPossibleMs = (courseLength(course) / MAX_SPEED) * 1000;
	if (
		input.splits.length !== course.marks.length ||
		input.splits[input.splits.length - 1] !== input.timeMs ||
		input.timeMs < fastestPossibleMs ||
		input.timeMs > MAX_RUN_MS
	) {
		throw new Error("Run result is not consistent with the course");
	}
	await active.delete("current");

	const runs = ctx.table("runs");
	const cutoff = shiftDay(input.day, RUN_RETENTION_DAYS);
	for await (const row of runs.scan().values()) {
		if (row.day < cutoff) await runs.delete(runKey(row.day, row.userId));
	}

	const label = courseLabel(input.day);
	const time = formatTime(input.timeMs);
	const key = runKey(input.day, ctx.userId);
	const previous = await runs.get(key);
	if (previous && previous.timeMs <= input.timeMs) {
		await notifyActivity(ctx, {
			preview: `You sailed ${label} in ${time}`,
			previewTimestamp: input.finishedAt,
			targetUserIds: [ctx.userId],
			recency: "bump",
		});
		return;
	}

	const leaderboardId = leaderboardIdFor(input.day);
	const board = await getLeaderboard(ctx, { leaderboardId });
	const others = board.entries.filter((entry) => entry.userId !== ctx.userId);
	const oldBest = previous?.timeMs ?? Number.POSITIVE_INFINITY;
	const overtaken = others
		.filter((entry) => entry.score < oldBest && entry.score > input.timeMs)
		.map((entry) => entry.userId);
	const tookLead =
		others.length > 0 && others.every((entry) => entry.score > input.timeMs);

	await runs.set({
		itemKey: key,
		value: {
			userId: ctx.userId,
			day: input.day,
			timeMs: input.timeMs,
			splits: [...input.splits],
			trace: [...input.trace],
			finishedAt: input.finishedAt,
		},
	});
	// The tile sends its own targeted "you were passed" notifications below.
	await setLeaderboardScore(
		ctx,
		{
			leaderboardId,
			userId: ctx.userId,
			score: input.timeMs,
			bestScore: "lowest",
			label,
			displayScore: time,
			markdown: statsMarkdown(raceStats(course, input.trace, input.timeMs), input.timeMs),
		},
		{ mode: "merge", notifyOnHighScore: false },
	);

	const name = usableDisplayName(await getUserInfo(ctx, ctx.userId)) || "A sailor";
	if (overtaken.length > 0) {
		await notifyActivity(ctx, {
			preview: `${name} beat your time on ${label}`,
			previewTimestamp: input.finishedAt,
			targetUserIds: overtaken,
			unread: "increment",
			push: { body: `${name} just beat your time on ${label} with ${time}!` },
			...(tookLead
				? {
						postToChat: {
							messageId: `lead-${input.runId}`,
							text: `⛵ ${name} took the lead on ${label} with ${time}`,
							timestamp: input.finishedAt,
						},
					}
				: {}),
		});
	}
	await notifyActivity(ctx, {
		preview: tookLead
			? `You took the lead on ${label} with ${time}`
			: `You set a new best on ${label}: ${time}`,
		previewTimestamp: input.finishedAt,
		targetUserIds: [ctx.userId],
		recency: "bump",
	});
};
