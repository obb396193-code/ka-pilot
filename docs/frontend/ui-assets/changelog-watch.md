# UI 上游变更观察点

> 最后核验：2026-08-19

不设置自动定时任务；每次准备更新、引入新组件或前端大版本升级时执行。

| 来源 | 首要观察 | 当前特别风险 |
|---|---|---|
| shadcn | CLI release、Registry schema、New York v4、foundation | overwrite 本地修改、Radix/Base/ARIA 行为差异 |
| coss | Changelog、Base UI、DayPicker、Particles | `render` API、portal、DayPicker major、混合许可证路径 |
| ReUI | Registry、llms.txt、pricing/license、16 styles | Free/Pro/Ultimate 边界、TanStack/dnd-kit 版本、虚拟化行为 |
| Tremor | Raw/Blocks/Templates/旧 npm 多线 commits | 旧 npm vs Raw、模板许可证文案冲突、Recharts/ECharts 重复 |
| Aceternity | Changelog、AI catalog、Free/Pro 状态 | Motion/particles/3D 依赖、许可证状态变化 |
| Magic UI | Free Registry、Pro section pages/sitemap | Pro 无总 manifest、token 401、observer/motion cleanup、SSR/hydration |
| React Bits | Free `src/content`、Pro sitemap、license | 新重依赖、四代码变体漂移、Starter/Pro/Ultimate 边界 |
| tweakcn | `defaultPresets` token、community/pricing | preset 删除/改名、社区动态无 total、服务配额变化 |
| AI Elements | Runtime Registry、AI SDK、React/Tailwind compatibility | streaming/tool/source API 变化、示例协议与产品后端不一致 |
| Kibo UI | Registry、复杂组件依赖、block endpoints | dnd-kit/Jotai/date-fns 版本、docs-only block 500、性能与键盘 |
| Dice UI | Registry、changelog、Radix/Base variants | Data Grid 虚拟化、Upload adapter、variant API 漂移 |
| Animate UI | Registry、Motion、LICENSE | Commons Clause 范围、demo/primitive 重复、bundle 与 reduced-motion |
| Motion Primitives | 官方仓库 Registry、Motion version | 官网限流、hydration、reduced-motion 与焦点行为 |

## 更新步骤

1. 运行 source health；阻塞时保留旧快照。
2. 运行 catalog `--check`；item 数增加或下降时都停止自动覆盖并人工复核。
3. 查看 changelog/commit 和许可证是否变化。
4. 对已 `preferred/vendored/adapted` 资产逐项 diff。
5. 只更新确有收益的资产，跑验证门。
6. 更新 `last_verified`、upstream ref、manifest 和决策记录。
