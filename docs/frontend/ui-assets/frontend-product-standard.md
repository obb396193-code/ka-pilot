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

### Storybook、ECharts 与 UI 资产展厅不是一回事

| 工具 | 大白话 | 展示对象 | 是否进入用户产品 |
|---|---|---|---|
| Storybook | 项目自己的“组件样板间” | KPI 卡、按钮、筛选器、表格、弹窗、Agent 消息及其各种状态 | stories 只用于开发，不进入生产 bundle；被验证的组件会进入产品 |
| ECharts | 数据图表发动机 | 折线、柱状、散点、漏斗、热力图等 | 图表运行时代码会进入产品 |
| UI 资产展厅 | 17 家第三方来源的“选型商场” | 每家官方代表组件和能力差异 | 展厅本身不进入产品；选中的合法源码才按需复制 |

Storybook 不能代替 ECharts 画业务图表，ECharts 也不能代替 Storybook 检查按钮、表格、空态和弹窗。官方 Storybook 把一条 story 定义为组件的一个可渲染状态，并在隔离预览中浏览、调参数和测试；story 文件属于开发环境，不进入产品 bundle。参考：[Browse stories](https://storybook.js.org/docs/get-started/browse-stories/)、[Writing stories](https://storybook.js.org/docs/writing-stories)。

## 2. 视觉基线：推荐，不是审美铁板

本节分三种约束：

- **硬门禁**：数据、权限、可访问性、敏感信息、写操作确认和许可证，不得为了好看绕过。
- **推荐基线**：字体、字号、间距、密度、数字精度和动画时长是默认起点，不是唯一答案。
- **可调整 token**：真实页面验证后，如果推荐基线不好看、拥挤或影响理解，可以调整语义 token；不得在单个组件散落硬编码值。

调整视觉 token 时必须同时复核：至少 3 个典型页面、1440/1366/390 视口、light/dark 和已发布 preset。记录“为什么改、影响哪些组件、截图差异和是否回写全局 token”。不允许为了一个页面局部好看破坏全站一致性。

### 2.1 文字与字体层级

字体只规定角色和可读范围，不锁死某一款字体。默认使用系统/项目批准的中文无衬线字体栈；品牌页或短标题需要个性字体时，必须验证中文字符、数字、粗细、加载性能和 fallback。

| 角色 | 推荐起点 | 使用原则 |
|---|---|---|
| 页面标题 | 24–32px，600–700 | 一页一个主标题；移动端可降一级；长标题允许换行，不压缩成难读小字 |
| 区块标题 | 18–24px，600 | 表达当前模块解决的问题，不写“模块一”“图表 1” |
| 卡片/KPI 标签 | 12–14px，500–600 | 先读懂指标名，再看数值；标签不要比数值抢眼 |
| 正文/说明 | 14–16px，400–500 | 中文行高建议从 1.5 起测；长段落控制行宽，避免横跨整屏 |
| 表格/高密度数据 | 12–14px | 12px 只用于确有密度需求的辅助信息；核心数据不可因“塞得下”继续缩小 |
| 辅助/时间/来源 | 12–13px | 对比度仍需可读；不能用极浅灰隐藏重要限制 |

排版规则：

- 标题使用 `text-wrap: balance`，正文可使用 `text-wrap: pretty`；中文禁用机械单词间距。
- 用户输入和超长账户名要覆盖短、正常、超长三档；使用 wrap、truncate 或 line-clamp 时提供完整内容查看方式。
- 标题、按钮和状态词使用具体中文，不为了“高级感”滥用英文大写、字间距或全角空格。
- 图标不能替代关键文字；纯图标按钮必须有可访问名称和 tooltip（若含义不明显）。
- 加载文案用省略号 `…`；错误文案同时说明下一步，不只写“失败”。
- 字体加载不得阻塞首屏；定制字体失败时布局不能崩坏或数字跳列。

### 2.2 数字、金额、比例与日期格式

前端只负责格式化，不重新计算 CPA、达成率、Gap、环比或归因结果。格式化统一走项目 formatter，优先 `Intl.NumberFormat` 与 `Intl.DateTimeFormat`，禁止各页面手写 `toFixed()`、千分位和日期字符串。

| 数据 | 推荐展示 | 必须避免 |
|---|---|---|
| 金额 | 明确人民币/其他币种；表格保留业务要求精度，总览可用万/亿缩写并在 tooltip 给精确值 | 只写裸数字；同页有的带 ¥ 有的不带；把未知当 0 |
| 百分比 | 明确 API 返回是 0–1 还是 0–100；通常保留 1–2 位，取决于指标波动和决策需要 | 前端重复乘 100；`12`、`12%`、`0.12` 混用 |
| CPA/单价 | 与金额精度一致并显示单位；对比考核价时基线清楚 | 用颜色代替“高于/低于目标”的文字 |
| 计数 | 表格优先精确千分位；KPI 可缩写，hover/详情显示精确值 | 1.2万与 12,034 在同列无规则混用 |
| 正负变化 | 正负号、箭头、文字和颜色至少两种信号；0 变化写清 | 只靠红绿；把下降一律理解成坏事 |
| 日期时间 | 显示时区/业务日；相对时间旁可查看绝对时间 | 硬编码 `YYYY-MM-DD` 到处散落；服务端/客户端时区不一致 |

数字列与 KPI 使用 `font-variant-numeric: tabular-nums`，小数点和单位对齐；单位放在列头、数值后或辅助标签中，全页保持一致。不要为了对齐把数字转成图片或逐字符 DOM。

状态语义必须分开：

- `0`：确认有数据且值为零。
- `null/—`：没有有效值或不适用。
- `暂无数据`：当前筛选没有记录。
- `数据更新中/部分数据/已过期`：值可能变化或不能支持动作。
- `无权限`：不能用空态或 0 伪装。

### 2.3 排版、布局、留白与密度

- 页面先保证“结论 → 证据 → 明细 → 动作”的阅读顺序，再决定卡片样式。
- 数据工作台默认充分使用横向空间，但避免正文和说明文字跨越整屏；内容区最大宽度由页面类型 token 控制，不写死一个全站数值。
- 使用 4px 或兼容现有 Tailwind scale 的间距节奏作为起点；同层元素间距小于跨层间距，避免所有缝隙一样大。
- 页面必须有明确的一级容器、区块、组件内部三层留白，不靠更多边框制造层级。
- KPI 建议一屏显示 4–6 个核心指标；窄屏按优先级重排，不把桌面卡片机械缩小。
- 筛选区支持默认、展开和移动收纳；高频筛选可见，低频筛选进入“更多”，当前条件始终能识别和清空。
- 表格提供 compact/default（必要时 comfortable）密度，而不是为不同页面复制三张表；最小点击目标和焦点区域不能随密度一起缩没。
- sticky 顶栏、冻结列、弹窗和抽屉不得遮挡焦点、tooltip 或主要动作；全屏与安全区适配移动设备。
- Flex/Grid 优先于运行时 JS 测量；长文本容器设置 `min-width: 0` 并验证中文、英文、数字和无空格长串。

布局好不好看不能只看空白演示。至少用：正常数据、超长中文、最大数字、空态、错误态、移动端和深色主题复核。

### 2.4 动画与文字/数字动效

动画只在能解释“什么改变了、从哪里来、操作是否成功”时使用。推荐时长是起点，可按真实手感调整：

| 动画层级 | 推荐起点 | 适用场景 |
|---|---|---|
| 即时反馈 | 100–180ms | hover、按下、开关、chip 变化 |
| 状态过渡 | 180–280ms | tooltip、popover、折叠、tab、轻量数字更新 |
| 布局/层级变化 | 240–400ms | drawer、dialog、列表插入、页面局部重排 |
| 品牌/引导动效 | 最短可理解时长 | onboarding、空态或极少量重点展示，不进入高频操作主路径 |

硬规则：

- 支持 `prefers-reduced-motion`，提供关闭、缩短或无位移版本。
- 优先动画 `transform`/`opacity`；不得使用 `transition: all`。
- 动画可被点击、Escape、路由变化或新状态打断，不得让用户等播完。
- 超过 5 秒的自动播放装饰动效提供暂停/停止/隐藏方式。
- 动画不得延迟数据显示、焦点进入、错误呈现和关键动作执行。
- 数字动画最终 DOM 保留真实可访问文本，读屏不能逐帧播报；实时高频更新改为节流或直接更新。

来源选择：

- Motion Primitives：`animated-number`、`sliding-number`、`text-effect`、`text-loop`、`text-morph`、`text-roll`、`text-scramble`、`text-shimmer`、`text-shimmer-wave`、`spinning-text` 等已进入目录。
- Animate UI：Counting/Scrolling/Sliding Number、Typing、Morphing、Rolling、Rotating、Shimmering、Splitting 等已进入目录。
- Aceternity、Magic UI、React Bits：适合少量高级视觉；同能力先在展厅对比许可证、体积、可读性与 reduced motion。

适合使用：Agent 流式状态、工具执行完成、KPI 的低频确认性变化、成功反馈、onboarding、空态引导、展开/折叠。禁止或默认不用：表格正文、长文、错误/权限/警告文案、按钮关键标签、所有 KPI 同时滚动、每次轮询都动画、用户需要复制的内容。

## 3. 数据页面的信息层级

页面默认按以下顺序组织；没有业务理由不得颠倒：

1. **结论与数据健康**：当前时间范围、数据更新时间、是否完整、能否执行动作。
2. **关键 KPI**：用户此刻最需要判断的 4–6 个指标，带单位、比较基线和状态。
3. **筛选与视图**：日期、账户、任务、维度、保存视图、清空条件；筛选状态可见、可重置、可分享。
4. **趋势与证据**：每张图只回答一个问题；标题写结论对象，不写“图表 1”。
5. **明细与下钻**：表格说明结论来自哪些账户/任务/日期，允许查看原因和上下文。
6. **下一步动作**：建议、执行、忽略、创建任务或进入 Agent 对话；写操作继续遵守预览确认红线。

参考：[Ant Design 数据展示](https://ant.design/docs/spec/data-display/)、[Ant Design 可视化页面](https://ant.design/docs/spec/visualization-page/)、[Carbon Dashboard](https://carbondesignsystem.com/data-visualization/dashboards/)。

## 4. 指标、图表和报表规则

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

## 5. 表格与复杂交互规则

- 静态只读信息优先原生 table 语义；可编辑、可选择、可用方向键导航的控件才采用交互式 grid。
- 大表明确区分服务端分页/筛选/排序与客户端虚拟化；虚拟化不能替代数据接口的分页和筛选。
- 数据总表至少考虑：关键列冻结、列显示/隐藏、列顺序、密度、排序、筛选、导出、空态、部分失败和刷新状态。
- 键盘焦点必须可见；弹窗/抽屉关闭后焦点回到触发器；拖拽必须有非拖拽替代路径。
- 红绿状态同时提供文字、图标或图案，不能只靠颜色。

参考：[W3C Table Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/table/)、[W3C Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/)、[TanStack Virtualization Guide](https://tanstack.com/table/latest/docs/framework/react/guide/virtualization)。

## 6. 组件来源与主题适配

1. 开发前按 `agent-workflow.md` 查询资产，不先手写。
2. Kibo、Dice、ReUI、coss 等出现同能力时，用同一业务数据、中文、宽度、主题和状态做并排预览。
3. Kibo 官网颜色只是示例。允许替换背景、边框、文字、语义色、圆角、阴影和密度，但必须通过项目 token，不散落硬编码值。
4. AI Elements 用于 Agent 悬浮窗/抽屉/对话/消息/推理/工具/来源；模型调用、会话权限、数据引用和写操作确认仍由项目契约控制。
5. Animate UI、Motion Primitives 只少量用于状态变化和操作反馈；必须支持 `prefers-reduced-motion`，并与现有动效库比较。
6. 业务差异放薄适配层，第三方组件的焦点、ARIA、portal、受控状态和键盘行为不得随意重写。

## 7. 设计到前端的标准流程

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

## 8. Storybook 首批范围

F-001R 稳定后，首批不是把所有 primitive 都搬进去，而是覆盖真正影响产品一致性的业务组件：

- KPI 卡：正常、上涨/下降、无比较、无数据、过期数据。
- 数据健康横幅：正常、延迟、部分失败、阻断执行。
- 筛选条：默认、有筛选、超长条件、清空、移动端收纳。
- Data Grid：加载、空、错误、无权限、长文本、固定列、列配置、虚拟滚动。
- 状态 chip、空态、错误态、详情抽屉、确认弹窗。
- Agent 悬浮入口与对话抽屉：空会话、流式消息、工具执行、来源、失败、写操作确认。

参考：[Storybook 组件隔离与浏览](https://storybook.js.org/docs/get-started/browse-stories/)、[Storybook 测试](https://storybook.js.org/docs/writing-tests/)。

## 9. 自动验收最小门禁

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

## 10. Definition of Done

一个前端页面只有同时满足以下条件才算完成：

- 模块、导航、字段和动作符合 PRD/契约。
- 业务口径由后端/domain 提供，前端没有自行算数。
- 使用已批准组件或留有多候选拍板记录；没有重复手写成熟能力。
- 全部状态、响应式、主题、键盘和焦点已验证。
- 核心视觉截图/回归已通过，图表和表格没有误导性表达。
- 来源、许可证、适配与未解决风险可追溯。

## 11. 外部产品只作模式参考

- [Apache Superset](https://github.com/apache/superset)：探索型 dashboard、筛选器、图表组合、语义层。
- [Metabase](https://github.com/metabase/metabase)：业务提问、钻取、保存问题与报表分发。
- [Grafana](https://github.com/grafana/grafana)：时间范围、监控、告警、变量和下钻。
- [PostHog](https://github.com/PostHog/posthog)：渐进式分析、详情页和行为路径。

这些用于研究信息架构和交互，不代表可以复制源码；每个仓库在取代码前单独核许可证和目录边界。
