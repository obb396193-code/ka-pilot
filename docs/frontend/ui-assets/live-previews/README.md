# 官方组件离线实时预览

这里不是截图，也不是重新手写一套相似组件。构建器从 `source-cache/` 中读取已校验的官方源码 payload，配上只负责提供示例数据和布局的项目 harness，预编译为离线 IIFE bundle。

- 每个来源一个独立 frame；当前五个新来源、10 个代表官方资产。
- frame 由主展厅用 `sandbox="allow-scripts"` 加载，不开放 same-origin。
- bundle、frame、CSS 全部登记 SHA-256；无 CDN、无 fetch、无远程字体。
- 这里只是可视选型，不代表组件已经装进 `apps/web` 运行时。

本地重建需准备临时 build-only 依赖（不写入产品 `package.json`）：

```bash
npm install --prefix /private/tmp/ka-ui-live-preview-build \
  esbuild motion use-stick-to-bottom react-dropzone color
PREVIEW_BUILD_NODE_MODULES=/private/tmp/ka-ui-live-preview-build/node_modules \
  node apps/web/scripts/ui-catalog/build-live-previews.mjs --write
node apps/web/scripts/ui-catalog/build-live-previews.mjs --check
```
