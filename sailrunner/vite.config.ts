import react from "@vitejs/plugin-react";
import { poeTile } from "poe-tiles-sdk/vite";
import { defineConfig, type PluginOption } from "vite";

export default defineConfig({
	root: "tile",
	build: {
		outDir: "../dist",
		emptyOutDir: true,
		rollupOptions: {
			output: {
				entryFileNames: "tile-frontend.js",
				assetFileNames: "[name][extname]",
			},
		},
	},
	plugins: [
		react() as PluginOption,
		poeTile({ backendEntryPoint: "src/backend.ts" }),
	],
});
