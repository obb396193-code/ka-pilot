import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // 第三方官方源码（Dice UI，来源隔离目录 components/dice/）：按上游原样保留，不为本仓 lint 风格改动它
    files: ["components/dice/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-empty-object-type": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    // 第三方官方源码（Vercel AI Elements，来源隔离目录 components/ai-elements/）：按上游原样保留
    files: ["components/ai-elements/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    // 第三方官方源码（React Bits WebGL 背景件，来源隔离目录 components/reactbits/）：按上游原样保留
    files: ["components/reactbits/**/*.{ts,tsx}"],
    rules: {
      "prefer-const": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
    },
  },
];

export default eslintConfig;
