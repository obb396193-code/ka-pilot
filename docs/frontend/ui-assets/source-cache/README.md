# 高频 UI 源码缓存

这里保存已经从官方公开 endpoint 实际下载、并由 SHA-256 验证的 starter source。它不是运行时组件目录，也不会被 `apps/web` 自动 import。

## 状态词

- `catalogued`：只在 5,936 项目录中有元数据；不代表源码在本地。
- `cached`：官方 payload/源码文件已落在本目录，且 `manifest.json` 有精确 hash。
- `installed/adapted`：只有源码进入运行仓并完成项目适配后才能使用；当前本目录不产生该状态。

## 规则

1. 只缓存 catalog 中 `access_status=public-source` 的资产。
2. 401、403、会员、License Key 资产不得通过其他站点补源码。
3. Registry JSON 按响应原文保存，因为其中的 `files[].content` 才是真正源码。
4. GitHub tree/blob 保存官方 raw 文件，并逐文件记录 hash。
5. coss、ReUI 等同源 dependency 只在显式命名空间下递归；普通 npm/shadcn dependency 不冒充同源资产。
6. 缓存不等于拍板。接入运行仓前仍需真实业务页对比、许可证复核和老板选择。

## 命令

```bash
node apps/web/scripts/ui-catalog/cache-starter-sources.mjs --write
node apps/web/scripts/ui-catalog/cache-starter-sources.mjs --check
```

`--write` 会联网刷新所选 starter roots；`--check` 只读本地 manifest 和文件，任何缺失或 hash 漂移都会失败。
