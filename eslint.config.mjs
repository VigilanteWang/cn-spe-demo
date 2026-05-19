import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

const reactRecommendedConfig = pluginReact.configs.flat.recommended;
const codeFilePatterns = ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"];
const typeScriptFilePatterns = ["**/*.{ts,mts,cts,tsx}"];

export default defineConfig([
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "server/dist/**",
      "coverage/**",
      ".vscode/**",
      "**/tsconfig*.json",
      "package-lock.json",
    ],
  },
  {
    files: codeFilePatterns,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
  },
  {
    ...js.configs.recommended,
    files: codeFilePatterns,
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: typeScriptFilePatterns,
  })),
  {
    files: typeScriptFilePatterns,
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["src/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: [
      "server/**/*.{js,mjs,cjs,ts,mts,cts}",
      "*.config.{js,mjs,cjs}",
      "eslint.config.mjs",
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: [
      "**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
      "src/test/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}",
    ],
    languageOptions: {
      globals: globals.vitest,
    },
  },
  {
    ...reactRecommendedConfig,
    files: ["src/**/*.{jsx,tsx}"],
    languageOptions: {
      ...reactRecommendedConfig.languageOptions,
      parserOptions: {
        ...reactRecommendedConfig.languageOptions?.parserOptions,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      ...reactRecommendedConfig.rules,
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
    },
  },
  {
    files: ["**/*.json"],
    plugins: { json },
    language: "json/json",
    extends: ["json/recommended"],
  },
  {
    plugins: { prettier },
    rules: {
      "prettier/prettier": "error",
    },
  },
  prettierConfig,
]);
