# 新增免费 UI 来源候选

> 核验日期：2026-08-19。以下均为官方文档/官方仓库已经证实的公开源码候选，但目前只是 `discovery-only`：未并入 5,936 条主目录，也未下载源码。

| 候选 | 风格 | 最适合 | 许可证 | 当前建议 |
|---|---|---|---|---|
| Vercel AI Elements | 克制、产品化的 AI 工作台 | 对话、推理、工具调用、来源、Prompt 输入 | Apache-2.0 | **最高优先**；本产品 Agent UI 的直接能力补充 |
| Kibo UI | 现代 SaaS、复杂功能完成度高 | Gantt、Kanban、Editor、Dropzone、Calendar | MIT | **最高优先**；替代一部分 ReUI Pro 功能 |
| Dice UI | 中性、细致、可访问性优先 | Data Grid、File Upload、Kanban、Media Player、Tour | MIT | **高优先**；与 coss/ReUI 做复杂交互对比 |
| Animate UI | shadcn 产品感 + 克制统一动效 | Dialog/Tabs/Button 过渡、背景、动画图标 | MIT | 中高优先；替代部分付费动效组件 |
| Motion Primitives | 极简、设计工具气质、微交互细腻 | 文字、数字、布局与局部交互动画 | MIT | 中优先；只按需拿，不作业务组件底座 |

## 为什么值得进下一批

- **AI Elements** 与当前 Agent 产品直接同构，且是 shadcn Registry 源码分发，不需要另造一套聊天 UI。
- **Kibo UI** 和 **Dice UI** 补的是复杂功能，不只是换皮；在 Gantt、Kanban、Editor、上传、Data Grid 等方面能合法替代一部分付费能力。
- **Animate UI** 和 **Motion Primitives** 比 React Bits 更克制，适合 B 端产品局部使用；仍需统一 `prefers-reduced-motion` 和项目 token。

## 边界

- discovery 不等于已收录、已缓存或已批准运行时接入。
- 下一轮先抓官方全量 Registry/仓库目录、许可证和实际源码端点，再挑高频根资产。
- 任何第三方页面上混入的付费 patterns/blocks 都要另拆授权，不能因宿主项目 MIT 就一起算免费。

完整机器记录见 [`discovery.json`](discovery.json)。
