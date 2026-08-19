# 新增 UI 来源准入记录

> 核验与老板拍板日期：2026-08-19。以下均已核对官方文档/仓库；老板已批准进入项目选型体系，但目前仍是 `discovery-only`：未并入 5,996 条主目录、未缓存源码、未安装进运行时。批准、收录、缓存、安装四个状态不得混报。

| 候选 | 风格 | 最适合 | 许可证 | 老板拍板 |
|---|---|---|---|---|
| Vercel AI Elements | 克制、产品化的 AI 工作台 | 对话、悬浮窗、推理、工具调用、来源、Prompt 输入 | Apache-2.0 | **正式准入**；作为内置 Agent 界面首选候选，按 Agent 场景接入 |
| Kibo UI | 现代 SaaS、复杂功能完成度高 | Gantt、Kanban、Editor、Dropzone、Calendar | MIT | **正式准入**；复杂业务组件高优先，配色必须接项目 token |
| Dice UI | 中性、细致、可访问性优先 | Data Grid、File Upload、Kanban、Media Player、Tour | MIT | **正式准入**；复杂交互高优先，首次使用与 ReUI/coss/TanStack 并排比较 |
| Animate UI | shadcn 产品感 + 克制统一动效 | Dialog/Tabs/Button 过渡、背景、动画图标 | MIT + Commons Clause | **选择性准入**；少量按需对比，不整库默认安装 |
| Motion Primitives | 极简、设计工具气质、微交互细腻 | 文字、数字、布局与局部交互动画 | MIT | **选择性准入**；少量按需对比，不作业务组件底座 |

## 项目使用边界

- **AI Elements**：服务全局 Agent 悬浮入口、对话抽屉、流式消息、推理、工具调用与来源引用；先做 UI 行为层，模型/会话/权限仍服从项目契约。
- **Kibo UI**：组件的颜色只是官网示例，不是固定品牌色。允许把背景、边框、文字、状态色、圆角、阴影和图表色映射到项目语义 token；不得为换色破坏焦点、键盘、拖拽和受控状态。
- **Dice UI**：重点借用 Data Grid、File Upload、Kanban 等复杂交互和可访问性行为；若与现有 ReUI/coss/TanStack 重叠，先用同一业务数据、宽度、主题和状态截图比较。
- **Animate UI / Motion Primitives**：只在减少认知负担、提示状态变化或增强操作反馈时使用；必须支持 `prefers-reduced-motion`，禁止让大表、数字和背景持续运动。

## 边界

- 已批准进入选型不等于已完成全量收录、源码缓存或运行时安装。
- 下一轮先抓官方全量 Registry/仓库目录、许可证和实际源码端点，再挑高频根资产；前端在此之前可以看官方预览和提出具体组件，但不能汇报“已经安装”。
- 任何第三方页面上混入的付费 patterns/blocks 都要另拆授权，不能因宿主项目 MIT 就一起算免费；Animate UI 与 React Bits 的 Commons Clause 也不能简称为纯 MIT。

完整机器记录见 [`discovery.json`](discovery.json)。
