import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "node_modules/",
    "dist/",
    "public/",
    ".sited/",
    ".wrangler/",
    "worker-configuration.d.ts",
  ]),
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
    rules: {
      // Existing test fixtures deliberately construct malformed payloads.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["client/**/*.{ts,tsx}", "server/**/*.ts", "shared/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    files: [
      "client/**/*",
      "tests/browser/**/*",
      "scripts/*smoke.mjs",
      "scripts/spell-ux.mjs",
      "scripts/ui-sweep.mjs",
    ],
    languageOptions: { globals: globals.browser },
  },
);
