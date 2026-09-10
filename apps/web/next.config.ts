import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 内网沙箱 4.9GB 无 swap、与其它 agent 共用，`next dev`/`next build` 都会被 OOM 杀（2026-09-10 OS 实测）。
  // 产物改由 GitHub CI 构建（.github/workflows/build-web.yml）推到分支 deploy/web-standalone，沙箱只跑 `node server.js`。
  output: "standalone",
};

export default nextConfig;
