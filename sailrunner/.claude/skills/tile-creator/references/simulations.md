# Simulations from the CLI

External harnesses and creator agents can create a simulation and capture its
state with the same platform snapshot action used by the Creator's **Send debug
info to agent** flow. These commands use the signed-in creator's account; no
admin credential is required. Run `poe-tiles login` first. Creator-scoped publish
tokens (`cst_` / `cv2_`) cannot replace a user session for these commands.

## Upload → create → capture

From your tile workspace, with Bun and `jq` installed:

```bash
poe-tiles login
bun run build

# Keep harness artifacts outside the source bundle.
SIM_RUN_DIR="$(mktemp -d)"
poe-tiles --json tiles upload > "$SIM_RUN_DIR/upload.json"

# Pin this simulation to the exact uploaded version.
SIM_TYPE_ID="$(jq -er '.id + "~v-" + (.versionNumber | tostring)' "$SIM_RUN_DIR/upload.json")"
poe-tiles --json simulations create "$SIM_TYPE_ID" > "$SIM_RUN_DIR/simulation.json"
SIM_INSTANCE_ID="$(jq -er '.instanceId' "$SIM_RUN_DIR/simulation.json")"

poe-tiles --json simulations list "$SIM_TYPE_ID"
poe-tiles simulations debug "$SIM_TYPE_ID" "$SIM_INSTANCE_ID" \
  --out "$SIM_RUN_DIR/debug.json"

# A harness should check both flags before treating the capture as exhaustive.
jq -e '.complete and .store.consistent' "$SIM_RUN_DIR/debug.json"
```

An upload records a version. On an existing tile, whether it also advances
`live` depends on Auto-Advance Live. To keep an existing live version fixed,
run `poe-tiles tiles auto-advance <tileHandleOrId> off` before uploading.

`create` always creates a fresh simulation and seeds test players according to
the tile's declared player range. It initializes server state; it does not open
a browser or automatically play the tile. Your UI or external harness still
drives player interactions. To inspect an existing simulation, use `list` and
pass its `typeId` and `instanceId` to `debug`.

## Select the build and instance

All three commands take a **type ID**, not a tile handle:

| Type ID | Build selection |
| --- | --- |
| `<tileId>` | The tile's live build |
| `<tileId>~v-<versionNumber>` | A fixed uploaded version |
| `<tileId>~c-<channel>` | A custom channel, such as `beta` |

Use `tiles get <tileHandleOrId>` to find a tile's ID. For a custom channel:

```bash
poe-tiles tiles set-channel <tileHandleOrId> beta <versionNumber> --no-auto-advance
poe-tiles --json simulations create '<tileId>~c-beta'
```

Listing is scoped to the **exact** type ID: bare, version-scoped, and
channel-scoped simulations have separate lists. `debug` takes the tile's
`instanceId`, not its wrapping `containerId` or paired chat's `room.instanceId`.
The selected build must have a backend; a client-only build cannot run this
simulation flow.

## Debug output

```bash
poe-tiles simulations debug <typeId> <instanceId> > debug.json
poe-tiles --json simulations debug <typeId> <instanceId> --out debug.json
poe-tiles simulations debug <typeId> <instanceId> --max-bytes 1048576 --timeout-ms 30000
```

Without `--out`, stdout is the JSON document even without `--json`. With `--out`,
the CLI creates a new file with owner-only filesystem permissions and refuses
to overwrite an existing file. `--json --out` prints a receipt containing
`path`, `complete`, and `consistent` instead of printing the captured rows.

The document contains `version: 1`, `generatedAt`, `takenBy`, `build`, `target`,
`store`, `seats`, `limits`, and `complete`. Each seat has public rows and that
test player's private rows, labelled by visibility. The server selects seats
from the caller and their active test players. Server-only rows are excluded.
The simulation owner can capture without joining the tile instance. This
command does not grant access to other creators' simulations or real players'
private state.

`store.consistent` means the returned data was read at a consistent store and
schema version. `complete` means no seat was truncated by the byte budget.
Partial or inconsistent captures are still written, with a warning on stderr;
the command succeeds so a harness can inspect them. Check both flags, and
retry after activity settles if consistency is required. Increase the budget
within the supported range if the capture is incomplete.

`--max-bytes` defaults to **4,194,304 UTF-8 bytes** and accepts integers from
**262,144 through 4,194,304**. It bounds the server's compact snapshot JSON;
document metadata and stdout formatting add bytes. `--timeout-ms` defaults to
30,000 for each WebSocket open/response wait. Authentication, access, transport,
and file-write failures exit nonzero.

The state fields match the Creator snapshot document. A terminal capture has
no browser kernel/SDK version, user agent, console logs, or screenshot, and does
not send an attachment to an agent automatically. Pass the saved JSON to your
agent using your harness's usual attachment mechanism.

The CLI captures through the existing user-router WebSocket action protocol.
Use `simulations debug` for this flow: `stores action ... poeDebugSnapshot`
uses REST, whose current result serialization cannot carry this snapshot.

## Programmatic use

```typescript
const simulation = await client.simulations.create(typeId);
const inventory = await client.simulations.list(typeId);
const debug = await client.simulations.debug({
  typeId: simulation.typeId,
  instanceId: simulation.instanceId,
  maxBytes: 4_194_304,
});
```

These methods throw on failure. `create` returns the tile coordinates, paired
chat, container coordinates, and test-player identities. `list` returns
`sandboxes` and `buildHasBackend`. See [CLI overview](cli.md#programmatic-usage)
for client construction and authentication.
