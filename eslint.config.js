import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import js from "@eslint/js";
import ts from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/dist/"]),
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    rules: {
      eqeqeq: 2,
      "@typescript-eslint/explicit-function-return-type": 2,
      "@typescript-eslint/no-import-type-side-effects": 2,
    },
  },
]);
