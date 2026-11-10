/**
 * Dev server for cloudrunner-k7q2.
 *
 * Spawns `vite build --watch`, serves the bundle through TestServer, and
 * injects browser auto-reload on rebuild.
 *
 *   bun run dev
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPoeTileDevServer } from "poe-tiles-sdk/v1/test-utils/dev-server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

await runPoeTileDevServer({
	tileTypeId: "cloudrunner-k7q2",
	tileRootDir: resolve(__dirname, ".."),
});
