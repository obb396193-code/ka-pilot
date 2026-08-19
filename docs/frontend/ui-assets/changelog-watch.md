# UI 上游变更观察点

> 最后核验：2026-08-19

不设置自动定时任务；每次准备更新、引入新组件或前端大版本升级时执行。

| 来源 | 首要观察 | 当前特别风险 |
|---|---|---|
| shadcn | CLI release、Registry schema、New York v4、foundation | overwrite 本地修改、Radix/Base/ARIA 行为差异 |
| coss | Changelog、Base UI、DayPicker、Particles | `render` API、portal、DayPicker major、混合许可证路径 |
| ReUI | Registry build、styles、Data Grid/Filters | style 路由、TanStack/dnd-kit 版本、虚拟化行为 |
| Tremor | 多仓 commits/releases | 旧 npm vs 新 copy/paste、Recharts/ECharts 重复 |
| Aceternity | Changelog、AI catalog、Free/Pro 状态 | Motion/particles/3D 依赖、许可证状态变化 |
| Magic UI | Registry diff、dependencies | observer/motion cleanup、SSR/hydration |
| React Bits | `src/content`、license、Pro 边界 | 新重依赖、四代码变体漂移、Commons Clause |
| tweakcn | `defaultPresets`、token contract | preset 删除/改名、token 缺失、社区主题非稳定 API |

## 更新步骤

1. 运行 source health；阻塞时保留旧快照。
2. 运行 catalog `--check`；item 数下降时停止自动覆盖。
3. 查看 changelog/commit 和许可证是否变化。
4. 对已 `preferred/vendored/adapted` 资产逐项 diff。
5. 只更新确有收益的资产，跑验证门。
6. 更新 `last_verified`、upstream ref、manifest 和决策记录。

