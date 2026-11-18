import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import { flatConfigs as importX } from "eslint-plugin-import-x";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const coreGlob = "packages/core/**/*.{ts,tsx}";

/**
 * ESLint flat config: typescript-eslint strict-type-checked plus an import-boundary
 * rule that forbids electron, DOM, and apps/* imports inside packages/core.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/coverage/**",
      "**/node_modules/**",
      "design/**",
      "pnpm-lock.yaml",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.mjs", "*.js", "eslint.config.js"],
          defaultProject: "tsconfig.eslint.json",
        },
        tsconfigRootDir: rootDir,
        noWarnOnMultipleProjects: true,
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["apps/desktop/src/renderer/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: [
      "apps/desktop/src/main/**/*.ts",
      "apps/desktop/src/preload/**/*.ts",
      "packages/**/*.{ts,mjs,js}",
      "scripts/**/*.{js,mjs}",
      "examples/**/*.ts",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    ...importX.recommended,
    settings: {
      "import-x/resolver-next": [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: [
            "tsconfig.base.json",
            "packages/*/tsconfig.json",
            "apps/desktop/tsconfig.node.json",
            "apps/desktop/tsconfig.web.json",
          ],
        }),
      ],
    },
  },
  {
    files: [coreGlob],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "electron",
              message: "packages/core must not import Electron (constitution IV).",
            },
          ],
          patterns: [
            {
              group: ["apps", "apps/*", "apps/**"],
              message: "packages/core must not import from apps/* (constitution IV).",
            },
            {
              group: ["react", "react-dom", "react/*", "react-dom/*"],
              message: "packages/core must not import DOM/React APIs (constitution IV).",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        {
          name: "window",
          message: "packages/core must not use DOM globals.",
        },
        {
          name: "document",
          message: "packages/core must not use DOM globals.",
        },
        {
          name: "navigator",
          message: "packages/core must not use DOM globals.",
        },
      ],
    },
  },
);
