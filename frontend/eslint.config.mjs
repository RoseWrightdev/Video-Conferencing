import { dirname } from "path";
import { fileURLToPath } from "url";
import storybook from "eslint-plugin-storybook";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [
  {
    ignores: [
      ".next/**", 
      "node_modules/**", 
      "coverage/**",
      ".storybook/**",
      "**/*.stories.tsx",
      "**/*.stories.ts",
      "**/*.stories.js",
      "**/*.stories.jsx"
    ]
  },
  ...storybook.configs["flat/recommended"],
  {
    rules: {}
  }
];

export default eslintConfig;
