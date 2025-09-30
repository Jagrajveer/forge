// eslint.config.js
// ESLint v9 flat config for Node + TypeScript
// Migration: https://eslint.org/docs/latest/use/migrate-to-9.0.0
// Typed linting: https://typescript-eslint.io/getting-started/typed-linting/
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  // Global ignores (must be its own item)
  { ignores: ["dist/**", "node_modules/**", "vitest.config.ts"] },

  // JavaScript files
  { ...js.configs.recommended, files: ["**/*.{js,cjs,mjs}"] },

  // TypeScript (typed)
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // Modern, faster typed linting without explicit project globs
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // Start from the recommended type-checked rules
      ...tseslint.configs.recommendedTypeChecked.rules,

      // ——— Soften edges for CLI/provider boundaries ———
      // We handle lots of untyped JSON and external data:
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-explicit-any": "off",

      // Async ergonomics in CLI handlers:
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-floating-promises": "off",

      // Style prefs that were firing widely:
      "@typescript-eslint/prefer-nullish-coalescing": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/dot-notation": "off",
      "@typescript-eslint/prefer-regexp-exec": "off",
    },
  },

  // Declaration files & vendor-like shims: fully relaxed
  {
    files: ["**/*.d.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/array-type": "off",
    },
  },
];
