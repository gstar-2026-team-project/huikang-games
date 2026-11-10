// owner: jyoung-q
/** Also copied into standalone scaffolds so checks do not require the CLI. */
export const TESTED_BUN_RANGE = ">=1.4.2 <1.5.0";

/** Any other Bun 1.x is allowed with a warning; only non-1.x fails. */
export type BunSupport = "tested" | "untested" | "unsupported";

export function bunSupport(version: string): BunSupport {
	const match = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.+-]+)?$/.exec(version.trim());
	if (!match || Number(match[1]) !== 1) return "unsupported";
	const tested =
		Number(match[2]) === 4 && Number(match[3]) >= 2 && match[4] === undefined;
	return tested ? "tested" : "untested";
}

export function untestedBunWarning(version: string): string {
	return `Bun ${version} is untested; this creator toolchain is tested with Bun ${TESTED_BUN_RANGE}. If install, build, or preview fails, install Bun 1.4.2 using https://bun.com/docs/installation#installing-older-versions.`;
}

export function assertSupportedBun(
	version = Bun.version,
	warn: (message: string) => void = console.warn,
): void {
	const support = bunSupport(version);
	if (support === "unsupported") {
		throw new Error(
			`Found Bun ${version}; this creator toolchain needs Bun 1.x and is tested with ${TESTED_BUN_RANGE}. Install Bun 1.4.2 using https://bun.com/docs/installation#installing-older-versions, then retry.`,
		);
	}
	if (support === "untested") warn(untestedBunWarning(version));
}

if (import.meta.main) assertSupportedBun();
