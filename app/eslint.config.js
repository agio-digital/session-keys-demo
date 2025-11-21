import vue from "eslint-plugin-vue";
import typescriptParser from "@typescript-eslint/parser";
import typescriptPlugin from "@typescript-eslint/eslint-plugin";
import vueParser from "vue-eslint-parser";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "*.config.*"],
  },
  {
    files: ["src/**/*.{js,mjs,cjs,ts,vue}"],
    plugins: {
      vue,
      "@typescript-eslint": typescriptPlugin,
    },
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: typescriptParser,
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: {
      ...prettierConfig.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "vue/multi-word-component-names": "off",
    },
  },
];
