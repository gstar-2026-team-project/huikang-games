---
name: audio-generation
description: Generate and integrate music, atmospheric soundtracks, background audio, and every sound effect for a tile with the generate_music and generate_sound_effect tools in Creator. Use whenever a tile plays any sound effect or audio cue (taps, clicks, pickups, hits, scores, failures, wins, UI feedback, ambient beds), and when the creator asks for music. Generate sound effects instead of synthesizing them with Web Audio oscillators or other browser audio APIs. Covers saved assets, user-initiated playback, mute controls, looping, low-latency effect playback, and reuse on later edits.
user-invocable: false
---

# Music and sound effects for a tile

Music needs the `generate_music` tool and sound effects need the `generate_sound_effect` tool. If the one you need is unavailable, explain that this kind of generation is unavailable in this session; for effects, synthesize the cue with Web Audio instead. Never ask for provider keys, install a provider SDK, or call a provider directly. Generation happens during creation; players only play the saved asset.

## Generate once

1. Find the tile directory and inspect its existing audio assets and playback code. Reuse a suitable saved track on subsequent edits. Regenerate only when requested, the asset is missing or broken, or the requested soundtrack has materially changed.
2. Describe mood, instruments, tempo, and intended use. Prefer a short 15–30 second instrumental for background music. For a loop, request a steady arrangement with a matching beginning and end; generation does not guarantee a seamless join.
3. Call `generate_music` once, in sequence:

```json
{
  "prompt": "Short atmospheric game soundtrack: warm ambient pads, sparse soft piano, calm exploration, steady texture with a matching beginning and end for looping, no vocals",
  "duration": 20,
  "instrumental": true,
  "outputPath": "my-game/assets/soundtrack.mp3"
}
```

`outputPath` is relative to the workspace, including the tile directory. For a root tile use `assets/soundtrack.mp3`; for a conversion candidate use its staging directory. The tool replaces that file, so use a new filename when preserving an existing soundtrack as a fallback. It accepts 3–120 whole seconds, a prompt of at most 2,000 characters, and MP3 output. `instrumental` defaults to true; false permits vocals.

Every call costs money and counts toward both the creator's daily model request quota and the separate limit of 100 music and sound effect requests per UTC day. Do not regenerate just to improve a small detail. After a failure, follow the tool's guidance and tell the creator. A timeout or cancellation may already have been billed: never automatically retry. Keep existing audio when generation fails.

## Sound effects

Generate every sound effect the tile plays with `generate_sound_effect`, including simple taps, clicks, blips, and UI feedback, as well as coins, doors, footsteps, glass, explosions, animals, and ambient beds such as rain. Do not synthesize cues with oscillators, noise buffers, or other browser audio APIs: generated cues sound finished, and synthesized cues sound like placeholders. Synthesize a cue with Web Audio only when the tool is unavailable, fails, or the daily limit is reached, and tell the creator.

1. Inspect existing `assets/sfx-*.mp3` files first and reuse them on subsequent edits. Regenerate only when requested, the asset is missing or broken, or the cue has materially changed.
2. Make one call per distinct cue, in sequence. Generate only the cues the game plays; most games need 3–8. Name each file for its cue, such as `assets/sfx-coin.mp3` or `assets/sfx-crash.mp3`. Distinct outcomes need distinct sounds; do not reuse one file at another pitch for a score and a failure.
3. Describe one sound: its source, material, texture, and character. Keep one-shot cues short, 0.5–2 seconds; omit `durationSeconds` to let the model choose. Set `loop` only for an ambient bed.

```json
{
  "prompt": "Short bright retro arcade coin pickup chime, clean, no reverb tail",
  "durationSeconds": 1,
  "outputPath": "my-game/assets/sfx-coin.mp3"
}
```

It accepts a prompt of at most 1,000 characters, 0.5–30 seconds, and MP3 output. The same cost, quota, and no-retry rules as music apply.

Treat shipped audio as public. Keep private details and credentials out of prompts, filenames and assets.

## Load the saved asset

Tiles run in a sandboxed frame from a `blob:` URL; a bare relative media URL does not load there. The platform's CSP blocks `data:` audio sources and `fetch(dataUrl)`. Decode bundled bytes locally and play a Blob URL.

**Prototype:** use Bash to write a data-only script beside each saved file, so the audio bytes never pass through model context. Give each file its own global, such as `SOUNDTRACK_URL` or `SFX_COIN_URL`:

```bash
cd <tileDir> && {
  printf 'globalThis.SOUNDTRACK_URL = "data:audio/mpeg;base64,'
  base64 < assets/soundtrack.mp3 | tr -d '\n'
  printf '";\n'
} > assets/soundtrack.js
```

Load `<script src="assets/soundtrack.js"></script>` before the main module. The host inlines this data-only script, like generated image data. Pass `globalThis.SOUNDTRACK_URL` to `createMusicUrl` below, or a sound effect's global to `loadEffect`. Keep the original MP3 for future edits and conversion.

**Integrated Vite tile:** import the file with `?url` from the importing module's location, and ensure `build.assetsInlineLimit` includes the file (10 MiB covers music's 4 MiB cap and a sound effect's 1 MiB cap). The scaffold's tsconfig lists `vite/client` in `compilerOptions.types`, which types the import; if a tile's tsconfig lacks it, add it there instead of suppressing the error. Pass the imported data URL to `createMusicUrl` below. Preserve the MP3 when converting a prototype; replace the prototype's data script with the Vite import.

For either recipe, create the URL once per mounted player, then use it as the audio source:

```js
function createMusicUrl(dataUrl) {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }));
}
```

Keep this URL for the player's lifetime. On disposal, pause the player, remove its `src`, call `load()` to release the media, and call `URL.revokeObjectURL(musicUrl)`. Never revoke it while playback or looping still needs it.

Play sound effects through Web Audio rather than an audio element, so cues start at once and can overlap. Decode each file once into an `AudioBuffer` on one shared `AudioContext`. Create or resume that context from a real user gesture, and resume it again before scheduling on a reused context: WebKit parks a context in the non-standard `"interrupted"` state after an alarm or call, so checking only for `"suspended"` leaves the tile silent.

**Prototype:** a prototype has no SDK import, so use this local helper:

```js
function resumeContext(context) {
  if (context.state !== "suspended" && context.state !== "interrupted") return;
  context.resume().catch(() => {});
}
```

**Integrated tile:** call `resumeAudioContext(context)` from `poe-tiles-sdk/v1/client.js` instead.

For either recipe, decode and play effects with these helpers:

```js
async function loadEffect(context, dataUrl) {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  return context.decodeAudioData(bytes.buffer);
}

function playEffect(context, buffer, output, { loop = false } = {}) {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = loop;
  source.playbackRate.value = loop ? 1 : 0.95 + Math.random() * 0.1;
  source.connect(output);
  source.start();
  return source;
}
```

Route every effect through one gain node that the mute toggle controls. Vary the playback rate slightly on repeats, as above, so a run does not sound mechanical.

## Playback

- Create one music player per mounted tile. Start it only from a user action such as Play or Enable music. Call `audio.play()` in that event handler, catch rejection, and leave a visible retry control. Never autoplay on mount or after an async generation completes.
- Provide a visible, keyboard-accessible mute toggle with a clear current state. It silences music and effects together. Keep that preference local to the player, preserve it across game restarts, and never unmute as a side effect of an edit or game state update.
- Use a restrained background volume. Loop only background tracks and ambient beds; play stingers, victory cues, and one-shot effects once. Avoid stacking players when a game restarts.
- Pause on exit or when hidden; dispose the player and event listeners on unmount. Resume only if the player previously opted in and remains unmuted; handle browser playback rejection.
