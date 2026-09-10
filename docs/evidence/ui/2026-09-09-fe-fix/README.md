# F8-10 修复后复测（fe 2026-09-09，本地生产构建 headless Chrome）

用 arch 的 `scripts/ui/overflow-check.mjs`（端口改 3401，我这边 3411 是 arch 在跑）。**三档宽度 × 8 页，横向溢出全部 0px。**

| 视口宽 | 页面 | 修前 | 修后 |
|---|---|---|---|
| 1093 | `/accounts` | 48px | **0px** |
| 1093 | `/data` | 65px | **0px** |
| 1093 | `/tasks` | 65px | **0px** |
| 1093 | `/tasks/1803240580` | 131px | **0px** |
| 1093 | `/work-items/inbox` | 197px | **0px** |
| 1093 | `/reports` | 32px | **0px** |
| 1093 | `/settings` | 32px | **0px** |
| 1093 | `/admin` | 65px | **0px** |
| 1280 | `/accounts` | 0px | **0px** |
| 1280 | `/data` | 0px | **0px** |
| 1280 | `/tasks` | 0px | **0px** |
| 1280 | `/tasks/1803240580` | 0px | **0px** |
| 1280 | `/work-items/inbox` | 10px | **0px** |
| 1280 | `/reports` | 0px | **0px** |
| 1280 | `/settings` | 0px | **0px** |
| 1280 | `/admin` | 0px | **0px** |
| 1440 | `/accounts` | 0px | **0px** |
| 1440 | `/data` | 0px | **0px** |
| 1440 | `/tasks` | 0px | **0px** |
| 1440 | `/tasks/1803240580` | 0px | **0px** |
| 1440 | `/work-items/inbox` | 0px | **0px** |
| 1440 | `/reports` | 0px | **0px** |
| 1440 | `/settings` | 0px | **0px** |
| 1440 | `/admin` | 0px | **0px** |

截图：`1093-accounts.jpg`（侧栏图标栏 + 九态卡降 5 列）、`1093-tasks_1803240580.jpg`（九页签一行 + KPI 三列）、`1093-data.jpg`。

「越界元素」栏里出现的 `table.w-full` 是宽表本身宽于视口，但它们在自己的 `overflow-x-auto` 容器里滚，页面 body 不滚，符合响应式铁律。
