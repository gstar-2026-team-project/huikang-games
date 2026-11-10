/**
 * Entry point for the standalone web build (GitHub Pages). Unlike
 * `tile/src/entry.ts` it runs without a Joiner host: state lives in
 * localStorage through `LocalStore`, and the browser tab's visibility stands
 * in for the host's foreground state.
 */
import { type PoeAPI, resumeAudioContext, suppressLongPressMagnifier } from "poe-tiles-sdk/v1/client.js";
import "../../tile/styles.css";
import { mountApp } from "../../ui/App";
import type { AppProps } from "../../ui/app-contract";
import { LocalStore, type StorageLike } from "./local-store";

function browserStorage(): StorageLike | null {
	try {
		return window.localStorage;
	} catch {
		// Storage access can throw when site data is blocked.
		return null;
	}
}

const noop = () => undefined;
const isForeground = () => document.visibilityState === "visible";

// Only the host capabilities the UI calls; there is no Joiner host here.
const poe = {
	haptics: { impact: noop, notification: noop, selection: noop },
	room: {
		// The in-game end panel already shows the result and "Fly again".
		tileEnd: async () => ({ outcome: "dismissed", playAgain: false }),
		openInvitePicker: async () => undefined,
	},
	users: { openProfile: async () => undefined },
} as unknown as PoeAPI;

const appProps: AppProps = {
	store: new LocalStore(browserStorage()).client(),
	poe,
	resumeAudioContext,
	suppressLongPressMagnifier,
	createRenderBudget: null,
	isPoeTileForeground: isForeground,
	subscribePoeTileForegroundState: (listener) => {
		const onChange = () => {
			const visible = isForeground();
			listener(visible, { reason: visible ? "visible" : "backgrounded" });
		};
		document.addEventListener("visibilitychange", onChange);
		return () => document.removeEventListener("visibilitychange", onChange);
	},
};

const root = document.getElementById("root");
if (root) mountApp(root, appProps);
