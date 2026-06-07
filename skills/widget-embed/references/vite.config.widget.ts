import path from "node:path";
import { defineConfig } from "vite";

// Standalone build for the embeddable widget → public/widget.js
// (served by the Worker's static assets at /widget.js).
// Place at repo root as: vite.config.widget.ts
export default defineConfig({
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
    // Host pages may lack <meta charset>; scripts inherit the document
    // encoding, so non-ASCII must ship as \u escapes or it mojibakes.
    charset: "ascii",
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "app"),
    },
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, "widget/index.tsx"),
      formats: ["iife"],
      name: "MudhalWidget",
      fileName: () => "widget.js",
    },
    outDir: "public",
    emptyOutDir: false,
    minify: true,
  },
});
