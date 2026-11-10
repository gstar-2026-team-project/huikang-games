# Assets

> **Use real assets, not emoji.** For icons, glyphs, and decorative art, ship
> SVGs or generated image assets rather than Unicode emoji. Emoji render
> inconsistently across devices and make an app look cheap. Emoji that *users*
> author (chat, reactions) are content, not part of the app's UI, and are fine.

> **Bundle the asset — don't hot-link a remote URL.** Load a tile's own
> images / fonts / data from the bundle, never from a remote CDN (a hardcoded
> `<img src="https://…">` or a `fetch()` to a CDN host). Tiles cold-start
> offline and render before the network is up, so a remote fetch flashes the
> broken-image placeholder on cold-cache / offline launches and only "works"
> once the browser has cached it. Download the file into the tile and load it
> via `?url` (inlined) or `Poe.getBundleAssetUrl()` (below). Remote URLs are
> only for genuinely dynamic, platform-served content (e.g. a member's
> `$userInfo` profile picture or a `store.files.url(...)` upload) — never the
> app's own static art. The tile iframe's Content Security Policy blocks
> images, scripts, and fetches from any other host, so a third-party URL
> fails in production even when it renders in local development (see
> [sandbox-limitations.md](./sandbox-limitations.md#network-access)).

Three ways to ship + load files in a Joiner tile.

## Static asset → `import "./img.svg?url"`

Vite inlines as `data:` URL when under `assetsInlineLimit`. Use for known paths.
The `vite/client` entry in the scaffold tsconfig's `compilerOptions.types` types
these imports; add it if a tile's tsconfig lacks it, and do not suppress the error.

```typescript
import logoUrl from "./assets/logo.svg?url";
img.src = logoUrl;
```

```typescript
// vite.config.ts — bump limit so files inline (sandbox iframe origin is "null",
// hashed asset paths don't reliably resolve).
export default defineConfig({
  build: { assetsInlineLimit: 10 * 1024 * 1024 }, // 10 MB
  plugins: [poeTile()],
});
```

`?raw` for inline text.

**Use an inlined `?url` only for images, CSS, and fonts.** An inlined import is a
`data:` URL. The tile frame's CSP allows `data:` for `img.src`, CSS `url()`, and
`@font-face`. It does not allow `data:` for media (`<audio>`, `<video>`,
`new Audio(url)`) or for `fetch()` and `XMLHttpRequest`. Those fail in production
with a CSP error, and the tile is silent or empty.

For audio, video, or bytes (for example `AudioContext.decodeAudioData`), decode
the payload yourself. Vite inlines non-SVG files as base64:

```typescript
import musicUrl from "./assets/theme.m4a?url";

function dataUrlBytes(dataUrl: string): ArrayBuffer {
  if (!dataUrl.startsWith("data:")) {
    throw new Error(`Not inlined; raise build.assetsInlineLimit: ${dataUrl}`);
  }
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}
// Bytes for Web Audio:
const music = await audioContext.decodeAudioData(dataUrlBytes(musicUrl));
// Or a blob: URL for <audio>/<video> (revoke it when the player is disposed):
const audio = new Audio(
  URL.createObjectURL(new Blob([dataUrlBytes(musicUrl)], { type: "audio/mp4" })),
);
```

The recipe needs the file inlined. Vite's default `assetsInlineLimit` is 4 KB,
so set the larger limit above; otherwise `?url` is a plain path that nothing
serves here. For SVG or other text, import with `?raw` instead. Or load the file
at runtime with `Poe.getBundleAssetUrl()` (below): its `blob:` URL works for
media and `fetch()`.

## Runtime asset → `Poe.getBundleAssetUrl(path)`

Returns cached `blob:` URL. Use for dynamic paths, large files, no-build apps.

```typescript
img.src = await Poe.getBundleAssetUrl("/assets/hero.png");
const data = await fetch(await Poe.getBundleAssetUrl("data/levels.json")).then(r => r.json());
```

Leading slash / bare / `./` all equivalent. Cached. See [client-api.md](./client-api.md#poe-getbundleasseturl-path).

## Lazy code chunk → `import("./mod")`

Plugin rewrites dynamic `import()` to fetch chunks via `getBundleAssetUrl()`. Lazy CSS auto-loaded with its JS chunk.

```typescript
const Heavy = React.lazy(() => import("./Heavy"));    // React
const Heavy = lazy(() => import("./Heavy"));          // SolidJS
const { compute } = await import("./compute");        // plain
```

## Pick

| Need | Use |
|---|---|
| Static path, small | `import "...?url"` |
| Audio/video, or bytes of a static file (`decodeAudioData`, parsing) | `?url` + decode the base64 to bytes or a `blob:` URL, or `Poe.getBundleAssetUrl(path)` — never pass the `?url` to a media element or `fetch()` |
| Dynamic path / large / no build | `Poe.getBundleAssetUrl(path)` |
| Defer code module | `import("./mod")` |
