import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";

// Standalone web build for GitHub Pages: no Joiner host, so no `poeTile`
// plugin. Relative asset URLs let it be served from any sub-path.
export default defineConfig({
	root: "web",
	base: "./",
	build: {
		outDir: "../dist-web",
		emptyOutDir: true,
	},
	plugins: [react() as PluginOption],
});
