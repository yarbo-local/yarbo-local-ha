import { defineConfig } from "vite";
import manifest from "../custom_components/yarbo_local/manifest.json" with { type: "json" };

const OUT = "../custom_components/yarbo_local/www";

// Two files, built straight into the integration, which serves them:
//   yarbo-local.js          loaded by Home Assistant on every page; names and a loader only
//   yarbo-local-view-*.js   Lit, the icons and the drawing code; fetched on first use
export default defineConfig({
  define: { __VERSION__: JSON.stringify(manifest.version) },
  build: {
    lib: {
      entry: "src/entry.ts",
      formats: ["es"],
      fileName: () => "yarbo-local.js",
    },
    rollupOptions: {
      output: { chunkFileNames: "yarbo-local-view-[hash].js" },
    },
    outDir: OUT,
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
  },
});
