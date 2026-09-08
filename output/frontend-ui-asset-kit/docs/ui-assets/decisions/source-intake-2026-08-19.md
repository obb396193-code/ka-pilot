# 新 UI 来源准入决定

> 日期：2026-08-19
> 决策人：老板
> 状态：已拍板；尚未全量入库、缓存或安装运行时源码

## 已选方案

| 来源 | 决定 | 适用范围 | 运行时边界 |
|---|---|---|---|
| Vercel AI Elements | 正式准入 | 内置 Agent 悬浮窗/抽屉、对话、消息、流式输出、推理、工具调用、来源引用、Prompt 输入 | 只在 Agent 场景按需复制；模型、会话、权限和写操作确认仍走项目契约 |
| Kibo UI | 正式准入 | Gantt、Kanban、Editor、Dropzone、Color Picker、复杂 Calendar | 官网配色不是固定规范，统一映射项目语义 token；不破坏行为契约 |
| Dice UI | 正式准入 | Data Grid、File Upload、Kanban、Time Picker、Tour 等复杂交互 | 与 ReUI/coss/TanStack 重叠时先做同业务容器对比 |
| Animate UI | 选择性准入 | 少量按钮、弹层、图标和状态过渡 | 每次与现有动效库对比；Commons Clause 单列；不整库默认安装 |
| Motion Primitives | 选择性准入 | 文字、数字、布局与局部微交互 | 每次与现有动效库对比；不作为业务组件底座 |

## 没选的方案和原因

- 没有把五库全部设为默认运行时依赖：会扩大依赖、升级和样式冲突面，也会让前端跳过能力级比较。
- 没有因为 Kibo 官网配色好看就照搬颜色：本项目需要 tweakcn 多主题，颜色必须来自项目语义 token。
- 没有排除 Animate UI/Motion Primitives：老板允许少量使用，但只有具体交互出现时才做真实动态对比。

## 状态定义

- **正式准入**：前端可把该来源放入具体能力候选并申请按需复制。
- **选择性准入**：只能用于明确的局部场景，不进入默认底座。
- **未全量入库**：当前仍为 discovery，不能宣称官方全部组件已经抓取。
- **未缓存/未安装**：当前没有源码进入 A 缓存或 `apps/web` 运行时。

机器状态见 `../discovery.json`，前端执行规范见 `../frontend-product-standard.md`。
