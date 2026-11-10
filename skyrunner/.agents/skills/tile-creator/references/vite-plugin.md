# Vite Plugin

The `poeTile()` Vite plugin handles the platform build concerns that every bundled iframe app needs. Import it from `poe-tiles-sdk/vite`.

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { poeTile } from "poe-tiles-sdk/vite";

export default defineConfig({
  root: "tile",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "tile-frontend.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
  plugins: [react(), poeTile()],
});
```

The plugin handles:

- **Externals** — Prevents bundling platform-provided modules (`poe-tiles-sdk/v1/client.js`) since these are provided at runtime via import map.
- **Code splitting** — Rewrites dynamic `import()` calls to load chunks via `Poe.getBundleAssetUrl()`, which returns blob URLs that work in sandboxed iframes.
- **Vendor extraction** — Shared dependencies (from `node_modules`) are automatically extracted into a `vendor` chunk so they aren't duplicated across lazy chunks.
- **Web Workers** — Fails the build on `new Worker(new URL(…, import.meta.url))` and on a `?worker` import missing `&inline`, neither of which can load in a sandboxed iframe. Use `?worker&inline`, which works with no help from the plugin. See [Web Workers](#web-workers) below.
- **Backend building** — Optionally builds the synced-store backend config as part of the Vite build.

The plugin does **not** set `root`, `outDir`, `entryFileNames`, or `assetFileNames` — consumers control their own directory structure and output naming via standard Vite config.

## Minimum SDK Version

When a tile requires a runtime method or named export with a documented minimum SDK version, set that exact numeric literal in `poeTile({ minSdkVersion })` in `vite.config.ts`. Preserve an existing minimum, raise it when a new required API needs a later version, and never guess a version. Omit the option when the tile has no documented requirement. It accepts a positive safe integer and cannot be combined with `rootTile: true`.

Production builds automatically infer SDK 34 when emitted chunks import `createNativeResults`, or SDK 31 for `completeRound`, from `poe-tiles-sdk/v1/client.js`. Namespace and dynamic imports of that module require SDK 34 because they can access either export. The inferred minimum never lowers an explicit minimum. Root tiles are exempt; development mode still uses the explicit option.

The plugin checks the injected kernel version before importing the tile's entry module. An incompatible tile shows refresh instructions and requests the manager's update flow on hosts that support it. The check runs again after reload; if an automatic update did not help, the manager offers manual retry. `Poe.has(...)` only guards optional calls after the SDK has loaded; it cannot protect a missing named import because module linking happens first.

## Backend Config Building

Pass `backendEntryPoint` to build the synced-store backend config automatically after the Vite build:

```typescript
export default defineConfig({
  root: "tile",
  build: { outDir: "../dist" },
  plugins: [
    react(),
    poeTile({ backendEntryPoint: "src/backend.ts" }),
  ],
});
```

The path is resolved relative to the Vite root directory. The output (`synced-store-backend-config.js`) is placed in the Vite output directory. This eliminates the need for a separate `buildBackend()` call in your build script.

## Code Splitting

Dynamic `import()` calls are rewritten so that chunks are loaded via `Poe.getBundleAssetUrl()`. This is more reliable than normal browser-cached imports — the browser's HTTP cache may evict entries at any time, so lazy-loaded chunks fetched over the network can fail offline. Assets loaded via `Poe.getBundleAssetUrl()` are stored in IndexedDB by the top document, so they remain available even without a network connection.

## Web Workers

Import your worker with Vite's `?worker&inline` suffix:

```typescript
// worker.ts
self.onmessage = (event) => {
  self.postMessage(expensiveWork(event.data));
};

// entry.tsx
import MyWorker from "./worker.ts?worker&inline";

const worker = new MyWorker();
worker.onmessage = (event) => setResult(event.data);
worker.postMessage(input);
```

`&inline` is required — it is the whole reason this works. It bundles the worker
into your code and starts it from a blob URL, the only form the sandboxed iframe
allows. Two near-misses fail instead:

- `new Worker(new URL("./worker.ts", import.meta.url))` resolves against
  `import.meta.url`, which is a `blob:` URL in a tile, so the call throws
  `TypeError: Invalid URL`.
- A plain `?worker` (or `?sharedworker`) import compiles to
  `new Worker("/assets/worker-hash.js")` — a path nothing serves here, since the
  iframe makes no network requests.

**`poeTile()` fails the build on both**, with a message pointing at the fix, so
forgetting `&inline` is caught before you ship rather than breaking at runtime.

Constraints that come from the iframe sandbox:

- **Keep worker code statically imported.** A dynamic `import()` *inside* a worker
  will not resolve. Regular top-level `import` statements are fine — they get
  bundled into the worker.
- **Don't set `worker.format: "es"`** in `vite.config.ts`. It makes Vite's inline
  wrapper request a module worker, which a blob URL cannot serve. The default
  (`iife`) is what you want, and `poeTile()` pins it.
- **`SharedWorker` does not work at all** — shared workers are keyed by origin and
  the iframe's origin is opaque, so the browser denies it (`Access to shared
  workers is denied to origin 'null'`). `&inline` does not help. Use one regular
  worker per frame.
- **No `localStorage`, `IndexedDB`, or direct network access** in the worker — it
  inherits the tile's sandbox. Keep workers pure-compute (physics, pathfinding,
  parsing, image processing) and do I/O on the main thread via `Poe`.
- **Big workers ride in your bundle.** The source is inlined into your code. If it
  is large enough to matter for first paint, load it on demand instead:
  `new Worker(await Poe.getBundleAssetUrl("workers/heavy.js"))` — classic scripts
  only, and the file must end in `.js`.

### Without a bundler

No-build apps can't use `?worker&inline`, but the underlying primitive — a
**classic** worker started from a blob URL minted inside the iframe — is available
directly. Two recipes.

Worker source as a string:

```js
const workerSource = `
  self.onmessage = (event) => {
    self.postMessage(event.data.a + event.data.b);
  };
`;

// The MIME type is required: the browser refuses to run a worker whose blob is
// text/plain or application/octet-stream.
const url = URL.createObjectURL(
  new Blob([workerSource], { type: "text/javascript" }),
);

const worker = new Worker(url); // classic — do NOT pass { type: "module" }
worker.onmessage = (event) => console.log("sum:", event.data);
worker.postMessage({ a: 1, b: 2 });
```

Or keep the worker in its own file and ask the host for it:

```js
// worker.js must ship in your app directory and end in .js — the host derives
// the blob's MIME type from the extension.
const url = await Poe.getBundleAssetUrl("worker.js");
const worker = new Worker(url); // classic only
```

The second form costs one round-trip on first use but keeps the worker out of your
initial HTML. Both require classic worker syntax (`importScripts`, no
`import`/`export`); a module script cannot be fetched from a blob URL here. A
`data:` URL is the one exception that does allow `{ type: "module" }`.

## No-Build vs Bundled

| | No-Build | Bundled |
|---|---|---|
| Import | `poe-tiles-sdk/v1/client.js` | `poe-tiles-sdk/v1/client.js` |
| Schema | Inline mutators | `defineSchema()` + `defineClientConfig()` |
| Config | `{ mutators, schemaVersion }` | Pre-built client config object |
| Types | None (plain JS) | Full type inference from Zod schema |
