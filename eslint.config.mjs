import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["node_modules/", "dist/", "public/", ".sited/", "storage/"]),
  {
    files: ["**/*.{js,mjs,ts,tsx}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [tseslint.configs.recommended],
    rules: {
      // Persisted room views and card statuses still have dynamic fields.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
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
