/**
 * Entry point for the standalone web build (GitHub Pages). Unlike
 * `tile/src/entry.tsx` it runs without a Joiner host: state lives in
 * localStorage through `LocalStore`.
 */
import { createRoot } from "react-dom/client";
import "../../tile/styles.css";
import { LocalStore, type StorageLike } from "./local-store";
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
if (root) {
	createRoot(root).render(<WebApp local={new LocalStore(browserStorage())} />);
}
