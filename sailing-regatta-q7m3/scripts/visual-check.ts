import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Where ad-hoc verification screenshots and recordings go. Gitignored and
 * excluded from the published source bundle, so frames left here for review
 * never count toward the bundle's size limit.
 */
export const VISUAL_CHECKS_DIR = ".visual-checks";

/** A path under {@link VISUAL_CHECKS_DIR}, creating the directory on first use. */
export function visualCheckPath(name: string, root = process.cwd()): string {
	const dir = join(root, VISUAL_CHECKS_DIR);
	mkdirSync(dir, { recursive: true });
	return join(dir, name);
}

function callLog(error: unknown): string {
	if (!(error instanceof Error) || !("callLog" in error)) return "";
	const log = error.callLog;
	if (typeof log === "string") return log;
	if (Array.isArray(log) && log.every((line) => typeof line === "string")) {
		return log.join("\n");
	}
	return "";
}

/** Resolves once everything already written to stdout and stderr is flushed. */
async function flushOutput(): Promise<void> {
	await Promise.all(
		[process.stdout, process.stderr].map(
			(stream) =>
				new Promise<void>((resolve) => stream.write("", () => resolve())),
		),
	);
}

/**
 * Run an ad-hoc browser check as the script's last statement, then end the
 * process: exit 0 once the body resolves, or print the failure without an
 * uncaught library code frame and exit 1.
 *
 * Ending on success is deliberate. A check that leaves its `TestServer` or
 * browser open (no `server.close()` in its `finally`) keeps the event loop
 * alive after its last screenshot, so the command would otherwise run until a
 * timeout kills it.
 */
export async function runVisualCheck(
	fn: () => void | Promise<void>,
): Promise<never> {
	let exitCode = 0;
	try {
		await fn();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(message);
		// Playwright usually includes its call log in message already.
		const log = callLog(error);
		if (log && !message.includes(log)) console.error(log);
		exitCode = 1;
	}
	await flushOutput();
	process.exit(exitCode);
}
