import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier/flat";
import { defineConfig } from "eslint/config";

export default defineConfig(
  { ignores: ["node_modules/**", "eslint.config.mjs"] },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: { allowDefaultProject: ["scripts/*.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // node:test registers tests at the top level and the runner awaits them.
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  prettier,
);
