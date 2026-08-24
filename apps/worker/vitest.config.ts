import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts", "gateway/**/*.mjs"],
      exclude: ["src/index.ts", "src/data-api.ts", "src/**/types.ts"],
      thresholds: { statements: 80, lines: 80 },
    },
  },
});
