# Two-player browser checks

For a two-player browser check, use the scaffold's `tests/multiplayer.ts` helpers with `TestServer` from `poe-tiles-sdk/v1/test-utils/playwright.js`. For the `inspect_tile` tool's `script` mode, put the module in `.inspect-scripts/`, which is kept with the tile but never published (not in `.visual-checks/`, which is temporary); its default export receives the ready players with raw Playwright pages. The scaffold's `tests/e2e.test.playwright.ts` shows how to create and start the `TestServer` and get the `server` and `browser` the helper below takes.

## Multiplayer quick path

New scaffolds ship `tests/multiplayer.ts`. Use it instead of rebuilding browser
contexts, membership setup, profile fixtures, and common assertions:

```typescript
import {
  expectDisabledAndUnchanged,
  expectTileState,
  openTwoUserTile,
} from "./multiplayer";

const sessions = await openTwoUserTile({
  server,
  browser,
  tileTypeId: "my-turn-tile",
  instanceId: "match-1",
  readySelector: '[data-testid="match-status"]',
  contextOptions: { viewport: { width: 390, height: 760 }, colorScheme: "dark" },
});

try {
  await expectTileState({
    frame: sessions.alice.frame,
    selector: '[data-testid="match-status"]',
    state: "alice-turn",
  });

  await expectDisabledAndUnchanged({
    locator: sessions.bob.frame.locator('[data-cell-index="0"]'),
    attribute: "data-mark",
    value: "empty",
  });
} finally {
  await sessions.close();
}
```

The helper performs the required sequence:

1. Admit both users with `addUserToInstance`, including profile data so
   `$userInfo` contains names and avatars and `onAddUsersV2` fires.
2. Open independent browser contexts on that instance, then wait for readiness.
   A readiness condition may require both members; do not wait for it before
   admitting the second player.

Using the same `instanceId` is necessary but not sufficient: a second user must
also be admitted. Do not click a disabled control to prove rejection;
Playwright waits for it to become actionable and will time out. Assert that it
is disabled and that its state attribute remains unchanged.

