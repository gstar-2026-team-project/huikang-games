---
name: image-generation
description: Generate game art, sprites, backgrounds, and the listing icon for a Joiner tile with the generate_image tool of a Creator session. Use when a tile's look depends on drawn art that code cannot make well, when the request names a specific animal, character, or object to show, or when the creator asks for images. Covers prompts, style consistency, formats, file locations, loading the image in a prototype or an integrated tile, when and how to make the icon, costs, and errors.
allowed-tools: Bash, Glob, Grep, Read, Edit, Write
user-invocable: false
---

# Image generation

This skill needs the `generate_image` tool of a Joiner Creator session.
If you do not have that tool, say that image generation is not available here, and stop. Do not use another image source instead. The one exception is the **Icon** section: it still runs without the tool, and its own steps say what to do.

## When to generate

Generate distinctive art that the tile's look depends on: characters, pieces, cards, backgrounds, and the icon. Keep UI chrome, simple shapes, and text in code (CSS, canvas, or SVG).

In a prototype (the tile being worked on has a `.poe-prototype` marker), generate only when the creator asks for images or art, or when the request names a specific animal, character, or object the player must recognize (a dog, a knight, a teapot). Code-drawn shapes rarely read as such a subject, so generate it and check the preview as **How to ask** says. Draw everything else, including UI and simple shapes, with canvas, CSS, and inline SVG as the prototype skill says.

## How to ask

- **One asset per call.** Compose scenes in code. Do not ask for sprite sheets, grids, or text in an image; the model places all three badly.
- **One style.** Write a style line once (for example `flat vector, thick dark outline, warm palette, soft top-left light`) and reuse it word for word in every prompt for the tile. After the creator accepts the first asset, pass it in `referenceImages` for the rest.
- **Sprites** use `background: "transparent"` with a `.webp` output. A transparent 1024×1024 `.png` is about 750 KB.
- **Quality.** `low` for drafts, `medium` by default, `high` only for one hero asset. Sizes are `1024x1024` (default), `1536x1024`, and `1024x1536`.
- The tool returns a small preview. Look at it before you use the file. If the subject is wrong, fix the prompt once.

## Where the file goes

`<tileDir>` is the directory that holds the tile's `.poe-tile.json`: `.` for a tile at the workspace root, or for example `chess` for `/workspace/chess/`.

- `outputPath` is relative to `/workspace`. Pass `<tileDir>/assets/<name>.webp`.
- Code and the manifest name the file relative to `<tileDir>`, for example `./assets/hero.webp`.
- Never write to the workspace root's `assets/` for a nested tile. Files there are outside the tile and do not ship.
- The extension is required and sets the format: `.webp`, `.png`, `.jpg`, or `.jpeg`. Use `.webp` unless you need another format.
- The tool replaces a file that already exists at `outputPath`.

Treat every generated file as public. Players can read a shipped asset, whatever the source visibility is.

## Loading the image

A tile runs in a sandboxed frame from a `blob:` URL, so a relative path such as `<img src="assets/hero.webp">` does not load.

**In a prototype**, embed the images as `data:` URLs. Generate a data script with Bash, so the base64 text never passes through your own edits:

```bash
cd <tileDir> && {
  echo 'globalThis.IMAGES = {'
  for f in assets/*.webp assets/*.png assets/*.jpg assets/*.jpeg; do
    [ -e "$f" ] || continue
    type="${f##*.}"; [ "$type" = jpg ] && type=jpeg
    name="$(basename "${f%.*}")"
    printf '  "%s": "data:image/%s;base64,%s",\n' "$name" "$type" "$(base64 < "$f" | tr -d '\n')"
  done
  echo '};'
} > assets/images.js
```

Add `<script src="assets/images.js"></script>` before the module script in `index.html`, and use `IMAGES.hero` as an image `src`. The host inlines that script. It holds data only, so it is the one exception to the prototype's single-script rule. Run the command again after each new image.

**In an integrated tile** (a Vite project), import each file with `?url`. The scaffold's tsconfig lists `vite/client` in `compilerOptions.types`, which types the import; if a tile's tsconfig lacks it, add it there instead of suppressing the error:

```typescript
import heroUrl from "../../assets/hero.webp?url";
```

Adjust the relative path from the importing file to `<tileDir>/assets/`. Set `build.assetsInlineLimit` to `10 * 1024 * 1024` in `vite.config.ts` if the project does not set it already, so the image is inlined into the bundle. Do not use `Poe.getBundleAssetUrl` for these files: `<tileDir>/assets/` is outside the Vite root, so they are not in the runtime bundle.

**When a prototype becomes an integrated tile**, copy its image files from `assets/` into the new tile's `assets/`, load them with `?url` imports, and do not carry `assets/images.js` over.

## Limits

- The runtime bundle is at most 52,428,800 bytes. A `medium` 1024×1024 webp is about 64 KB.
- `profilePicture` is at most 524,288 bytes.
- The prompt is at most 32,768 UTF-8 bytes.

## References

Pass as a reference only an image this tool generated, or an image the creator explicitly asked you to use as a reference in this request. A workspace image may be something the creator uploaded, and a reference sends it to the image provider.

- At most 4 references. Any reference makes the call an edit.
- Each is a png, webp, or jpeg of at most 2,097,152 bytes on disk.
- All references together are at most 8,388,608 bytes once base64 encoded, which is about 6,291,456 bytes on disk.
- Downscale or drop references to fit.

## Cost, limits, and errors

- Each call costs money. A creator has 10,000 image requests per UTC day across all sessions, and failed and refused requests count.
- Do not regenerate to fish for a slightly better result.
- Make one call at a time. At most 2 calls run at once; a third parallel call fails with `busy`.
- Every error names a code and says whether to retry. Follow it, and never retry more than once. `provider_error` is also how a content-policy refusal arrives: rephrase the prompt once, then stop and tell the creator.
- After `image_cap_reached`, do not call the tool again today. Draw with code, and tell the creator.
- After `spend_cap_reached`, do not call the tool again before the reset that the error names. Draw with code, and tell the creator.

## Icon

A tile with platform integration gets its icon before the creator can reach public listing, so the preview they open already shows it. Run this section at each of these points:

- **Before you end any turn that invites public listing**, such as the handover of a tile with platform integration. When you integrate a prototype, run it in staging before `promote_conversion`, with `<tileDir>` the staging directory (for example `.staging/chess`).
- **In `publish`**, before `request_listing`.

It keeps an adequate icon, so after the first run it usually generates nothing. A prototype gets no icon from this section: skip it when `<tileDir>` itself holds a `.poe-prototype` marker. A staging candidate during integration holds none, so it gets one. Decide from the workspace only, never from memory of earlier turns, so compaction or a new session cannot change the answer. This section never blocks a turn or a listing.

`profilePicture` resolves against `<tileDir>`, so inspect `<tileDir>/<profilePicture>` with `file <path>`. `file` prints the format for PNG, JPEG, and WebP. It prints the dimensions only for PNG, JPEG, and lossy (VP8) WebP; it prints no dimensions for lossless (VP8L) or extended (VP8X: alpha, metadata, or animation) WebP. "Valid" means PNG, JPEG, or WebP, at most 524,288 bytes, and readable.

| `profilePicture` is | Action | If generation fails or stays over 524,288 bytes |
| --- | --- | --- |
| an `https://` URL | Keep it. Do not generate. | — |
| a valid local image, shorter side ≥ 256 px | Keep it. Do not generate. | — |
| a valid local image whose dimensions `file` does not print (e.g. an alpha WebP) | Keep it. Do not generate. | — |
| a valid local image, shorter side < 256 px (e.g. the 64×64 scaffold placeholder) | Generate. | Keep the old value. It is valid, so listing still succeeds. |
| absent, or an empty string | Generate. | Leave it absent. Remove an empty-string key, which the CLI rejects. |
| a local path that is missing, unreadable, not a PNG, JPEG, or WebP, or over 524,288 bytes | Generate. | **Remove the key.** Listing would fail on it, and listing must not block. |

When the table says generate, use the recipe below. Never generate into the file that `profilePicture` names: a small valid icon there is the fallback, and the tool replaces its output path. Every `outputPath` is `/workspace`-relative, so it carries the `<tileDir>/` prefix.

1. Generate into `<tileDir>/assets/icon-candidate.webp`.
2. If the candidate is over 524,288 bytes, regenerate it once at `low` quality and check again.
3. If the candidate is within the limit, `mv` it to `<tileDir>/assets/icon.webp` and set `profilePicture` to `./assets/icon.webp`.
4. Otherwise, and on any tool error or when the `generate_image` tool is absent, delete `<tileDir>/assets/icon-candidate.webp` if it exists, so an oversized file does not ship. Take the failure column's action, and say so in one sentence. Never change the old icon file's bytes.

### Recipe

- 1024×1024, `.webp`, `medium` quality, `background: "opaque"`. An alpha icon breaks the full-bleed rule, and this section cannot measure an alpha WebP later.
- The art fills the square: no rounded corners, no border, no transparent margin, no text. Do not ask for an "app icon"; the model then draws rounded-rectangle chrome itself.
- A bold silhouette that reads at 48 px.
- Colors and subject come from the tile's own code and the conversation.
- **No reference images.** A workspace image may be something the creator uploaded, and the icon must not send it to the image provider.
