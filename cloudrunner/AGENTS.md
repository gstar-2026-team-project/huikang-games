# Joiner tile — cloudrunner-k7q2

**Load the `tile-creator` skill before editing this tile**, following the host's skill-loading policy. It covers scaffold workflow, sandbox restrictions, schema/mutator patterns, and testing setup.

For synced-store work specifically, also load `synced-store`.

## Verification

- Test creator-authored behavior with mutator/unit tests and Happy DOM UI tests.
  Jest DOM matchers are configured in `tests/setup-dom.ts`. In Happy DOM tests,
  query the returned container; Testing Library's global `screen` can bind
  before the preloaded document exists. Add browser-only coverage when the
  behavior needs it. Before publishing a multiplayer tile, adapt and run
  a two-client browser test, including reconnect and persisted server state.
- Follow the `tile-creator` skill for `bun run verify` (including existing browser smoke
  checks) and ad-hoc browser tooling. `tests/multiplayer.ts` is the
  multiplayer browser recipe.
- The Creator host owns publication when its system prompt says so. Finish
  verification and report its results; do not invoke publication commands.

## Multiplayer golden path

The scaffold already contains the complete typed path; start by editing it
instead of searching the SDK or declaration files:

1. Define tile-owned state and mutators in `synced-store/schema.ts`.
2. Auto-seat members in `synced-store/hooks.ts` using `onAddUsers`. Keep the
   hook deterministic and wired into both client and backend configs.
3. Import `AppReadContext` from `client.ts` for reusable readers. It includes
   tile tables plus `$users`, `$userInfo`, `$permissions`, and `$$system`.
   In React, use `useLiveQuery` from `poe-tiles-sdk/v1/react`; in Solid, use
   `createLiveQueryResource` from `poe-tiles-sdk/v1/solid`; in Preact, subscribe
   from `useEffect` and return the unsubscribe function; in Vanilla JS and the
   Phaser DOM shell, pass the module-level `(ctx: AppReadContext) => ...` reader
   to `store.subscribe`. Keep Phaser itself behind the scaffold's dynamic import,
   feed it snapshots from the DOM shell, and mutate only on semantic input—not
   from the frame loop. The generated `ui/App.*` demonstrates each path.
   The reader's tile rows, profiles, and return value are inferred; do not add
   manual row types or inspect SDK declarations.
4. Keep production and Happy DOM UI wiring on the shared `ui/app-contract.ts`
   contract. Add platform capabilities to `AppProps` using SDK types such as
   `PoeAPI["haptics"]` or `typeof resumeAudioContext`, wire the real value in
   `tile/src/entry.*`, and update `createTestAppProps` in
   `tests/app-test-props.ts` with the test value. Do not duplicate handwritten
   callback signatures in the component or its tests.
5. Read participant names and avatars from `$userInfo`; never display raw user
   IDs as profile labels.
6. Test with `createPoeTileTestHarness`. Each `createClient({ userId })` creates
   `$users` and `$userInfo` rows and runs `onAddUsers`; the default profile name
   equals `userId`. Pass `userInfo: { displayName, profilePicture }` on the
   FIRST `createClient` for a user — a seeded profile is frozen after that, and
   a later differing value throws rather than silently diverging from the
   `$userInfo` row the store already committed. Always call `harness.dispose()`.

The generated mutator and Happy DOM tests are executable examples of this
flow. The default multiplayer starter also ships `synced-store/manager.test.ts`:
adapt it for typed manager-harness setup and turn/unread/Recents/push assertions.
A temporary `$userInfo` inspection test should never be necessary.
Keep those focused tests small while iterating. Follow the skill's visual
verification guidance for task-appropriate browser checks.

## Type-checking

Use `bun run type-check` so the project's configured compiler and options
apply. Keep `tests/` included in `tsconfig.json`: optional Playwright specs and
`tests/multiplayer.ts` still need type coverage even when they are not run.
Do not exclude those sources to make a check pass.
