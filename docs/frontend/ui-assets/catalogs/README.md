# 官方 UI 能力目录快照

> 快照日期：2026-08-19  
> 总计：3,658 项  
> 说明：收录是“前端 Agent 可以发现”，不等于源码已装入 `apps/web`

## 数量

| 来源 | 当前收录 | 覆盖状态 | 主要内容 |
|---|---:|---|---|
| shadcn/ui | 338 | partial | New York v4 primitives、Blocks、examples、styles、三种 foundation |
| coss/ui | 577 | complete | 56 primitives、500+ Particles、fonts/hooks/styles/utilities |
| ReUI | 1,607 | partial | 当前 base-nova Registry 的 primitives、Blocks、1000+ examples |
| Tremor | 362 | partial | 39 React components + 323 Blocks/examples |
| Aceternity UI | 319 | complete | 111 free、23 Pro component groups、17 templates、167 Pro blocks、1 hook |
| Magic UI | 247 | complete | 77 UI、168 examples、style/lib |
| React Bits | 166 | partial | Animations 37、Backgrounds 53、Components 44、Text Animations 32 |
| tweakcn | 42 | partial | 官方仓库全部 defaultPresets；不冒充包含动态社区全部主题 |

`partial` 不等于只收了一点，而是官方能力分散在多个 style/仓库或还有动态社区数据，当前快照会明确边界。

## 这份目录已经能解决什么

### coss 日期组件

当前官方 Registry 中有：

- 25 个 `p-calendar-*` 例子；
- 9 个 `p-date-picker-*` 例子；
- `p-date-picker-2`＝Date range picker；
- `p-date-picker-4`＝带 presets；
- `p-date-picker-5`＝带输入框；
- `p-date-picker-9`＝双月范围。

Date Picker 不是 `@coss/date-picker` primitive。要么安装 Calendar + Popover + Button 组合，要么直接 inspect/add 对应 `@coss/p-date-picker-*` Particle。

### ReUI 数据页

目录包含 `data-grid-base-*`、`data-grid-columns-*`、`data-grid-drag-drop-*`、`data-grid-editing-*`、`data-grid-filtering-*` 等成组变体。前端不应再只看一个 Data Grid 首页就开始手写；先按实际需求筛到几项，再给老板看真实对比。

### tweakcn 多风格

目录已收 42 个官方默认 preset，如 Modern Minimal、Graphite、Caffeine、Clean Slate、Claymorphism、Darkmatter、Mono、Soft Pop 等。运行时首批只从中挑适合投放平台的 6 个，不复制 42 套页面。

## 查询示例

```bash
# 查 coss 日期范围候选
jq '[.items[] | select(.category == "date picker")]' docs/frontend/ui-assets/catalogs/coss.json

# 查 ReUI Data Grid
jq '[.items[] | select(.category == "data-grid")]' docs/frontend/ui-assets/catalogs/reui.json

# 查所有 tweakcn 主题名
jq -r '.items[] | [.upstream_name, .display_name] | @tsv' docs/frontend/ui-assets/catalogs/tweakcn.json

# 看各来源数量和覆盖说明
jq . docs/frontend/ui-assets/catalogs/index.json
```

## 刷新与防倒退

```bash
node apps/web/scripts/ui-catalog/sync.mjs --all --write
node apps/web/scripts/ui-catalog/sync.mjs --all --check
```

刷新采用原子写入；单个来源失败时不覆盖旧快照；新 item 数小于旧快照时 check 失败，必须人工确认是上游真实删除而不是解析器漏抓。

