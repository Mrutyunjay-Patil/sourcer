import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    pool: "threads",
    testTimeout: 30_000,
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "convex/**/*.test.ts"],
    server: { deps: { inline: ["convex-test"] } },
    coverage: { provider: "v8", include: ["src/**", "convex/**"], exclude: ["convex/_generated/**", "src/test/**"] },
  },
});
