# 数据产品前端执行规范

> 生效日期：2026-08-19
> 适用范围：`apps/web/` 的页面、组件、图表、主题和交互实现。
> 目的：把“好看、好用、可复用”变成前端 Agent 可执行、可验收的流程，而不是只提供参考链接。

## 1. 先理解四类基础设施

| 能力 | 它是什么 | 解决什么问题 | 当前项目动作 |
|---|---|---|---|
| Storybook | 项目内部的组件试验台，不是用户页面 | 单独查看按钮、筛选器、KPI、表格、弹窗及其加载/空/错/禁用状态；避免每次进整页才能验组件 | F-001R 稳定后建立；首批覆盖全站高频业务组件 |
| Apache ECharts | 正式报表和数据可视化引擎 | 趋势、分组对比、堆叠、散点、漏斗、下钻、缩放、主题与无障碍 | 正式数据页以 ECharts 为主；现有 Recharts 只作模板占位或轻量小图 |
| Design Tokens + Style Dictionary | 颜色、字号、间距、圆角、阴影、状态色和图表色的统一机器变量 | 让 tweakcn 多主题、CSS、图表和将来的设计稿使用同一语义，不在组件里硬编码颜色 | 建立项目语义 token；输出 CSS variables 和 ECharts theme bridge |
| Playwright + 无障碍门禁 | 自动验收工具 | 改动后自动发现桌面/移动端布局漂移、焦点丢失、键盘不可用、控制台错误 | 为核心组件和 P0 页面建立视觉、键盘和状态回归 |

“最值得加”指把这四层加入开发流程和验收，不是要求老板亲自操作，也不是现在立刻覆盖前端未交接的工作区。

## 2. 数据页面的信息层级

页面默认按以下顺序组织；没有业务理由不得颠倒：

1. **结论与数据健康**：当前时间范围、数据更新时间、是否完整、能否执行动作。
2. **关键 KPI**：用户此刻最需要判断的 4–6 个指标，带单位、比较基线和状态。
3. **筛选与视图**：日期、账户、任务、维度、保存视图、清空条件；筛选状态可见、可重置、可分享。
4. **趋势与证据**：每张图只回答一个问题；标题写结论对象，不写“图表 1”。
5. **明细与下钻**：表格说明结论来自哪些账户/任务/日期，允许查看原因和上下文。
6. **下一步动作**：建议、执行、忽略、创建任务或进入 Agent 对话；写操作继续遵守预览确认红线。

参考：[Ant Design 数据展示](https://ant.design/docs/spec/data-display/)、[Ant Design 可视化页面](https://ant.design/docs/spec/visualization-page/)、[Carbon Dashboard](https://carbondesignsystem.com/data-visualization/dashboards/)。

## 3. 指标、图表和报表规则

每个 KPI、图表、表格或导出报表都必须能回答：

- 指标叫什么、单位是什么、如何解释；前端不得自行推导业务口径。
- 数据来自哪里、更新时间是什么、使用哪个时区和业务日。
- 与谁比较：昨日、上周同期、考核价、目标或账户基线。
- `null`、零消耗、新账户、部分数据、过期数据分别怎么展示。
- 当前筛选、排序和维度是什么；导出必须保留这些上下文。

图表要求：

- 时间趋势优先折线/面积；类别比较优先条形；构成仅在类别有限时使用堆叠；关系与异常才用散点。
- 禁止彩虹配色、无意义 3D、过度渐变和仅靠红/绿表达状态。
- 图表颜色来自语义 token，light/dark/preset 切换时同时更新；文本、tooltip、legend、axis 也要换主题。
- 提供文本标题、摘要或 `aria` 描述；必要时使用 decal/图案帮助色觉差异用户。
- 大数据量启用抽样、缩放、渐进渲染或服务端聚合，不把全部明细一次塞进浏览器。

参考：[ECharts ARIA](https://echarts.apache.org/handbook/en/best-practices/aria/)、[ECharts 6](https://echarts.apache.org/handbook/en/basics/release-note/v6-feature/)。

## 4. 表格与复杂交互规则

- 静态只读信息优先原生 table 语义；可编辑、可选择、可用方向键导航的控件才采用交互式 grid。
- 大表明确区分服务端分页/筛选/排序与客户端虚拟化；虚拟化不能替代数据接口的分页和筛选。
- 数据总表至少考虑：关键列冻结、列显示/隐藏、列顺序、密度、排序、筛选、导出、空态、部分失败和刷新状态。
- 键盘焦点必须可见；弹窗/抽屉关闭后焦点回到触发器；拖拽必须有非拖拽替代路径。
- 红绿状态同时提供文字、图标或图案，不能只靠颜色。

参考：[W3C Table Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/)、[W3C Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)、[TanStack Virtualization Guide](https://tanstack.com/table/latest/docs/framework/react/guide/virtualization)。

## 5. 组件来源与主题适配

1. 开发前按 `agent-workflow.md` 查询资产，不先手写。
2. Kibo、Dice、ReUI、coss 等出现同能力时，用同一业务数据、中文、宽度、主题和状态做并排预览。
3. Kibo 官网颜色只是示例。允许替换背景、边框、文字、语义色、圆角、阴影和密度，但必须通过项目 token，不散落硬编码值。
4. AI Elements 用于 Agent 悬浮窗/抽屉/对话/消息/推理/工具/来源；模型调用、会话权限、数据引用和写操作确认仍由项目契约控制。
5. Animate UI、Motion Primitives 只少量用于状态变化和操作反馈；必须支持 `prefers-reduced-motion`，并与现有动效库比较。
6. 业务差异放薄适配层，第三方组件的焦点、ARIA、portal、受控状态和键盘行为不得随意重写。

## 6. 设计到前端的标准流程

### Gate 1：产品与数据契约

明确用户要做的决策、指标口径、字段、权限、时区、刷新频率和动作风险。缺字段就回抛契约，不在前端发明。

### Gate 2：信息架构与状态矩阵

在写页面前列出模块顺序、筛选/下钻路径，以及 `loading / empty / partial / stale / error / no-permission / demo / disabled` 状态。

### Gate 3：设计系统与候选选择

先确定语义 token 和已有组件；多候选按真实业务容器对比。视觉参考用于拍板，不能替代行为和许可证核验。

### Gate 4：Ready for Dev

开发输入至少包含：页面目的、桌面/移动布局、组件变体、状态矩阵、文案、数据契约、交互说明和验收标准。使用 Figma 时可用 Dev Mode 的变量、标注和变更比较，但不把付费工具当项目必需条件。

### Gate 5：组件先行

先在 Storybook 或等价隔离页面完成组件及全部状态，再接进页面。不得在多个页面复制同一套业务组件。

### Gate 6：页面与 API 集成

先用契约驱动 mock 验状态，再接真实 API。前端只格式化和展示，不重新计算 CPA、达标、环比等业务口径。

### Gate 7：质量验收

依次检查数据正确性、桌面/移动端、light/dark/preset、键盘/焦点、视觉回归、性能、控制台、错误和许可证/来源记录。

### Gate 8：发布与回写

交付写明使用的上游资产、版本/ref、修改点、已验证状态和仍有风险；拍板结果回写 `decisions/`，禁止只留在对话里。

## 7. Storybook 首批范围

F-001R 稳定后，首批不是把所有 primitive 都搬进去，而是覆盖真正影响产品一致性的业务组件：

- KPI 卡：正常、上涨/下降、无比较、无数据、过期数据。
- 数据健康横幅：正常、延迟、部分失败、阻断执行。
- 筛选条：默认、有筛选、超长条件、清空、移动端收纳。
- Data Grid：加载、空、错误、无权限、长文本、固定列、列配置、虚拟滚动。
- 状态 chip、空态、错误态、详情抽屉、确认弹窗。
- Agent 悬浮入口与对话抽屉：空会话、流式消息、工具执行、来源、失败、写操作确认。

参考：[Storybook 组件隔离与浏览](https://storybook.js.org/docs/get-started/browse-stories/)、[Storybook 测试](https://storybook.js.org/docs/writing-tests/)。

## 8. 自动验收最小门禁

核心页面每次交付至少通过：

- TypeScript、ESLint、production build。
- 1440px、1366px、390px 三档无横向溢出。
- light/dark 及已发布 tweakcn preset 的主要组件可读。
- Playwright 核心截图与关键交互通过，控制台无新增 error。
- Tab/Shift+Tab、Enter/Space、Escape、方向键按组件语义可用，焦点可见。
- `loading / empty / partial / stale / error / no-permission / disabled` 有真实状态，不用假数据伪装正常。
- 对用户感知性能以 p75 为准：LCP ≤ 2.5s、INP ≤ 200ms、CLS ≤ 0.1；内部环境无法稳定测量时至少记录本地基线，不伪报线上指标。
- 第三方源码有官方 URL、许可证、精确 ref/hash、本地路径和修改说明。

参考：[Playwright Visual Comparisons](https://playwright.dev/docs/test-snapshots)、[Core Web Vitals 阈值](https://web.dev/articles/defining-core-web-vitals-thresholds)、[Next.js Production Checklist](https://nextjs.org/docs/app/guides/production-checklist)。

## 9. Definition of Done

一个前端页面只有同时满足以下条件才算完成：

- 模块、导航、字段和动作符合 PRD/契约。
- 业务口径由后端/domain 提供，前端没有自行算数。
- 使用已批准组件或留有多候选拍板记录；没有重复手写成熟能力。
- 全部状态、响应式、主题、键盘和焦点已验证。
- 核心视觉截图/回归已通过，图表和表格没有误导性表达。
- 来源、许可证、适配与未解决风险可追溯。

## 10. 外部产品只作模式参考

- [Apache Superset](https://github.com/apache/superset)：探索型 dashboard、筛选器、图表组合、语义层。
- [Metabase](https://github.com/metabase/metabase)：业务提问、钻取、保存问题与报表分发。
- [Grafana](https://github.com/grafana/grafana)：时间范围、监控、告警、变量和下钻。
- [PostHog](https://github.com/PostHog/posthog)：渐进式分析、详情页和行为路径。

这些用于研究信息架构和交互，不代表可以复制源码；每个仓库在取代码前单独核许可证和目录边界。
