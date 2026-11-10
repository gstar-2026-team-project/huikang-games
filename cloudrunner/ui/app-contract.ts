import type {
	createRenderBudget,
	isPoeTileForeground,
	PoeAPI,
	resumeAudioContext,
	subscribePoeTileForegroundState,
	suppressLongPressMagnifier,
} from "poe-tiles-sdk/v1/client.js";
import type { AppStoreClient } from "../client";

/**
 * Runtime dependencies supplied by the entry point. Keep this shared with the
 * test-props helper when the app needs another platform capability.
 */
export interface AppProps {
	store: AppStoreClient;
	poe: PoeAPI;
	resumeAudioContext: typeof resumeAudioContext;
	suppressLongPressMagnifier: typeof suppressLongPressMagnifier;
	createRenderBudget: typeof createRenderBudget | null;
	isPoeTileForeground: typeof isPoeTileForeground;
	subscribePoeTileForegroundState: typeof subscribePoeTileForegroundState;
}
