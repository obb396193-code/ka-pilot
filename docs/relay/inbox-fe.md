# fe（前端实现会话）信箱

> 2026-08-24 起：原 Claude 前端会话暂停，后续由 Codex 接管。旧条目保留为历史背景；执行前必须以最新 PRD、契约、工作台账和 live 工作树为准。

### F-001 前端开工：工程骨架 + mock 层 + 布局壳

- 派活方：arch　日期：2026-08-18
- 前置阅读（顺序）：`docs/20-PRD-v1.md` §2（信息架构九项导航+页面清单+核心页详设）§5（D-CON 设计规范全量）→ `packages/contract/api.md` + `metrics.md`（mock 依此造）→ `docs/23-开发协作规范.md` §2/§4（纪律与三线并行）。
- 交付物（目录边界：apps/web 除 app/api 外全部）：
  1. Next.js 15 App Router 项目初始化（TS + Tailwind v4 + shadcn/ui）；D-CON token 落 `globals.css`（主橙 #ff6a2c/四级灰阶/语义红绿/tabular-nums——PRD §5.1 全表）
  2. 路由树按 PRD §2.2 页面清单全量建目录（页面先放统一的骨架占位组件）
  3. 布局壳：顶栏 56px 九项导航（工作台/投放任务/数据分析/账户资源/自动化/商品素材/报告/知识库/集成与通知）+ ⌘K 按钮 + 头像菜单；内容区 max-w-1440 居中；**灰阶素壳，不做任何视觉主张**（视觉等原型图拍板）
  4. `lib/api/` mock 层：按 api.md 全部端点造 mock（契约驱动，响应包结构一致含 meta.data_as_of）；脱敏假数据自造（账户名"账户A/B"，数字符合口径公式自洽——用 metrics.md 公式反推，别造出 real_cpa 和 cost/real_conversion 对不上的数）
  5. 基础组件五件（灰阶版）：KPI 卡/数据表格（TanStack Table 虚拟滚动）/状态 chip/数据健康横幅/详情抽屉——规格见 PRD §5.3
- 三线并行纪律（重要）：本任务=线1"结构"；**不 commit 任何有视觉主张的页面**；原型图（Codex 在生成）老板拍板后才进入线3 视觉填充
- 工程纪律：`[fe]` 前缀路径限定 commit；分支 `fe/f001`；npm 命令 cd apps/web 里跑且非沙箱；建 `docs/plans/F001-状态.md` 逐条更新；完成给 SHA + 布局壳截图（发老板过目结构，非视觉拍板）
- 复用提示：数据表格/抽屉/空态的组件织法参考 ContentRadar（方法论复用，代码独立写）；开源轮子清单见协作规范 §3
- 契约缺口：写 `docs/relay/inbox-arch.md` 提议
- 状态：待处理


### F-001 补充指令（2026-08-18 老板拍板，覆盖原第 1/5 条做法）

- **起步基座改为 shadcn dashboard-01 模板直接安装**（New York v4，https://www.shadcn.com.cn/view/new-york-v4/dashboard-01 同款）：`npx shadcn@latest init` + dashboard-01 block 整体拉入，布局/KPI卡/表格/图表容器**能拿的全部拿**，先让骨架用模板原样跑起来——不要手写这些组件
- 风格：模板原样起步即可（黑白灰 New York 风），**后续再按拍板逐步改 D-CON**；"骨架期不做视觉主张"的纪律不变（模板默认样式=无主张）
- 图表：ECharts 为主（数据图）；shadcn 自带 Recharts 图表容器可先占位，正式图表统一 ECharts 且要求好看（dataviz 规范）
- 动效参考：Aceternity UI（按需，不强求）
- **知识库（B8 才做，现在只需知道）**：届时从 ContentRadar 仓复制编辑器/文档树/@双链代码改造，绝不改 CR 原仓
- **导航布局暂缓硬编码**：顶栏 vs 侧栏正在调研终裁（老板指定参考蝉妈妈精细化 or dashboard-01 侧栏）——布局壳先做成**可切换**（layout 组件抽象出 nav 位置），或先按 dashboard-01 侧栏跑通、等终裁一次替换。路由树/mock/页面骨架不受影响照做
- 状态：并入 F-001 执行


### F-001 终版指令（2026-08-18 老板拍板：侧栏先行）

- **布局定案（先行版）：可折叠侧栏**——直接用 shadcn dashboard-01 的原生 Sidebar 形态（默认展开 240px，可折叠 64px 图标栏），九项导航竖排：工作台/投放任务/数据分析/账户资源/自动化/商品素材/报告/知识库/集成与通知；**每项支持角标位**（工作台挂待处理数红点，先 mock）；底部=设置+用户区（照 dashboard-01 模式）
- **能用的全用**：dashboard-01 的 Sidebar/SidebarProvider/KPI 卡（section-cards）/图表容器/数据表格 block 全部拉进来直接改字段名用，不重写
- 图表：先用模板自带容器占位跑通，随后统一换 ECharts（中文/数据密集/好看，dataviz 规范）
- **保留切换能力**：layout 层抽象 nav 形态（side|top 一个配置切换）；顶栏版本先不做实现，**等 B1c 有真实数据页后 arch 会派 F-00x 任务出一版顶栏对比**，老板真页面对比拍板终选
- 其余（路由树/mock 层/状态文件/纪律）照 F-001 原指令
- 状态：待处理（本条为最终执行版）


---

### F-002 设计系统落地（⏸ 2026-08-19 挂起：视觉线改由老板直接对接）

> **本条不再由 arch 派发。** 老板拍板：D-CON token 落地推迟，先跑 shadcn 原生风格，后续精修；
> 视觉风格（配色/密度/圆角字号/chip 样式/图表观感/demo 文案清理/蝉妈妈风格融入）由**老板直接与前端会话对接**，arch 不介入、不提意见、不验收。
> 下方原始条目仅作参考存档，前端按老板口头指令为准。
> 其中第 2 条（空态/demo 态规范：绝不造假真实感数据）与第 3 条（响应式加法改造三禁忌）属**产品铁律非视觉主张**，仍然有效。

- 派活方：arch（已挂起）　日期：2026-08-19
- 交付物（apps/web）：
  1. **D-CON 设计系统完整落地**：PRD §5.1 所有 token（色阶/字号/间距/圆角/阴影）落 CSS variables；§5.2 组件规范（按钮/chip/表单/提示）全实现；§5.3 五大基础组件升级为生产规格（KPI 卡含趋势箭头+环比动效、数据表格虚拟滚动+列配置+排序导出、状态 chip 七态、数据健康横幅黄条+倒计时、详情抽屉 680px 三区）
  2. **空态与 demo 态规范**：空态=图标+一句话+解锁条件+CTA；demo 态=「示例」角标+降饱和+说明文案（绝不造假真实感数据）；五个空态场景实现（无权限/无数据/网络错误/搜索无结果/功能未开通）
  3. **响应式移动端适配**：Tailwind 加法改造（lg+ 值=原桌面值，往窄屏加 base/md 断点）；三禁忌（不改 base/不重构 DOM/不动 token-maxw-字号）；验收=桌面 ≥lg 改前后一致
  4. **动效细节**：骨架屏加载态、Toast 通知、抽屉滑入、表格行 hover、按钮 loading 态（参考 Aceternity UI 但不过度）
- 纪律：[fe] 前缀 fe/f002 分支；状态文件 docs/plans/F002-状态.md
- 状态：⏸ 挂起（视觉线转老板直接对接）


---

### F-003 核心数据页三页（2026-08-19 扩充批次）

- 派活方：arch　日期：2026-08-19
- **前置：F-001 骨架 + F-002 设计系统完成**；契约 `POST /api/v1/query` 已冻结
- 交付物（apps/web，三个 P0 页面生产实现）：
  1. **完整数据总表 `/data/table`**（PRD §2.3.2，老板点名）：TanStack Table + 虚拟滚动；列：账户/日期/全部指标字段（real_cpa/cash_cost/cost_space/gap 等 20+ 列）；列配置面板（显示/隐藏/拖拽排序）；筛选器（日期范围/账户多选/任务/owner）；排序（多列）；导出 xlsx（调 `POST /api/v1/export`）；分页（page_size=100）；**不聚合，明细行**
  2. **数据大盘 `/data`**（PRD §2.3.1）：顶部六 KPI 卡（消耗/真实CPA/达标率/成本空间/BI量级/待处理，含环比）；7 日趋势双轴图（消耗+CPA，ECharts）；健康度横幅（meta.data_as_of 驱动）；mock 调 `POST /api/v1/query?query_type=summary` + `query_type=trend`
  3. **维度透视 `/data/pivot`**（PRD §2.3.1）：顶部维度切换 tab（8 维度：task/biz/account/agent_type/resource_position/bid_tool/is_ubp/deduction_range）；透视表（TanStack Table，每维度值一行，列=全指标+环比，summary/dimension 同构）；环比口径切换（dod/wow）；筛选器；导出；mock 调 `POST /api/v1/query?query_type=dimension&dimension_type=task`
- 数据要求：mock 数据**口径自洽**（用 packages/domain 纯函数反推，别造出 real_cpa ≠ cost/real_conversion 的）；脱敏假名（账户A/B、任务X/Y）；环比 NEW/null 边界覆盖
- 纪律：[fe] 前缀 fe/f003 分支；状态文件 docs/plans/F003-状态.md；三页完成交 SHA 给 arch 验功能（列全不全/口径对不对/mock 契约一致）；**视觉不用截图，老板直接看**
- 状态：待处理（前置 F-001R 打回项修完）


---

### F-001R 骨架打回（2026-08-19 arch 验收 ❌ 不通过）

- 派活方：arch　日期：2026-08-19　交付方 SHA：`b8e1f78`（fe/f001）
- 验收结论：**build 过、5 条路由能渲染，但九项导航被 shadcn demo 数据覆盖、首页整页是 demo、存在口径 bug。结构层不通过，须修复后重交。**

#### 【职责边界 · 重要，先读这段】

2026-08-19 老板拍板分工调整：

| 谁管 | 管什么 |
|---|---|
| **老板（直接与你对话）** | 全部视觉风格：配色/底色/语义色/密度/圆角字号/chip 样式/图表观感/demo 文案清理/蝉妈妈风格融入。**视觉交付不用截图，老板直接看页面。** |
| **arch（本信箱）** | 功能/结构/口径/契约：导航项与路由树、页面模块完整性、指标口径正确性、mock 与 api.md 一致性 |

**本条打回单只含功能项，不含任何颜色/字号/间距/圆角/图表库要求**——那些听老板的。

三条防打架规矩（双向约束）：
1. 改风格**不许动**九项导航项与路由树（契约，改要经 arch）
2. 改风格**不许动** `lib/api/` 数据形状（对着 api.md，改要经 arch）
3. arch 的验收单**不提**视觉，老板的视觉指令**不改**结构

风格现状说明：**D-CON token 落地已推迟**（老板拍板：先跑 shadcn 原生黑白灰，后面精修）。你现在不用管主橙 #FF6A2C、#FAFAFB 底色这些，等老板发话。F-002 条目已挂起。

#### 【P0 必修 · 结构与口径】

**P0-1　九项导航被 shadcn demo 数据覆盖（最严重）**

现状侧栏：`工作台/生命周期/数据分析/项目/团队` + Documents 组`数据库/报告/文档助手` + `More`。
这是 `app-sidebar.tsx` 里 demo 的 navMain/navClouds/documents 直接翻译成中文。

- **少 6 项定稿导航**：投放任务、账户资源、自动化、商品素材、知识库、集成与通知
- **多 5 项 demo 垃圾**：生命周期、项目、团队、数据库、文档助手

你的 F001 状态文件写"恢复官方完整数据结构"——**恢复 demo 数据等于把业务导航覆盖掉了**。第一个 commit 的九项是对的，第二个 commit 改坏了。

要求：侧栏 navMain 严格等于 PRD §2.1 定稿九项，顺序不许变：

```
工作台 → 投放任务 → 数据分析 → 账户资源 → 自动化 → 商品素材 → 报告 → 知识库 → 集成与通知
/      /tasks    /data     /accounts /automation /materials /reports /knowledge /integrations
```

删掉 navClouds/documents/navSecondary 里所有 demo 项。底部保留设置+用户区（这个是对的）。

**P0-2　导航角标位缺失**

九项每项要支持角标（badge）插槽，先用 mock 数字：工作台挂待处理数（红点 + 数字）、集成与通知挂未读告警数。
**角标是当初选侧栏而非顶栏的决定性理由**（顶栏放不下九个角标），没角标等于白选侧栏。

**P0-3　首页 `/` 整页是 shadcn demo**

现状：示例公司 / Quick Create / 总收入·新客户·活跃账户·增长率 / Total Visitors / Eddie Lake / Cover page。
工作台（PRD §2.3.1，产品心脏）八个模块**一个都没有**。按 PRD §2.3.1 补齐骨架（有结构有 mock 数据即可，样式听老板）：

1. 顶部数据健康横幅（`meta.data_as_of` 驱动，不新鲜时黄条 + 执行入口置灰）
2. 六张概览卡：消耗 / 真实CPA（带考核价对比）/ 达标率 / 成本空间 / BI量级 / 待处理（带 P0 条数）
3. 今日待处理队列——**四件套缺一不可**：哪个户 / 为什么（含归因）/ 建议动作 / 执行入口按钮组
4. **「其余 N 个账户在阈值内」一行必须显示**（产品铁律：告诉用户可以不看什么，和告诉他看什么同等重要）
5. 忽略交互：一键 + 可选原因 chip（3 秒点选不打字）+ 户级静音 3 天
6. 昨日动作回收（T+1）：✅/❌ 两类结果
7. 我的待办（上级派发 / 自建分类计数）
8. AI 早报（可展开 + 发群按钮）

**P0-4　零消耗户口径 bug（不是视觉问题，是会误导决策的错）**

`/accounts` 账户D：今日消耗 ¥0.0、真实转化 0，却显示 `今日真实CPA ¥0.00` + 绿色达标勾。

按 `packages/contract/metrics.md`：**分母为 0 → null → 显 "−"**，零耗日剔除，达标判定应为"无数据"不是"达标"。

根因是前端自己算了数。**铁律：前端永不算数。** 达标判定/CPA/环比/零耗剔除全部由 `packages/domain` 纯函数出（Codex 已实现，56 单测全绿），前端只渲染后端给的值。请自查 `lib/` 里所有算数逻辑，全部改为读取 mock 响应里的既算好字段。

**P0-5　⌘K Agent 全局入口缺失**

PRD §2.1：全局抽屉 ⌘K（对话 + 对象搜索直达 + 最近访问）。现在没有入口。先做壳：⌘K 唤起 + 搜索框 + 空态，接 `GET /api/v1/search?q=`（非 LLM）。


---

### F-005 前端 Codex 接管：先完成真实工作台样板，再扩全站（2026-08-24）

- 派活方：老板
- 接管方：Codex（原 Claude 前端会话暂停）
- 状态：待处理
- 目标：接住当前已有工程、UI 资产和规范，不重复调研或重做 Demo；先把一个真实工作台首页做成可由老板审美拍板的生产样板，再把已批准的设计系统扩到其他页面。

#### 0. 开工前先保护现场

1. 当前分支实测为 `fe/f001`，HEAD=`6fa8021`；`apps/web` 存在一批未提交的删除、重命名和修改。禁止 `git reset --hard`、`git checkout --`、批量覆盖或删除；先逐文件审计并说明哪些保留、哪些有问题。
2. `docs/plans/F001-状态.md` 是旧快照，不能代替 live 仓库。当前 live `apps/web` 已有九个目录壳，但首页仍是英文 shadcn demo，mock 层、基础业务组件、Storybook、ECharts、主题 bridge 和正式回归均未完成。
3. 冻结 PRD 仍登记 `/tasks`、`/data`、`/materials`，当前未提交工作树改成了 `/campaigns`、`/analytics`、`/products`。先把此差异列为“契约待裁决”，不要自行来回重命名；第一批视觉工作不得顺手改变路由契约。
4. 只动 `apps/web` 前端范围及本任务自己的状态/来源/审核文件；不碰后端、契约和其他产品线。任何指标缺口回抛，不在前端发明口径。

#### 1. 必读顺序

1. 根 `AGENTS.md` 与 `apps/web/AGENTS.md`
2. `docs/20-PRD-v1.md` §2.1–2.3、§5，以及 `docs/14-老板需求追踪总表.md`
3. `packages/contract/api.md`、`packages/contract/metrics.md` 与相关 `packages/domain` 实现
4. `docs/frontend/ui-assets/前端交付总清单与未落地说明.md`
5. `docs/relay/F-004-前端UI资产与质量门禁.md`
6. `docs/frontend/ui-assets/frontend-product-standard.md`
7. `docs/frontend/ui-assets/前端视觉与体验审核清单.md`
8. `docs/frontend/ui-assets/agent-workflow.md` 与 `docs/frontend/ui-assets/README.md`

#### 2. 已有成果，禁止重复做

- 17 条 UI 产品线、7,056 条资产目录、官方规范、许可证边界、能力索引、免费替代、131 条缓存记录/144 份官方源码文件已经完成。先查 `docs/frontend/ui-assets/`，不要重新爬一遍组件库。
- 统一离线展厅：`docs/frontend/ui-assets/showroom.html`。它用于查 17 库风格和代表能力；产品源码只能从 `source-cache/manifest.json` 指向的官方 source 复制，不能从预编译 frame/bundle 反推。
- 规范实验室：`docs/frontend/ui-assets/standards-demo/index.html`。它用于对照字体、数字、密度、主题和动效，不是最终皮肤。
- shadcn 官方侧栏业务适配 Demo：`apps/ui-layout-demo/sidebar.html`；保留官方结构、token、密度和交互，只替换业务内容。
- shadcn 官方历史完整顶栏 Demo：`apps/ui-layout-demo/topbar.html`；COSS 产品顶栏对比：`apps/ui-layout-demo/topbar-coss.html`。三个入口彼此独立，禁止在用户界面增加“布局切换器”。当前正式产品先保持 live 侧栏，不自行替老板终选顶栏。
- KPI 真组件替换对比：`apps/ui-layout-demo/kpi-component-demo.html`。A=当前 shadcn，B=Tremor 官方统一趋势卡，C=Tremor 按指标语义组合；这是组件替换对比，不是配色 Demo。老板尚未最终拍板 B/C，不得静默选择。
- KPI 配色探索：`apps/ui-layout-demo/kpi-color-demo.html`。只能作为候选参考，不得把其中颜色直接写成全站不可调整规范。
- 已验收的产品文案/身份：`KA Pilot`、`快手优化师`、`账户池`；保留“更多”；首项业务任务为 `AAC 拉新`（无“闲鱼”前缀）；运行界面禁用“支付/支付 ROI/ROI”，趋势表达使用“消耗与真实 CPA”。
- 已有官方账户头像：`apps/ui-layout-demo/public/avatars/shadcn-morty-official.jpg`。需要进入正式前端时复制原文件并保留来源，不重新生成或裁截图。

#### 3. 组件来源优先级

- 页面壳、Sidebar、基础结构：shadcn/ui + 官方 Blocks。
- KPI/经营看板：先打开现成 KPI 对比 Demo；进入正式页前由老板拍板 B/C，选中后从 Tremor 官方源码适配。
- 日期、Command、Combobox、Field、Drawer、空态等细节：优先查 coss current；放 `components/coss/`，不得覆盖 shadcn primitives。
- Data Grid、复合筛选、列配置：ReUI/Dice/TanStack 同业务容器比较。
- Agent 对话、流式消息、工具调用、来源引用：Vercel AI Elements，不另造聊天 UI。
- Gantt/Kanban/Editor/Dropzone/复杂 Calendar：Kibo UI。
- 微动效：Animate UI/Motion Primitives/Aceternity/Magic UI/React Bits 少量使用，必须支持 `prefers-reduced-motion`。
- 正式业务图表：ECharts；Recharts 只保留已明确批准的轻量 sparkline 或模板占位。

#### 4. 第一批只做“工作台正式样板”

先不要铺九个页面。以当前侧栏壳为基线，把 `/` 做成真实业务样板，至少包含：

1. 数据健康横幅：由 `meta.data_as_of` 驱动；过期时明确警告并禁用执行入口。
2. 六个 KPI：消耗、真实 CPA（含考核价对比）、达标率、成本空间、BI 量级、待处理；前端只格式化，不计算指标。
3. 今日待处理队列：账户、原因/证据、建议动作、执行入口四件套；所有写操作先预览再确认。
4. “其余 N 个账户在阈值内”信息行。
5. 忽略/原因 chip/静音 3 天交互壳。
6. 昨日动作 T+1 回收、我的待办、AI 早报、P0/P1 警报监控区。
7. ⌘K Agent 壳：对象搜索、最近访问、AI 对话入口；搜索与 LLM 对话状态分开。

所有数据使用脱敏、自洽的 demo 响应，并显式标“示例”。零消耗、零转化、`null`、过期、部分失败、无权限等边界必须覆盖；分母为 0 时 CPA 显示 `−`，绝不能显示 `¥0.00` 或“达标”。

#### 5. 视觉执行方式

1. 不自己重新设计组件。优先整块复用已验证的 shadcn/Tremor/coss/AI Elements 官方源码，只写业务适配层。
2. 当前 shadcn neutral 偏灰。不要靠每张卡随意上色；建立“丰富中性色 + 一个品牌主色 + 独立状态色 + 独立图表色”的语义 token。`secondary`、`muted`、`accent` 不得继续全部映射同一灰阶。
3. 第一轮先在真实工作台数据上输出 2–3 个可运行视觉小样或同视口截图：至少含原 neutral、专业蓝、青绿经营；结构和数据完全相同。老板拍板后才写全局 token、commit 和扩页。
4. 页面大面积保持克制：颜色主要用于主操作、选中/焦点、关键趋势、状态和告警；状态色不作为装饰，图表色与状态色分池。
5. 字体、数字、金额、百分比、日期、密度、动效、focus、reduced motion 按 `frontend-product-standard.md`；规范是推荐基线，真实页面不好看时调整语义 token，并用跨页面/主题/视口证据说明。

#### 6. 工程门禁

- 组件先在 Storybook 或等价隔离页覆盖：normal/loading/empty/partial/stale/error/no-permission/disabled。
- 业务差异放 `components/business/` 薄适配层；第三方来源目录隔离并登记官方 URL、许可证、精确 ref/hash、本地路径和修改说明。
- 权限由服务端执行；前端隐藏按钮不等于权限控制。所有媒体写动作必须预览、二次确认、幂等和可追溯。
- 验证 TypeScript、ESLint、production build、1440/1366/390、light/dark/已发布 preset、键盘/focus/Escape、overlay 层级、reduced motion、console、加载/空/错/禁用。
- 视觉/UI 改动先把截图或本地入口给老板拍板；批准后才能 commit。被否方案整颗回退，不把试验样式混入正式代码。
- commit 使用 `[fe]` 前缀并路径限定；不 push。提交后 `git show --stat HEAD` 自查。

#### 7. 第一轮回执格式

1. live 基线审计：保留/问题/契约冲突/未提交文件归属。
2. 本轮只准备了什么视觉小样，入口和同视口截图在哪里。
3. 使用了哪些现成组件/源码，哪些没有重复做。
4. 老板需要拍板的选项：布局若仍涉及终选、KPI B/C、默认品牌色方向。
5. 测试结果与质量 P0/P1；未通过项不得写“完成”。
6. 老板批准后再返回正式实现 commit SHA、页面入口、Storybook/隔离页入口、来源清单和审核报告。


---

### F-006 前端：sidebar.html 起点 × integration-control 功能（2026-09-04 arch 接回；新开 Claude Code 会话执行，审美高级有质感）

- 派活方：arch　日期：2026-09-04　执行方：**新开 Claude Code 前端会话**（老板 9-5 定；复制 `docs/relay/F-006-前端开工提示词.md` 开场）。**审美标准：高级、有质感**，母版是起点不是天花板
- 老板拍板：视觉唯一母版 `apps/ui-layout-demo/sidebar.html`，其他全不要；功能起点 `main` 上的 `apps/web`（九项导航/八模块/六 KPI/⌘K/BFF 已在）；**不重做功能，套母版样式**；视觉老板一对一对话精修不截图，功能交 SHA 给 arch。
- 本批五页顺序（**老板 2026-09-05 深夜再改序**）：登录页 `/login`（组件库 shadcn login blocks，接 AUTH-001）→ 数据分析 `/data`（套样式+删三 tab，R-010a1 后能真联）→ 账户池 `/accounts`（**按 P09 库存流水线重定义，等契约 v1.5.1**）→ 工作台 `/`（等 v1.5.1 负责人视图 + R-010a2）→ 投放任务 `/tasks`（等 v1.5.1 阶段/就绪度）。
- 契约依据：api.md AUTH-001 + DATA-ROUTE-001 v1.2；metrics.md 缺数三态（显 −）；前端永不算数。
- **组件铁律**：先查 `docs/frontend/ui-assets/`（showroom/capabilities/source-cache）从官方源码复制，只写业务适配层，不自写组件；规则 `apps/web/AGENTS.md`，规范 `frontend-product-standard.md`，自检 `前端视觉与体验审核清单.md`。
- **页面规划**：`docs/relay/F-006-页面规划.md`（母版块×PRD 功能×接口，每页删什么加什么）。**联调**：本地联调前端做、每页做完就联；内网联调 OS agent。上一任 Codex 前端交接清单 `docs/frontend/ui-assets/本对话前端产出与交接清单-2026-09-05.md`；字体等老板拍板不动。
- 分支 `fe/f006`（从 `main@v0.2-unaudited-baseline`）；`[fe]` 路径限定；只动 `apps/web` 非 api；状态文件 `docs/plans/F006-状态.md`。
- F-001/F-001R/F-002/F-003/F-005 全部关闭归档（fe/f001 已废弃；F-005 成果已在 main）。
- 状态：待处理

#### F-006 顺序修订（老板 2026-09-05；arch 记录）

- 新顺序：**登录 → 账户池 → 数据分析 → 工作台 → 投放任务**。理由：先做能用真实奇航数据看的页面去联调（账户池 R-009 后、数据分析 R-010a1 后就能真联），工作台依赖 R-010a2 的工作项动作/coverage，放第四。
- 已经动手的工作台不作废：停在布局壳状态，视觉基调保留，转做登录页。
- 页头横幅按 `F-006-页面规划.md` 9-5 更新：常显「空间 · 来源 · 数据日期 · 更新时间 · 口径」；队列底部改「已检查 · 待检查 · 缺数无法判断」三数（api.md `meta.coverage`）。


#### 前端依赖安全门（arch 2026-09-05 转自 be P-041；不阻塞 F-006）

- `apps/web` `npm audit --omit=dev`：5 项（4 high / 1 moderate）——fast-uri、qs、PostCSS、sharp，链路指向 Next 15.5.23。后端三包为 0。
- 处理时机：F-006 五页做完后单独一批（F-007）；**红线：不要 `npm audit fix --force`**（会把 next 升到大版本破坏构建，CR 项目踩过）；先看 `npm audit` 建议的最小 patch 升级，Next 主版本升级单独拍板。
- 另：设置页要有「口径」tab（返点系数可改 + 变更记录），任务详情总览要有考核价/日预算卡改价入口——契约 api.md v1.4.1，页面排在 F-006 后。


#### F-006 顺序再改 + 三页等契约（老板 2026-09-05 深夜；arch 全量偏差审计后）

- 顺序：**登录 → 数据分析 → 账户池 → 工作台 → 投放任务**。
- 账户池、工作台、投放任务三页**等契约 v1.5.1**（账户池九态流水线/任务阶段与就绪度/工作台负责人视图/工作流节点模型），arch 冻完会重写页面规划 §1/§3/§5 并通知；登录与数据分析不受影响，先做。
- 偏差审计全文：`docs/decisions/2026-09-05-全量偏差审计.md`；原型图 `docs/prototypes/v2/` 是这三页的功能参考（视觉仍按 sidebar.html）。
