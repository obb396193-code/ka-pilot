import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "gateway/**/*.mjs"],
      exclude: ["src/index.ts", "src/**/types.ts"],
      thresholds: { statements: 80, lines: 80 },
    },
  },
});
