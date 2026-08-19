# 官方 UI 能力目录快照

> 快照日期：2026-08-19
> 逻辑资产总计：**5,996 项**
> 源码全量缓存：**0 项**

## 数量与访问

| 来源 | 目录项 | 公开源码 | 公开元数据 | 购买后源码 | 覆盖口径 |
|---|---:|---:|---:|---:|---|
| shadcn/ui | 473 | 414 | 59 | 0 | New York v4 471 + 当前 index 独有 2 项；24 variants 另存矩阵 |
| coss/ui | 577 | 570 | 7 | 0 | 当前 Registry 完整 |
| coss Origin | 646 | 646 | 0 | 0 | legacy Registry 完整；599 成品组件 + 47 支持资产 |
| ReUI | 2,315 | 1,149 | 0 | 1,166 | 1,667 Registry + 638 icons + 10 templates；16 variants 另存矩阵 |
| Tremor current | 375 | 375 | 0 | 0 | 40 Raw capabilities + 5 utilities + 323 Blocks + 6 templates + 1 related variant |
| Tremor legacy | 30 | 30 | 0 | 0 | 仍在线的 `@tremor/react` 3.18.7 能力页，maintenance-stale |
| Aceternity UI | 319 | 112 | 0 | 207 | 官方 AI Index 完整；与定价页 200+ blocks 口径仍冲突 |
| Magic UI Free | 247 | 246 | 1 | 0 | 免费 Registry 完整 |
| Magic UI Pro | 104 | 3 | 0 | 101 | 公开可复现下限：95 blocks + 9 observed templates，不是 Pro 总量 |
| React Bits Free | 166 | 166 | 0 | 0 | 免费仓库完整，四代码变体已去重 |
| React Bits Pro | 702 | 0 | 0 | 702 | 134 components + 238 page blocks + 300 app UI + 11 templates + 19 Agent Kit |
| tweakcn | 42 | 42 | 0 | 0 | 42 个 defaultPresets 完整；社区主题为动态集合 |

总访问分布：公开源码 3,753、公开元数据 67、购买后源码 2,176。这里的“公开源码”表示官方 endpoint/repository 可访问，仍不表示本仓已把 payload 下载下来。

## 不能混算

- shadcn 5,120 是 24 套 preset 的 variant records，不是 5,120 个不同组件；跨 style 去重后当前 216 个名称。
- ReUI 2,552 是 638 个 icons × 4 styles；目录只计 638 个逻辑 icon。
- Magic UI Pro 官方只承诺“50+ sections、9+ templates”，104 是公开页面能复现的**下限**。
- Aceternity 定价页“200+ blocks”与 AI Index 的 167 个 leaf blocks 未消解，不能自行补造 33 项。
- tweakcn 社区主题能匿名分页浏览但持续增长，没有稳定永久总数。

## 常用查询

```bash
# 全部来源数量、访问状态与缓存状态
jq . docs/frontend/ui-assets/catalogs/index.json

# 只看无需付费即可取得官方源码的候选
jq '[.items[] | select(.access_status == "public-source")]' \
  docs/frontend/ui-assets/catalogs/coss.json

# 查 ReUI 日期/范围候选，并看是否需要 Pro
jq '[.items[] | select(.category == "calendar" or .category == "date-selector") | {upstream_name, access_status, preview_url}]' \
  docs/frontend/ui-assets/catalogs/reui.json

# 查 React Bits Pro 的公开候选名，不下载付费源码
jq '[.items[] | select(.category | contains("app-ui")) | {display_name, preview_url, access_tier}] | .[:20]' \
  docs/frontend/ui-assets/catalogs/react-bits-pro.json

# 跨 12 条产品线按能力查候选
node apps/web/scripts/ui-catalog/build-capability-index.mjs --query date-picker --limit 30
```

## 刷新与核验

```bash
node apps/web/scripts/ui-catalog/sync.mjs --write
node apps/web/scripts/ui-catalog/build-capability-index.mjs --write
node apps/web/scripts/ui-catalog/build-coverage-audit.mjs --write
node apps/web/scripts/ui-catalog/audit-runtime-source.mjs --write

node apps/web/scripts/ui-catalog/sync.mjs --check
node apps/web/scripts/ui-catalog/build-capability-index.mjs --check
node apps/web/scripts/ui-catalog/build-coverage-audit.mjs --check
node apps/web/scripts/ui-catalog/audit-runtime-source.mjs --check
```

刷新采用原子写入；item 数量倒退会失败，必须人工确认是上游删除还是解析器漏抓。付费 Registry 的 401 是访问边界，不是待绕过的错误。
