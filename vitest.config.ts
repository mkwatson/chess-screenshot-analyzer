import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    // Default to node env. Tests that need DOM must opt in with a file-level
    // pragma: `// @vitest-environment jsdom` as the first line.
    // (Vitest 4 removed `environmentMatchGlobs`; the pragma is the supported
    // replacement for per-file env selection without using `projects`.)
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    pool: "forks",
  },
});
