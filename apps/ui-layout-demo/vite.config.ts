import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  server: {
    // fe 工作树的 node_modules 是指向主目录的软链，放行其真实路径（字体 woff2 在里面）
    fs: { allow: [__dirname, "/Users/aik/Desktop/投放agent/apps/ui-layout-demo/node_modules"] },
  },
  build: {
    rollupOptions: {
      input: {
        sidebar: resolve(__dirname, "sidebar.html"),
        topbar: resolve(__dirname, "topbar.html"),
        topbarCoss: resolve(__dirname, "topbar-coss.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
