import path from "node:path";

import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "..", "..");

const nextConfig: NextConfig = {
  // 内网沙箱 4.9GB 无 swap、与其它 agent 共用，`next dev`/`next build` 都会被 OOM 杀（2026-09-10 OS 实测）。
  // 产物改由 GitHub CI 构建（.github/workflows/build-web.yml）推到分支 deploy/web-standalone，沙箱只跑 `node server.js`。
  output: "standalone",

  // F8-17：仓库根和 apps/web 各有一份 package-lock.json，Next 会"推断"工作区根并据此决定
  // standalone 的目录层级。推断结果不同，产物路径就在 `.next/standalone/apps/web/server.js` 和
  // `.next/standalone/server.js` 之间跳——CI 和部署脚本是写死路径的，跳一次就起不来。
  // 这里钉死成仓库根，让层级恒为 `.next/standalone/apps/web/`，顺带消掉构建期那条 workspace root 警告。
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
};

export default nextConfig;
