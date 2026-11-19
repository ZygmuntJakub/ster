import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";

/**
 * Copy SQLite migration SQL next to the bundled main entry (import.meta.url resolves there).
 */
function copyCoreMigrations(): Plugin {
  return {
    name: "copy-core-migrations",
    closeBundle() {
      const source = resolve(__dirname, "../../packages/core/src/store/migrations");
      const target = resolve(__dirname, "out/main/migrations");
      mkdirSync(target, { recursive: true });
      cpSync(source, target, { recursive: true });
    },
  };
}

export default defineConfig({
  main: {
    plugins: [copyCoreMigrations()],
    build: {
      // Bundle workspace TypeScript (`@ster/core` exports .ts); keep Electron/native deps external.
      externalizeDeps: {
        exclude: ["@ster/core"],
      },
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      // Sandboxed preload must be CommonJS; ESM `.mjs` fails to load under Electron sandbox.
      externalizeDeps: true,
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
