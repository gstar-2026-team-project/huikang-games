/**
 * Entry point — the only file that imports poe-tiles-sdk.
 */
import {
	applyNativeAppGestureOverrides,
	createPoe,
	createVerticalScrollBounceMount,
	PostMessageEnvironment,
	resumeAudioContext,
	suppressLongPressMagnifier,
} from "poe-tiles-sdk/v1/client.js";
import { createRoot } from "react-dom/client";
import { tileClientConfig } from "../../client";
import { App } from "../../ui/App";
import type { AppProps } from "../../ui/app-contract";

// Suppress native WebView text selection, callouts, and link dragging so
// touch interactions behave like an app, not a web page.
applyNativeAppGestureOverrides();

const environment = new PostMessageEnvironment();
const Poe = createPoe({ environment });
const store = Poe.setupStore(tileClientConfig);
const appProps = {
	store,
	poe: Poe,
	resumeAudioContext,
	suppressLongPressMagnifier,
} satisfies AppProps;

const root = document.getElementById("root");
if (root) {
	const appRoot = createVerticalScrollBounceMount(root);
	createRoot(appRoot).render(<App {...appProps} />);
}
