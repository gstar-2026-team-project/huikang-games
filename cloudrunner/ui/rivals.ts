/** Pure helpers for the live "score to beat" layer. */

export interface BoardEntry { userId: string; score: number }
export interface Profile { name: string; picture: string | null }

export interface RivalView {
	/** the next other pilot above the current score, if any */
	target: (BoardEntry & Profile) | null;
	/** true when every other pilot's best is already below the current score */
	leading: boolean;
	/** how many other pilots have a score */
	others: number;
}

export function rivalView(
	entries: readonly BoardEntry[],
	profiles: ReadonlyMap<string, Profile>,
	me: string,
	score: number,
): RivalView {
	const others = entries.filter((e) => e.userId !== me && e.score > 0);
	let target: BoardEntry | null = null;
	for (const e of others) {
		if (e.score >= score && (!target || e.score < target.score)) target = e;
	}
	const profile = (id: string): Profile => profiles.get(id) ?? { name: "Pilot", picture: null };
	return {
		target: target ? { ...target, ...profile(target.userId) } : null,
		leading: others.length > 0 && !target,
		others: others.length,
	};
}

/** Other pilots whose best this score has just gone past (strictly). */
export function newlyPassed(
	entries: readonly BoardEntry[],
	me: string,
	before: number,
	after: number,
	alreadyPassed: ReadonlySet<string>,
): BoardEntry[] {
	return entries.filter(
		(e) => e.userId !== me && e.score > 0 && !alreadyPassed.has(e.userId) && e.score < after && e.score >= before,
	);
}

export function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const s = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : (parts[0] ?? "?").slice(0, 2);
	return s.toUpperCase() || "?";
}
