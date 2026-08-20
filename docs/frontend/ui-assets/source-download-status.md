# 前端 UI 源码下载与运行时状态

> 核验快照：2026-08-20（17 库比较墙源码补充）

## 结论

- 7,056 条目录均是元数据；完整 upstream source cache 为 0。
- 运行仓已有 22 个 `components/ui/*.tsx` 本地源码文件，其中 20 个被当前源码显式引用。
- 这些文件的 shadcn 来源只能由 `components.json.style=new-york-v4` 与路径推断；精确 upstream ref/hash 已验证 0 个。
- 11 个第三方来源隔离目录当前合计 0 个源码文件。
- 独立 starter cache 已保存 73 个根资产、130 个缓存条目、143 份源码文件；失败 0。这些文件尚未安装进运行仓。
- 比较墙已补充 shadcn 当前 Registry、coss Origin、Tremor legacy 官方包和 Magic UI 官方公开 MIT template；React Bits Pro 仍为 0 份源码。

所以不能说“所有目录源码已下载”。准确说法是：目录全量可查；高频公开源码已在隔离缓存中可复核；现有 shadcn 风格本地源码可运行但 provenance 待补；第三方缓存尚未接入运行仓。

## 隔离 Starter Cache

| 来源 | 根资产 | 依赖 | 缓存条目 | 源码文件 |
|---|---:|---:|---:|---:|
| aceternity | 6 | 1 | 7 | 7 |
| ai-elements | 6 | 2 | 8 | 8 |
| animate-ui | 3 | 8 | 11 | 11 |
| coss-origin | 1 | 1 | 2 | 2 |
| coss | 12 | 32 | 44 | 44 |
| dice-ui | 3 | 4 | 7 | 16 |
| kibo-ui | 6 | 0 | 6 | 6 |
| magic-ui | 7 | 0 | 7 | 7 |
| magic-ui-pro（仅公开 MIT template） | 1 | 0 | 1 | 1 |
| motion-primitives | 3 | 0 | 3 | 3 |
| react-bits | 7 | 0 | 7 | 11 |
| reui | 8 | 8 | 16 | 16 |
| shadcn（当前 Registry 代表项） | 1 | 1 | 2 | 2 |
| tremor | 7 | 0 | 7 | 7 |
| tremor-legacy（固定 3.18.7 包） | 1 | 0 | 1 | 1 |
| tweakcn | 1 | 0 | 1 | 1 |

缓存位置：`docs/frontend/ui-assets/source-cache/`。这里的 Registry JSON 包含实际 `files[].content`；GitHub 资产保存 raw 文件并逐文件记录 SHA-256。缓存不等于选型拍板或运行时接入。

## 本地 UI 源码

| 文件 | 当前引用数 | 目录映射 | provenance |
|---|---:|---|---|
| `components/ui/avatar.tsx` | 1 | shadcn:avatar | inferred-from-components.json-and-path |
| `components/ui/badge.tsx` | 5 | shadcn:badge | inferred-from-components.json-and-path |
| `components/ui/breadcrumb.tsx` | 0 | shadcn:breadcrumb | inferred-from-components.json-and-path |
| `components/ui/button.tsx` | 5 | shadcn:button | inferred-from-components.json-and-path |
| `components/ui/card.tsx` | 5 | shadcn:card | inferred-from-components.json-and-path |
| `components/ui/chart.tsx` | 2 | shadcn:chart | inferred-from-components.json-and-path |
| `components/ui/checkbox.tsx` | 1 | shadcn:checkbox | inferred-from-components.json-and-path |
| `components/ui/drawer.tsx` | 1 | shadcn:drawer | inferred-from-components.json-and-path |
| `components/ui/dropdown-menu.tsx` | 3 | shadcn:dropdown-menu | inferred-from-components.json-and-path |
| `components/ui/input.tsx` | 2 | shadcn:input | inferred-from-components.json-and-path |
| `components/ui/label.tsx` | 1 | shadcn:label | inferred-from-components.json-and-path |
| `components/ui/select.tsx` | 2 | shadcn:select | inferred-from-components.json-and-path |
| `components/ui/separator.tsx` | 3 | shadcn:separator | inferred-from-components.json-and-path |
| `components/ui/sheet.tsx` | 1 | shadcn:sheet | inferred-from-components.json-and-path |
| `components/ui/sidebar.tsx` | 7 | shadcn:sidebar | inferred-from-components.json-and-path |
| `components/ui/skeleton.tsx` | 1 | shadcn:skeleton | inferred-from-components.json-and-path |
| `components/ui/sonner.tsx` | 0 | shadcn:sonner | inferred-from-components.json-and-path |
| `components/ui/table.tsx` | 2 | shadcn:table | inferred-from-components.json-and-path |
| `components/ui/tabs.tsx` | 2 | shadcn:tabs | inferred-from-components.json-and-path |
| `components/ui/toggle-group.tsx` | 1 | shadcn:toggle-group | inferred-from-components.json-and-path |
| `components/ui/toggle.tsx` | 1 | shadcn:toggle | inferred-from-components.json-and-path |
| `components/ui/tooltip.tsx` | 1 | shadcn:tooltip | inferred-from-components.json-and-path |

## 使用某项时的下载规范

1. 先从 `capabilities.json` 找候选，打开真实 preview 并做多来源对比。
2. 用官方 Registry view/item URL inspect 源码和依赖；付费项必须先取得合法 license key。
3. 只下载被批准的 item 与必要依赖，不镜像整个付费包。
4. 在 manifest 登记官方 URL、variant、HTTP/访问状态、源码 SHA-256、本地路径和改动说明。
5. 未登记 exact ref/hash 的本地文件只能标 inferred，不能标 verified。
