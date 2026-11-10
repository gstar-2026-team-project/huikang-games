# Compact data before the live data limit

Add `onLiveDataLimitApproaching(ctx, { availableBytes, liveDataSize, maxLiveDataSize })`
to the backend config's `hooks`. The server-only hook can scan rows, assemble
an archive, store a file, and replace the rows with a file reference in one mutation.

## Archive the oldest messages

This example scans `messages` in ascending `sortKey` order, breaking ties by
`itemKey`. Give messages nonempty sort keys that increase with message time so
the scan returns the oldest messages first. `authors` contains their authors'
display profiles. Keep each message and profile bounded in the schema. Declare
the archive's file references so the store retains the file when the mutation
commits:

```typescript
archives: {
	schema: table(z.object({
		fileIds: z.array(z.string()),
		messageCount: z.number(),
		lastSortKey: z.string(),
	})),
	fileRefs: { strong: ["fileIds"] },
},
```

Add the hook to `defineBackendConfig({ schema, mutators, hooks })`:

```typescript
hooks: {
	onLiveDataLimitApproaching: async (ctx, { availableBytes, liveDataSize, maxLiveDataSize }) => {
		console.info("Live data limit approaching", {
			availableBytes,
			liveDataSize,
			maxLiveDataSize,
		});
		const limit = availableBytes < 1_000_000 ? 100 : 50;
		const messages = await ctx.table("messages")
			.scan({ limit, reverse: false })
			.entries()
			.toArray();
		if (messages.length === 0) return;

		const authorIds = [...new Set(messages.map(([, message]) => message.authorId))];
		const authors = await Promise.all(authorIds.map(async (id) => ({
			id,
			profile: (await ctx.table("authors").get(id)) ?? null,
		})));
		const archive = {
			messages: messages.map(([key, value]) => ({
				itemKey: key.itemKey,
				sortKey: key.sortKey ?? "",
				value,
			})),
			authors,
		};
		const bytes = new TextEncoder().encode(JSON.stringify(archive));

		await Promise.all(messages.map(([key]) => ctx.table("messages").delete(key)));
		const file = await ctx.files.store(bytes, { name: "messages.json" });
		await ctx.table("archives").set({
			itemKey: file.fileId,
			sortKey: messages[0]![0].sortKey,
			value: {
				fileIds: [file.fileId],
				messageCount: messages.length,
				lastSortKey: messages[messages.length - 1]![0].sortKey ?? "",
			},
		});
	},
},
```

`reverse: false` explicitly selects ascending order; `reverse: true` would scan
in descending order. This archives the oldest messages and a snapshot of their
related author profiles. The authors remain live. This example archives 50
messages, or 100 when remaining quota falls below one million bytes.
Choose a batch size that fits the hook's execution, memory, key-count, and
file-size limits.
Keep the archive reference in the same visibility tier as its source rows.

The deletions above only change the pending mutation. `await ctx.files.store()`
uploads the bytes first, then the final database commit publishes the file
record and reference together with the deletions. If the upload, hook, or commit
fails, the original rows remain. Unretained bytes from an aborted upload are
eligible for normal file-storage cleanup. Always await the store call and
reference its returned `fileId` through a declared `fileRefs` field in the same
mutation. File uploads require an initiating user.

## When the hook runs

The server evaluates capacity after the normal mutations and hooks in an
operation group, including the file claims they made. A client push is one
group. The callback runs once when the group has increased live data and projected
usage is at least 80% of the configured limit. Later growing groups notify
again. No-op and shrinking groups do not notify, and writes inside this
callback do not recursively invoke it.

The input uses the same usage and limit names as `store.getDiagnostics()`:

- `liveDataSize`: projected live usage, including the triggering group's pending writes.
- `maxLiveDataSize`: the configured live data limit.
- `availableBytes`: nonnegative remaining capacity, `Math.max(0, maxLiveDataSize - liveDataSize)`.

All three describe the invocation snapshot, before this callback's writes.
They are UTF-8 BYTES, the same unit as the quota itself.
Later diagnostics can differ after the hook compacts data. Each live row counts
the UTF-8 byte length of `sortKey`, `storedTableName`, `itemKey`, and
`JSON.stringify(value)` added together — so non-ASCII text costs more than its
character count: 2 bytes for most accented Latin, 3 for CJK, 4 for emoji.
Appending 100 CJK characters to a stored string raises `liveDataSize` by 300,
not 100, and lowers `availableBytes` by the same amount.
File contents do not count toward this live data limit; file records and
references do. Legacy stores begin notifications after exact size accounting
is available.

The hook runs only on the server and preserves the triggering operation's
user and source. It can read and write application tables, store files, and
enqueue actions. Ordinary client mutators cannot call `ctx.files.store()`.
The hook cannot write platform-owned system tables. Normal mutation size,
key count, file ownership, file quotas, and live data limits still apply.

Callback writes commit atomically with their triggering group. If the callback
throws, that group's writes and queued work roll back.

This is an early warning. Existing quota checks run before the callback, so a
mutation that already exceeds the hard limit is rejected. A large push can
hit that limit before its final capacity check.

File creation has its own size and execution limits. See
[file uploads](file-uploads.md) before selecting batch sizes.
