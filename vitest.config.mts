import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // Playwright specs use `@playwright/test`'s own runner, not Vitest's.
    exclude: ["**/node_modules/**", "tests/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      // See test-stubs/server-only.ts — Next's webpack pipeline is what
      // normally makes the real package's client-import guard work; plain
      // Vitest needs this no-op stand-in to import server-side modules at all.
      "server-only": path.resolve(import.meta.dirname, "./test-stubs/server-only.ts"),
    },
  },
});
