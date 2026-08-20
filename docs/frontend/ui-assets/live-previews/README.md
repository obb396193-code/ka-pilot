# 官方组件离线实时预览

这里不是截图，也不是重新手写一套相似组件。构建器从 `source-cache/` 中读取已校验的官方源码 payload，配上只负责提供示例数据和布局的项目 harness，预编译为离线 IIFE bundle。

- 17 个产品线位置统一进入比较墙：16 个来源各有独立实时 frame，共 27 个代表官方资产；React Bits Pro 是唯一付费锁定位置，不生成本地源码、bundle 或 frame。
- frame 由主展厅用 `sandbox="allow-scripts"` 加载，不开放 same-origin。
- bundle、frame、CSS 全部登记 SHA-256；frame 内联对应 CSS/JS，确保直接 `file://` 双击也能运行；无 CDN、无 fetch、无远程字体。
- 这里只是可视选型，不代表组件已经装进 `apps/web` 运行时。

本地重建需准备临时 build-only 依赖（不写入产品 `package.json`）。构建器会为每个来源建立独立临时根目录，避免 coss current/Origin、Tremor current/legacy 等同名路径互相覆盖：

```bash
npm install --prefix /private/tmp/ka-ui-live-preview-build \
  esbuild motion use-stick-to-bottom react-dropzone color \
  @base-ui/react @daypicker/react react-day-picker date-fns \
  @tanstack/react-virtual
PREVIEW_BUILD_NODE_MODULES=/private/tmp/ka-ui-live-preview-build/node_modules \
  node apps/web/scripts/ui-catalog/build-live-previews.mjs --write
node apps/web/scripts/ui-catalog/build-live-previews.mjs --check
```

权威状态在 `manifest.json`：`render_status=live` 才表示本地真实运行；`blocked-paid` 只展示官方入口和许可证边界。预览 bundle 只用于可视选型，产品接入必须回到 `source-cache/manifest.json` 指向的官方 payload/raw source，按来源隔离复制和适配。
