import type { PoeTileTestClient } from "poe-tiles-sdk/v1/test-utils.js";
import type { AppSchema } from "../synced-store/schema";
import type { AppProps } from "../ui/app-contract";

/** Build the same typed App props as the production entry, with safe DOM-test stubs. */
export function createTestAppProps(
	client: PoeTileTestClient<AppSchema>,
): AppProps {
	return {
		store: client.store,
		poe: client.Poe,
		resumeAudioContext: () => undefined,
		suppressLongPressMagnifier: () => () => undefined,
		createRenderBudget: null,
		isPoeTileForeground: () => true,
		subscribePoeTileForegroundState: () => () => undefined,
	};
}
