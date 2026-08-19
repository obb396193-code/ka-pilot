# UI 资产存储格式与状态契约

> 最后核验：2026-08-19

## 一句话结论

`catalogs/*.json` 存的是**可检索目录元数据**，不是几千份组件源码。源码是否真的落地，以 `source_cache_status`、`local_path` 和 `source-download-manifest.json` 为准。

## 四层文件

| 层 | 文件 | 格式 | 保存什么 | 不代表什么 |
|---|---|---|---|---|
| 官方目录快照 | `catalogs/<source>.json`、`catalogs/index.json` | JSON schema v2 | 名称、类型、分类、预览、item URL、安装/获取方式、底层、依赖、许可证、访问层级、上游 ref | 不代表源码已下载 |
| 跨库能力索引 | `capabilities.json` | JSON | 同一日期选择、表格、筛选、动效等能力的多来源候选 | 不代表已选首选项 |
| 访问与完整性审计 | `coverage-audit.json/.md` | JSON + Markdown | 官方覆盖口径、Free/Pro/Ultimate、会员/401、动态未知和不能混算的 variant | 不代表能绕过付费或登录 |
| 运行时源码账 | `source-download-manifest.json`、`source-download-status.md` | JSON + Markdown | 本地源码路径、SHA-256、引用数、provenance 可信度、第三方隔离目录 | 不把手写/来历不明文件认作官方源码 |

规范、许可证和人工决策使用 Markdown；官网风格证据使用 PNG。`.firecrawl/`、`.playwright-cli/` 和 `/private/tmp` 抓取物只是当次核验工作底稿，不是长期事实源。

## Item 关键字段

### 发现状态

- `local_status=catalogued`：已进入目录，尚未批准使用。
- `approved`：可进入当前项目候选。
- `preferred`：已完成同场景对比并由老板拍板；必须有 comparison/decision 记录。
- `vendored`：官方源码已复制到本仓且未做实质修改。
- `adapted`：官方源码已复制并完成项目适配。
- `deprecated`：本地不再推荐或上游已废弃。

### 官方访问状态

- `public-source`：无需付费许可即可访问官方 item/source。
- `public-metadata-only`：名称或配置公开，但该记录没有源码文件。
- `paid-source-after-license`：名称/预览公开，取得合法账号、订阅或 license key 后可下载源码。
- `paid-metadata-only`：只确认到付费元数据，未确认稳定源码获取契约。
- `inaccessible-unknown`：官方未给稳定索引或当前无法确认。

`access_tier` 保存 `free/starter/pro/ultimate/paid`，`auth_requirement` 保存 `none/account/license-key/subscription/unknown`。不得把付费条目改标 MIT，也不得用爬虫规避 401。

### 源码缓存状态

- `not-cached`：只有目录元数据；当前 5,936 条全部属于此状态。
- `source-cached`：精确官方 payload 已缓存，必须同时登记 hash/path。
- `vendored`：源码已进入运行仓，且能追到官方 ref/hash。
- `adapted`：已进入运行仓并有修改记录。
- `unknown`：历史文件存在但 provenance 无法判断。

`local_path` 为空时，不得标 `vendored/adapted`。当前 22 个 `apps/web/components/ui/*.tsx` 是运行时本地源码，但缺精确安装 manifest，所以单列在运行时账中标为 inferred，不反向伪造目录下载状态。

### 维护与重复关系

- `maintenance_status=current`：当前产品线。
- `maintenance-stale`：仍在线、无官方 deprecated 声明，但更新明显停滞，如旧 `@tremor/react` 与 coss Origin。
- `deprecated`：有明确废弃证据。
- `related_or_duplicate_of`：记录同源变体/重叠模板，如 Tremor Dashboard OSS，不重复宣传成新产品。

## 逻辑资产与 variant

逻辑能力只记一次，foundation/style 另存 `variant_matrix`：

- shadcn：3 foundations × 8 styles＝24 preset；当前上游 5,120 variant records，跨 style 去重 216 个名称。
- ReUI：Base/Radix × 8 styles＝16 variant；638 icons × 4 icon styles＝2,552 渲染变体。

这些数不能与 5,936 条逻辑目录直接相加。

## 下载一项源码后的最小 provenance

```json
{
  "source": "coss",
  "upstream_name": "p-date-picker-2",
  "source_url": "https://coss.com/ui/r/p-date-picker-2.json",
  "variant": "default",
  "upstream_ref": "sha256:...",
  "source_cache_status": "adapted",
  "local_path": "apps/web/components/coss/date-range-picker.tsx",
  "modifications": ["mapped semantic tokens", "Chinese labels", "business adapter only"]
}
```

只有 URL、ref/hash、本地路径和改动说明齐全，前端 Agent 才能说“这份官方源码已下载并适配”。
