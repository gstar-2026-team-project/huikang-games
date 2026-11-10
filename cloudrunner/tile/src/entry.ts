/**
 * Entry point — the only file that creates Poe and the store.
 */
import {
	applyNativeAppGestureOverrides,
	createPoe,
	createRenderBudget,
	isPoeTileForeground,
	PostMessageEnvironment,
	resumeAudioContext,
	subscribePoeTileForegroundState,
	suppressLongPressMagnifier,
} from "poe-tiles-sdk/v1/client.js";
import { tileClientConfig } from "../../client";
import { mountApp } from "../../ui/App";
import type { AppProps } from "../../ui/app-contract";

applyNativeAppGestureOverrides();

const environment = new PostMessageEnvironment();
const Poe = createPoe({ environment });
const store = Poe.setupStore(tileClientConfig);
const appProps = {
	store,
	poe: Poe,
	resumeAudioContext,
	suppressLongPressMagnifier,
	createRenderBudget,
	isPoeTileForeground,
	subscribePoeTileForegroundState,
} satisfies AppProps;

const root = document.getElementById("root");
if (root) mountApp(root, appProps);
