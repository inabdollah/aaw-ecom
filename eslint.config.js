const next = require("@next/eslint-plugin-next");
const ts = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    ignores: ["node_modules/", ".next/"], // Ignore unnecessary files
  },
  next.configs.recommended, // Use Next.js recommended rules
  {
    languageOptions: {
      parser: tsParser,
    },
    rules: {
      "@typescript-eslint/ban-ts-comment": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "prefer-const": "off",
    },
  },
];
