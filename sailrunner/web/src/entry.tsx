/**
 * Entry point for the standalone web build (GitHub Pages). Unlike
 * `tile/src/entry.tsx` it runs without a Joiner host: state lives in
 * localStorage through `LocalStore`.
 */
import { createRoot } from "react-dom/client";
import "../../tile/styles.css";
import { LocalStore, type StorageLike } from "./local-store";
import { mountSizedFrame } from "./screen-size";
import { WebApp } from "./WebApp";

function browserStorage(): StorageLike | null {
	try {
		return window.localStorage;
	} catch {
		// Storage access can throw when site data is blocked.
		return null;
	}
}

const root = document.getElementById("root");
// `?display=mobile` or `?display=768x768` runs the game in a frame of that size instead.
if (root && !mountSizedFrame("Sailrunner")) {
	createRoot(root).render(<WebApp local={new LocalStore(browserStorage())} />);
}
