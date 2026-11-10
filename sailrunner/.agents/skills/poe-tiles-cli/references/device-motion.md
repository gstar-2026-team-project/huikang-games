# Device motion: tilt and shake as input

Use this reference before designing input for a tile that mentions tilt, steer, lean, balance, shake, motion, gyro, or accelerometer. It applies to a prototype and to an integrated tile alike; the SDK-specific part (the motion claim, persisting the choice) is in the client API reference's "Device motion" section and applies only once the tile is integrated.

Tiles read the web sensor events themselves: `deviceorientation` for tilt and `devicemotion` for shake or impulse. The host delegates the sensor permissions to every tile frame, so the events reach the tile in the Joiner apps and on mobile web; there is no platform API for the readings.

## Three non-negotiables

1. **Touch is the default and tilt is opt-in behind a tap.** Every motion tile ships two complete control schemes: touch (on-screen buttons, drag, or swipe) plus keyboard on desktop, and tilt. The game is finishable with either.
2. **Never motion-only.** Laptops have no sensors, some players are denied or decline, and some prefer buttons. A tile whose core loop needs tilt is untestable in the creator's own preview and unplayable for those players.
3. **Integrated tiles pair the claim with the subscription.** Call `Poe.motion.claim()` in the same code path that subscribes to motion events and release it where the tile unsubscribes (see the client API reference). A prototype cannot call it; skip it there.

## The recipe

Run this from the tap that turns tilt on (the same tap that starts a round also lifts the iOS 30 fps iframe clamp). Never branch on platform.

1. Guard the constructor first, then the method:
   `typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function"`.
   Where the method exists, call it inside `try/catch`: it rejects without a user gesture. Where it does not exist, subscribe directly.
2. Subscribe to both events. Judge `devicemotion` by silence: no sample within about a second of subscribing means no usable sensor. Never judge `deviceorientation` by silence: it fires on change, not on a clock, and Chromium suppresses events while the angles are steady. Holding still is not "no sensor".
3. Judge the readings the control needs in the first samples. Tilt needs finite `beta` and `gamma`; impulse needs finite `x`, `y`, and `z` on `accelerationIncludingGravity`. The object can be non-null while an individual axis is `null`, which the spec allows for absent sensors.
4. "No usable sensor" is any of: the constructor is missing, the request resolves `denied` or rejects, the first-sample timeout fires, or the readings are not finite. In every case switch to touch controls.
5. Say so once. When the player deliberately tapped "use tilt" and the outcome is `denied` or "no sensor", show one message at that moment ("Tilt isn't available here, using touch") before falling back. Silent degradation after an explicit action is a failure. A device that never offered motion needs no message, and the Touch scheme is already in place.

Use `deviceorientation` `beta`/`gamma` for tilt steering and `devicemotion.accelerationIncludingGravity` for shake or impulse. Rate is about 60 Hz; smooth with a low-pass filter. Do not `preventDefault` touch events on the play surface.

## Controls model

- A visible controls toggle in the tile ("Controls: Touch / Tilt"), default Touch. Choosing Tilt is the tap that runs the recipe; success switches the scheme, failure shows the one-time message and stays on Touch.
- The toggle stays reachable in play so a player can go back to Touch or retry Tilt later. iOS Safari remembers a denial for the tab (there is no per-site Motion setting to reset); the player gets asked again after closing the tab and reopening the page. Inside the Joiner app a retry simply works once the app grants the permission for its own pages.
- Calibration on entering Tilt: capture the current orientation as neutral ("hold the phone how you want to play, tap to start"), apply a dead zone and a low-pass filter, remap axes by `screen.orientation.type` in landscape, and recalibrate on orientation change.
- Persist the choice: in memory for a prototype; in a `privateOfUser` table once the tile is integrated, scoped to the instance and the player (reopening the same instance on any device restores it; a new instance starts on Touch). Browser storage is blocked in the sandbox.

## Where motion events arrive

Desktop preview and the multiplayer simulation have no sensors. The Android app, Android Chrome, and iOS Safari (behind Safari's per-site prompt) deliver events; the Joiner iOS app does once its release with the permission grant ships, and until then shows WebKit's own permission prompt once per app launch (a decline is "no usable sensor" to the recipe). A tile opened inside another tile receives motion on Android (app and Chrome) only; on iOS and desktop the nested frame has no sensor constructors, which the recipe handles as "no usable sensor".

## Prototypes

A prototype is a single `index.html` with no SDK, so everything above applies unchanged except the claim: during prototyping, tilt works, the toggle's choice lives in memory, and shake-to-report stays armed (only the creator plays a prototype). The integration step adds the `privateOfUser` row and the `Poe.motion.claim()` call alongside the store.
