import { defineConfig } from "vitest/config";

const isWindows = process.platform === "win32";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Mock-agent integration suites routinely exceed Vitest's 5s default under
    // Windows CI load; keep a generous floor everywhere rather than per-test patches.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // SQLite + many parallel createCore boots races on Windows ("database is not open").
    ...(isWindows
      ? {
          fileParallelism: false,
          maxWorkers: 1,
          minWorkers: 1,
        }
      : {}),
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      thresholds: {
        lines: 80,
      },
      reporter: ["text", "html"],
    },
  },
});
