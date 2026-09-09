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

- 新顺序：**登录 → 账户池 → 数据分析 → 工作台 → 投放任务**。理由：先做能用真实启航数据看的页面去联调（账户池 R-009 后、数据分析 R-010a1 后就能真联），工作台依赖 R-010a2 的工作项动作/coverage，放第四。
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

- **v1.5.1 已冻（2026-09-05 深夜）**：页面规划 §1（工作台加待确认变更集/运行中工作流/负责人视图）、§3（账户池整节重写：九态流水线/分组/批量→变更集组/新建账户向导）、§5（任务列表就绪度六段+阶段；详情 SOP 步骤条/就绪度环/阻塞/八页签）已更新。三页可以按新规划开工画壳，字段对 `api.md` v1.5.1；真联等 R-014。工作流画布按 `workflow-graph/v1` 节点模型（React Flow）。


### F-007 前端全铺开（2026-09-06 arch；老板拍板：契约全冻、前端一次铺开、老板逐页精修）

- 派活方：arch　开场：`docs/relay/F-007-前端全铺开提示词.md`（老板复制给前端会话）+ `docs/relay/F-007-全站页面清单.md`（每页做什么/用哪块/契约在哪/fixture 在哪/八态/验收句）。
- fixtures：`packages/contract/fixtures/`（126 个，索引 `README.md`），fixture 即契约；缺的在状态文件写 `TODO-fixture:<路径>`。
- 顺序：登录 → 数据分析 → 账户池 → 工作台 → 投放任务 → 自动化 → 报告 → 集成 → 知识库 → 商品素材 → 设置 → 治理后台 → Agent 抽屉/⌘K。连续做，不等审；每页 commit + 状态文件 `docs/plans/F007-状态.md`。
- 前五页做完发 SHA 给 arch 验功能；视觉老板一对一。
- 状态：待处理（等老板把提示词交给前端会话）


### F-006-Q1～Q5 arch 裁决（2026-09-06）

| 问 | 裁决 |
|---|---|
| Q1 git 事故 | 知悉，处置正确；主目录只归 arch，你在 `/private/tmp/ka-fe-f006` 干活。 |
| Q1-a 健康横幅 BFF | ✅ 冻 `GET /api/internal/system/health`（v1.7.1），DTO 用 `fixtures/system/health.json`（overall 三色 + 各源 dataAsOf/coverage/etl），别用你提的 `{state}` 简版；R-010a1 实现。 |
| Q1-b 环比 + 考核价 | ✅ v3 行 `assessment.price` 已有；环比冻为 `params.compare=dod\|wow` → `compare.deltas`（v1.7.1）；R-010a1。 |
| Q1-c 其余 N 户 | ✅ 已冻 `meta.coverage` 三态（api.md「覆盖三态」，fixture `work-item-list/coverage-*.json`）：只有 `pending=0 && undeterminable=0` 才写"其余 N 户在阈值内"。 |
| Q1-d 值班/升级 | ✅ v1.4 已冻 `GET /alerts/stream` + roster/policies，fixtures `alerts/*.json`；R-012。 |
| Q1-e 侧栏 badge | ✅ 冻 `GET /api/internal/me/counts`（v1.7.1，fixture `me/counts.json`）；不塞进 session 响应（AUTH-001 冻结）。 |
| Q2 主题偏好 | ✅ 采纳思路，落点改为独立 `GET/PATCH /api/internal/me/preferences`（identity 级，表 `identity_preferences`），不改 session 响应；fixture `me/preferences.json`；R-014。前端先 localStorage，接口到了覆盖。 |
| Q3 AI 助手三契约 | ✅ 全部采纳：`GET /api/internal/agent/models`（fixture `agent/models.json`，来自网关能力表，unverified 灰显）；会话/消息 SSE/事件/上下文四条 BFF 路径已冻（v1.7.1）；`context` 里 **不带 workspaceId**（Session 决定），accounts 服务端校 scope。R-010b。写操作仍走变更集，AI 不直接执行。 |
| Q4 账户池字段 | ❌ 不用你的八态 `lifecycle.stage`；老板 9-5 深夜已按原型 P09 拍 **九态 `poolStatus`**（可用/已分配/待开户/待充值/待搭建/在投/暂停/关闭/异常）+ 投放六态 `lifecycleStage` + `product.name` + `tags` + `balance.cutoff`，契约 v1.5.1、fixture `accounts/list-v151.json`、页面规划 §3 已重写（流水线九卡/分组开关/12 列/批量→变更集组/新建账户向导）。你现在做的"分层卡/流程条/看板三种可切"可以保留为展示形式，但数据枚举改成九态，产品字段用 `product.name`。 |
| Q5 登录图 | ✅ 已派 Codex（inbox-codex「R-FE-IMG-001」，brief 原样转），图到会写路径回你。 |
| 存档点 `449ccec` | 范围合规（只动 apps/web + docs + ui-layout-demo；lib/data 只加了 `account-lifecycle.ts` 与 `mock-data.ts`）；arch 复跑 test/tsc/lint 后 `--no-ff` 合入 main，**顺序在 R-009 二批之后**（两边都动了 `mock-data.ts`，我来解冲突）。合入后你 `git merge main` 一次。 |

- 另：**F-007 已派**（上一条），全站顺序与每页契约/fixture 见 `F-007-全站页面清单.md`；你状态文件里那张"全前端铺开清单"以 F-007 为准（路由按视图收敛改成 tab）。fixtures 现在 143 个，`packages/contract/fixtures/README.md` 索引。

- **存档点 449ccec 复跑结果（arch 2026-09-06，在 /private/tmp/ka-fe-f006 @724843e）**：`npm test` 77/77 ✅；eslint 0 错 7 警告 ✅；**tsc 1 错 ❌**：`lib/fixtures/data-analysis.ts(99,72)` 访问 `.message`，但 union 里 `{dimension,hint}` 分支没有 `message`（你合 main 后我新加的 `data-query/dimension-unsupported.json` 形状是 `{ok:false,error:{code,message,retryable,requestId,dimension,hint}}`，按 error 信封取 `error.message`）。修完在 fe/f006 追加一笔 commit 并回 SHA，我再合。


### F-007 页 1 `a4fcbc9` 复跑 ✅ + TODO-fixture 已补 + 请合 main（arch 2026-09-06）

- 复跑：test 77/0、tsc 0 错、eslint 0 错 7 warn；范围合规。继续页 2 账户池。
- 三组 TODO-fixture 已补 9 个（main `89649fa`，索引 README 已更）：
  - `data-query/dimension-v3-{task,biz,account,agent_type,deduction_range}.json`——**扣量桶按契约是 `[0,10)|[10,30)|[30,+)`**（你自造的 0–5%/5–10% 桶改掉）；`agent_type` 行带 `agent_type:"agency"|"self"` + `agency_name`；account 版含一行缺数（三态 missing / 比率 undefined / costStatus gray），拿它验 − 与灰。
  - `data-query/gap-{task,biz}.json`（biz 含备用户 missing 行）。
  - `data-query/pivot2-biz-resource_position.json`（4 格 1 undeterminable，`meta.cellCoverage`）+ `pivot2-unsupported.json`（bid_tool → `DIMENSION_UNSUPPORTED`，预设「出价工具×任务」整张显示例角标 + hint）。
- **合 main**：main 已合 R-009 二批（`232aca5`，含 `apps/web/lib/data/` 14 文件 + `app/api`）。请在 fe/f006 `git merge main`：
  - `apps/web/lib/data/mock-data.ts` 会冲突 → **一律取 main 版**（`git checkout main -- apps/web/lib/data/mock-data.ts`）；你 F-006 补的 21 户如页面还依赖，搬到 `lib/fixtures/`；`lib/data/account-lifecycle.ts` 同理搬走（lib/data 归后端，F-007 起你不再动它）。
  - 合完跑 test/tsc/lint，SHA 发我，我把 fe/f006 合进 main（此后每次 SHA 我都合，你不用等）。
- C3 分层叫法：转老板拍，结果我回你；在此之前按你现在的两层做不用停。

#### C3 老板已拍（2026-09-06）：顶部分层卡叫「账户状态」（九态 poolStatus），表列叫「投放阶段」（生命周期字段）
- 两层就这么叫，功能按你现在的做法不变；状态文件冲突点 C3 可以打勾。


### F-007 前五页 `b5c4ad4` 复跑 ✅ + 第二批 TODO-fixture 已补 + 三件要你做（arch 2026-09-06）

- 复跑（f0e417a）：test 77/0、tsc 0 错、eslint 0 错 12 warn ✅。范围：页 2/4 对 `lib/data` 只有删私拷 + `mock-data.ts` 一处改，可接受；F-007 起 lib/data 不再动。
- TODO-fixture 第二批已补（main HEAD，README 已索引，fixtures 159）：
  - `accounts/detail-account-2.json`（red + cutoff critical）、`accounts/detail-account-5.json`（当日缺数全 −）、`accounts/timeline-account-2.json`、`accounts/structure-account-2.json`（含 junk 单元）——其他账户显诚实空态即可，契约同一 DTO。
  - `accounts/trend-account-1.json`（account.trend/v3 单账户，lineage.accountScope）。
  - `tasks/list-v151.json` +2 条：`fixture-task-ended`（closed，进「已结束」tab）、`fixture-task-review`（reviewing，红）；关注 tab 用 `me/watchlist.json`（已有，按 media+accountId 过滤任务账户）。
  - `rules/bindings-fixture-task-ready.json` —— 新端点 `GET /tasks/:id/bindings`（v1.7.3），详情「SOP 与自动化」改读它，**别再显全局规则冒充**。
  - 上一批 9 个（8 维/gap/pivot2）里 **8 处 costStatus 我造错了已修**（yellow 必须 onTarget=true/`day_over_window_ok`；缺数 = `costStatus:null` + `cash_missing`，没有 gray/no_data）；`lineage.authority` 补齐。你页 1 若按旧值写死了色标映射，改成只读 `costStatus`。
- **三件要你做**：
  1. 工作树里未提交的 `package.json` 多了 `"cn": "^0.2.5"`——这是个无关的 npm 包，不是 `cn()` 工具（仓里 `lib/utils` 已有），删掉再装；`@xyflow/react` 保留（画布用）。
  2. **合 main**：`git merge main`。`apps/web/lib/data/mock-data.ts` 会冲突 → 取 main 版（`git checkout main -- apps/web/lib/data/mock-data.ts`），页面如依赖你改的那几行，搬到 `lib/fixtures/`。合完 test/tsc/lint，SHA 发我，我合 fe/f006 进 main；之后每个 SHA 我即合，你不用攒五页。
  3. C3 老板已拍：顶部「账户状态」、列「投放阶段」（前一条）。
- 继续页 5 自动化。画布节点模型按 `workflows/graph-v1.json`。


### F-007 页 5–11 `9cca12d` 复跑 ✅ + 契约缺口 G1–G9 全裁（arch 2026-09-06，契约 v1.7.4）

- 复跑：test 77/0、tsc 0、eslint 0 错 12 warn；页 5–11 全在 apps/web，lib/data 未碰 ✅。未提交的 AI Elements 依赖（streamdown/shiki/motion 等）是页 12 要的，随页 12 一起提交即可；`cn` 已不在，好。
- G1–G9 裁决全文在 api.md「v1.7.4 追加」，摘要：G1 素材列表加 `ratios.cvr`；G2 watchlist 项加 `type:"account"|"task"` + `GET /tasks?starred=true`；G3 用 v1.7.3 `GET /tasks/:id/bindings`；G4 runs 列表加 `taskId`；G5 不加端点，chip 走下一条消息的 `context`（v1.7.1）；G6 search `type` 五类冻结 + item 形状；G7 确认无文件夹实体、有子节点即文件夹；G8 日报加 `delivery:{status,at,target}`；G9 `GET /me/workload` 计数 DTO，负载分老板未定 → `not_configured` 显 −。
- 你 TODO-fixture 第三批我看到了（explain 多规则、run-events 失败例、graph 多模板、daily 多角色、library、connections 断连、kb 多篇、materials cvr、admin grants、workload）——按优先级补，先给 workload/search/watchlist-task/daily delivery 四个新 DTO 的 fixture，其余按页精修时补；你现有"诚实空态 + 注明"的做法对。
- **合 main 别再拖**：main 现在多了 R-009 二批 + be/r010 两轮（`lib/data`/`app/api` 都动了）+ 契约 v1.7.2–1.7.4 + fixtures 159。页 12 做完立刻 `git merge main`（`lib/data/mock-data.ts` 取 main 版），跑 test/tsc/lint，SHA 发我。


### F-007 全站 12 页已合 main `32fe9ae`；下一阶段 = 老板逐页精修（arch 2026-09-06 深夜）

- fe/f006 @ dea721b 已 --no-ff 合进 main（177 个 UI 文件 + ui-layout-demo + docs/frontend）；`lib/data`/`app/api` 合流结果与 main 一致，你没越界。arch 复跑：tsc 0、eslint 0 错 12 warn、**web test 109/2 fail**——那 2 个是 main 侧 lib/data 的 v2 权威样例测试（fixtures 已升 v3，后端 be/r010 同轮合流已带 v3 适配），不是你的页面；以合流后 `16b7063` 的复跑为准（P-103）。
- 工作树规则已写 docs/23；你的 `/Users/aik/ka-fe-f006` 保持。**现在 `git merge main`**（main 含 be/r010 两轮 + 契约 v1.7.4/1.7.5 + fixtures 159 已同步 priceSource/三键/attempt 级），合完把 3401 起起来给老板精修。
- 旧分支 `codex/fe-functional-bff-v2`、`codex/fe-task5-session-bff` 已被 R-009 二批的 BFF/v2 适配取代，`codex/personal-team-task4/5/6` 由 R-009/R-011 取代；等老板点头后删，你不用管。
- 精修期纪律：老板口头改 → 你直接改 → 每页一 commit → SHA 发我即合；视觉改动不动导航/路由/数据形状；契约缺口继续写 inbox-arch。


### 登录页参考与方向（arch 2026-09-07；老板看完参考后）
- 参考截图在 `docs/frontend/references/login-2026-09-07/`（巨量引擎/磁力金牛/腾讯营销/Vercel）。结构照巨量：**亮色浅底全幅图 + 左上大标题（产品名 + 一句定位）+ 右侧浮起登录卡**；你现在的分屏改成这个"全幅底图 + 浮卡"即可，图位先用浅色占位，别再用黑底光谱。
- 图由 Codex 重做（R-FE-IMG-002，三方向），老板挑；三张都不要就切 Vercel 式无图纯表单（居中卡，去掉左栏）。两种壳都先备好，切换只改一个开关。


### 回改批 `3d7fef5` 复跑 ✅ 已合 main；C6 已定；继续 §13（arch 2026-09-07）
- 复跑：test 140/0、tsc 0、eslint 0 错 12 warn；16 文件全在 apps/web ✅。已 --no-ff 合进 main，连同 Codex 的 F-P103-1 诊断测试。
- **C6**：以老板 D1 为准，默认 `bw`；fixture `me/preferences.json` 已改成 `bw`，不用再问老板。
- 下一步照你说的：§13 v1.7 九块按页开做（fixtures 都在 main），老板精修并行；每页一 commit、SHA 发我即合。合 main 前先 `git merge main`（含本条与 C6 fixture）。
- 磁盘：已清 4G，Docker 跑测试时会临时吃十几 G 再回收，你起 dev server 前看一眼 `df -h`，低于 5G 先喊我。


### §13 九块 `e7a08de`～`73d594c` 复跑 ✅ 已合 main；第三批 fixture 已补（arch 2026-09-07）
- 140/0、tsc 0、eslint 0 错；17 文件全在 apps/web。已 --no-ff 合进 main `5b9db7c`。
- 第三批 fixture（main HEAD，README「2026-09-07 第三批」）：`me/workload.json`、`system/search.json`（五类 + subtitle，**旧 label 改 title**）、`me/watchlist.json`（+task 项）、`reports/daily-v1.json` 加 `delivery` + `daily-v1-not-sent.json`、`materials/list.json` 加 `ratios.cvr`、`summary-window-v3-conversion-missing.json`、`rules/explain-7.json`/`explain-9.json`、`agent/run-events-1802.json`（失败 run）、`integrations/connections.json`（+degraded/disconnected）、`admin/grants-member-2.json`、`tasks/attribution-cost.json`、`strategies/detail-3002.json`。`git merge main` 后按页接上，search 的 label→title 要改一处。
- 之后就是老板精修；每页一 commit、SHA 发我。


### F-008 页面齐全性补漏（arch 2026-09-07；老板问"页面是否齐全"审计结果）

对照 PRD 路由表 33 条 + F-007 清单 + 实际 `apps/web/app`：**全部 PRD 路由都有落点**（路由或页内 tab），下面是审出来的漏项，按优先级做，穿插在老板精修之间：

| # | 项 | 优先级 | 做法 | 契约 |
|---|---|---|---|---|
| F8-1 | **移动端值班最小路径**（PRD P1，之前清单漏了） | P1 | 只保三处手机可用：工作项详情、变更集确认弹层、数据健康横幅；其余页 `<md` 顶部「请到桌面处理」条 + 写动作禁用 | 无 |
| F8-2 | **错误页壳**：404 / 500 / 403 | P1 | `app/not-found.tsx`、`app/(main)/error.tsx`、403 组件复用 admin 锁页；500 显 requestId + 重试 | v1.7.6 |
| F8-3 | **账号安全**：改密码 | P1 | 设置「三凭证」tab 内加「账号安全」块（当前密码/新密码/确认；成功后提示其他设备已下线） | v1.7.6 `POST /auth/password`；fixture 由 arch 补 |
| F8-4 | 工作项详情路由正名 `/work-items/[id]` | P2 | 现 `/diagnostics/[findingId]` 保留 301；所有链接改新路径 | 无 |
| F8-5 | 铃铛下拉「最近通知」 | P2 | 侧栏铃铛点开显最近 10 条（复用 `integrations/messages` 形状）+「查看全部」→ 集成/消息记录 tab | 无（复用） |
| F8-6 | 首次登录引导条 | P2 | 三凭证任一未绑 → 工作台顶部横幅「先绑定 X 才能拉数」→ 跳设置；不做向导页 | 无 |
| F8-7 | 上线前清理 `/login/candidates`、`/login/directions` | 老板拍登录壳后 | 删路由与组件 | — |

已确认齐的（不用动）：Agent/OS 运行监控（在自动化·运行中心）、主题偏好（theme-switch）、空间切换器、导出记录（报告 tab）、协作中心（工作台协作 tab）、公共资产（治理后台资产 tab）。


### 登录页定案：不用生成图，就用你现在做的（老板 2026-09-07）
- 老板看了两轮候选，决定**不用图**：登录页保持你现有的实现（D9 分屏 + 你现在的左栏处理），不再等 Codex 的图，也不用做"全幅底图 + 浮卡"那套壳。把"等图"的占位逻辑收干净，左栏用你自己的方案定稿即可。
- `/login/candidates`、`/login/directions` 两个演示路由现在可以删（F8-7 提前）。


### 自审两批 `876b4ca` 复跑 ✅ 已合 main `f0233eb`（arch 2026-09-07）
- 140/0、tsc 0、eslint 0 错，54 文件全在 apps/web。commit 前缀请回 `[fe]`。`git merge main` 后接着老板精修与 F-008。


### 自审 3 `e9771fc` ✅ 已合 main `ffa6c6c`；F8-2 记完成（arch 2026-09-07）
- 404/错误边界/个人资料/死链修 全过，范围合规。F-008 里 F8-2 打勾；F8-3 账号安全（改密码）等我补 fixture 后做；F8-1 移动端最小路径仍是 P1。`git merge main` 后继续。


### 自审 4/5 `c9f382c` ✅ 合 main `e5ef145`；G10–G13 全裁（契约 v1.7.8）（arch 2026-09-07）
- 140/0、tsc 0、eslint 0 错，范围合规。**F-008 里 F8-2/F8-5/F8-6 你已顺手做完**，剩 F8-1（移动端值班最小路径，P1）、F8-3（改密码表单，等端点）、F8-4（工作项路由正名）、F8-7（登录演示路由清理，可以做了）。
- G10 通知流：`GET /me/notifications` + `POST /me/notifications/read`，五个 kind、未读数与 `me/counts` 同源；fixture `me/notifications.json`（含空态）已在 main —— 把你现在三 fixture 合并的临时做法换成读它。
- G11 改密码：端点 `POST /auth/password`（v1.7.6），成功响应 `{changedAt, otherSessionsRevoked}`；fixture `auth/password-changed.json` / `password-error.json`。可以把「找管理员重置」换成真表单（走 fixture）。
- G12 `/403` 确认保留；BFF 遇 FORBIDDEN/NOT_A_MEMBER 跳 `/403?from=<path>`，`/admin` 非 admin 仍就地锁页。
- G13 watchlist 的 `type` fixture 已在 main，合了就有 task 项。
- commit 前缀仍请回 `[fe]`。


### 自审 6–13 `26afe2f` ✅ 全部合 main `6509387`（arch 2026-09-07）
- 140/0、tsc 0、eslint 0 错，60 文件全在 apps/web，未碰 lib/data 与 app/api。这批「把界面上的技术词换成人话」做得对，继续。
- 提醒两件：① commit 前缀还是 `[fe]`（现在是 `fe(自审N)`）；② 账户池那个「全部 5 / 投放中 18」自相矛盾是好发现——这类**同页数字对不上**的问题，看到就记进状态文件的「冲突点」，我在契约侧一起看。
- F-008 剩余：F8-1 移动端值班最小路径（P1）、F8-3 改密码表单（fixture `auth/password-changed.json` 已在 main，可以做了）、F8-4 工作项路由正名、F8-7 登录演示路由清理（登录页已定案用你现有的，可以删了）。


### 契约 v1.8：归属清洗页（治理后台第七个 tab）+ 一条全局铁律（arch 2026-09-07）

- **老板铁律**：系统里凡是「归属」性质的字段，**都必须有页面能人工改，且改完不被自动流程覆盖**。你在做的页面里凡涉及归属（任务归属、账户负责人、账户状态、以后的昵称解析各段），都要有改的入口和「已人工修改」的标记。
- **新页面：治理后台加第七个 tab「归属清洗」**（`/admin?tab=naming`）。不新开一级路由，按视图收敛原则做成 tab。四块：
  1. **规范模板**（按渠道切换：快手/腾讯/字节各一套）：12 段的定义表，可加分隔符（半角/全角减号、下划线、空格）。**改的时候旁边有个「干跑」框**：贴一批账户名进去，实时看每条解析成什么、命中率多少，满意了才保存。
  2. **待确认列表**：五种状态过滤 —— 解析成功 / 部分成功 / 解析失败 / **冲突** / 已确认。冲突那栏最重要，要能并排看「昵称说什么 vs 平台说什么」，人工选一边。
  3. **单条编辑抽屉**：12 段每段可改，改过的段打「人工」角标（这就是 override，永久优先）。
  4. **批量确认**：解析成功的一键全过。
- fixture 我随后补（`admin/naming-rules.json`、`admin/account-names.json` 五种状态各一例、`admin/naming-rules-test.json` 干跑结果）。**先按契约 api.md「v1.8 追加」把壳和交互做出来**，老板说了页面出来后不对再改。
- 另外：账户池、账户详情、数据分析里这些维度（流量版位/出价模式/设备/出价目标/RTA/运营方/优化师/专项/承接/增量扣量）以后带 `source` 字段（nickname / platform / manual / qihang），显个小角标让人知道这个值哪来的。


### 契约 v1.9：搜索结果的中文由你组装（arch 2026-09-07）
- `system/search` 的 `items[]` **去掉了 `subtitle`**，改成结构化 `meta:{status?, stage?, taskName?, accountCount?, severity?, kind?, durationMs?, analysisVersion?}`，**中文副标题由前端组装**。这跟你刚做完的「去黑话」是一条线：后端只出机器值，文案归前端。fixture 已更新（`fb590a1`），`git merge main` 后按 meta 拼即可。
- work_item 的 href 已正名为 `/work-items/<id>`（v1.7.6），fixture 同步改了。你那边如果还有指向 `/?tab=today&item=` 的链接，一并改掉（F8-4）。


### 开发服务器内存纪律（arch 2026-09-08；今天已两次把 PostgreSQL 挤挂）
- 你的 `next dev -p 3401` 长跑后 RSS 到 3.5G（昨天 8.6G），机器内存一到 <30% Docker 里的 PG 就被系统杀，三边门禁和联调全停。
- **规矩**：① 每 2 小时或每交一批后 `lsof -ti :3401 | xargs kill` 重起一次；② 老板看页面时用生产模式（`npm run build && next start -p 3401`，每页 5ms，dev 每页几十秒），dev 只在改代码时开；③ 不用时关掉。
- 我这边只跑 3411（生产模式）和 3111，门禁分包串行，已把峰值压到最低。


### fixture 英文文案 ✅ 已改（arch 2026-09-08）
你报的两处 + 全量扫描另外四处（timeline-account-2、me/notifications 审批标题、tasks/timeline、workflows/definitions 描述）都改成「计划/单元/创意」了，并冻成契约 v1.9.1：后端拼给人看的文案一律中文，机器枚举不受限。`git merge main` 即得。
自审 34 批完成回执收到，门禁跑完合。头像 12 张已派 Codex（R-FE-IMG-003）。

### F8-3 ✅ 已合 main `d41b1e5`；F8-1 `c03887b` 门禁中（arch 2026-09-09）
- `fe/f006 @ a1d602a`（改密码表单）合 main = `d41b1e5`，web 222/0。后端 `POST /auth/password` 还没做（be2 排在 R-017 之后），你这页接真后端前会 404，空态/错误态先按契约 v1.7.6 fixture 走。
- `c03887b`（F8-1 移动端值班最小路径）跑 web 门禁中，绿了就合。

### F8-1 ✅ 已合 main `10c26cf`（arch 2026-09-09）
web 222/0。

### F8-8 派活（演示 P0，插队做）：任务详情 overview 接真后端 `GET /tasks/:id`（arch 2026-09-09）
后端已落 main 并在联调环境实测通（be2 D5b，`24ede2d`）。你这边缺两样：
1. **BFF 透传**：`apps/web/app/api/internal/tasks/[taskId]/route.ts` 现在没有（只有 `bindings/`、`readiness/`），浏览器打 `/api/internal/tasks/1803240580` 是 404。加一个 GET 透传到 data-api `GET /api/v1/tasks/:id`，照你其它透传的写法（带 session cookie，不带服务令牌到浏览器）。
2. **页面接线**：`app/(main)/tasks/[taskId]/page.tsx` 的 overview 页签从 `lib/fixtures/tasks.ts` 切到真数据；其余七个页签暂时保持 fixture，`tabs` 数组以响应为准。

契约 = v1.5.1 ②，fixture `packages/contract/fixtures/task-detail/overview-v151.json`。**实测响应与 fixture 顶层/overview 键逐一相同**（缺 0 多 0），真数据长这样：
- `stage {value:"preparing", source:"system", changedAt:null}`；`readiness` 六段各带 `ratio{value,state}` + `ready` + `source`；`blockers[]` 混 `work_item`（带 severity P0/P2/opportunity）与 `readiness`（severity null）两种 kind；`sopProgress.steps[]` 六步、`at` 全 null；`tabs` 八个键。
- **恒 null 的七项**（`cost/costStatus/costStatusReason/onTarget/budgetUsageRate/budgetUsageDate/dailyBudgetCap`）等 Codex 两个源，前端显「待接源」空态，**不许显 0 或 —**；`achievementRate/timeProgress` 是 `{value:null,state:"undefined"}` 时同样空态；`targetVolume.availability:"missing"` 显缺数。
- `pacing` 为 null = 该任务没周期，不画进度条。
- 不存在的 id 返 404 `NOT_FOUND`，页面走你现有的 404 态。

顺带一条请你自查：`/api/internal/tasks/1803240580/readiness` 我用登录 cookie 打是 404（route 文件在），看是路径段还是必填参数的问题，回执里说一句。

### 归属清洗三份 fixture 已补 + F8-9 派活：BFF 补 admin 归属清洗透传（arch 2026-09-09）
- `packages/contract/fixtures/admin/naming-rules.json`、`account-names.json`、`naming-rules-test.json` 已进 main，全部取自真后端响应（快手 v1 规范 13 段、6 户 5 partial/1 failed、干跑 3 条 hitRate 0）。请把 `lib/fixtures/naming.ts` 的示例换成 import 这三份，「示例」角标去掉。
- 你三点确认：1 干跑本地预览 → 后端 `POST /admin/naming-rules/test` **已经活了**，切成调接口；2 fixture 已补；3 冲突处理按你写的，冻结。
- **F8-9**：`apps/web/app/api/internal/admin/` 现在只有 `calendar/ members/`，缺归属清洗四条透传：`GET/PUT admin/naming-rules?media=`、`POST admin/naming-rules/test?media=`、`GET admin/account-names?media=&status=&q=&page=`、`PATCH admin/account-names/[media]/[accountId]`、`POST admin/account-names/confirm`、`POST admin/account-names/reparse`。都要 admin 角色（后端返 403 时页面显「需要管理员」，不要吞成空态）。做完连同 F8-8 一起交。

### 45fc9b80 ✅ 已合 main `3dfd867`（arch 2026-09-09）
web 222/0。联调环境已切到这版（build `JlrQ6iY8OrR6VUte7_Tw7`），`/admin?tab=naming` 200。接下来按上面 F8-8、F8-9 做，三份 naming fixture 已在 main。

### 8af3c77 ✅ 已合 main（集成页崩溃修，web 222/0）（arch 2026-09-09）
联调环境重建到这版；老板报的集成页 `config.robots` 崩溃在 `/integrations` 复验。

### F8-10（P0，内测第一印象，插在 F8-8 前）：内网打不到外网资源 → 登录页缺图；Windows 字体先跳后换（arch 2026-09-09，老板看内网部署反馈「变形、不顺畅」）
内网沙箱出网只放行两个素材 CDN 域名，**任何运行时外链都拉不到**。核到：
1. `components/business/auth/login-directions.tsx:32-33` 两张 Unsplash 背景图（`IMAGE_WAVES / IMAGE_CUBES`），`app/(auth)/login/page.tsx` 在用 → 内网登录页背景空白。**改成仓库内本地图**（`public/login/*.webp`，各压到 ≤300KB；或直接用你 C2-5 那种纯 CSS/canvas 背景不带图）。老板 9-7 定过「不用生成图，用现有登录页」，所以换本地图即可，不要再去外网取。
2. 加一条守卫测试：`apps/web` 的 `app/ components/ lib/ *.tsx|*.ts|*.css` 里不许出现运行时外链（`https?://` 的图/脚本/样式/字体），白名单只有 `hwmov.a.kwimgs.com`、`tx2.a.yximgs.com`；注释里的来源链接不算（`diceui/registry.ai-sdk` 那几条是注释，确认一下）。
3. **Windows 字体**：`globals.css` 字体栈 Mac 走苹方、Windows 走自带 MiSans（300 个 unicode-range 切片，6.7MB，`font-display: swap`）。经公网代理慢时，Windows 先用微软雅黑排版、切片到了再换 → 行宽变、换行跳（老板说的「变形」）。做两件：① 给最常用切片（常用汉字 + 拉丁数字那几片）加 `<link rel=preload as=font>`；② 正文考虑 `font-display: optional`（慢网直接用雅黑不再跳），标题保留 swap。Mac 本地不受影响（苹方在栈里更前）。
4. **Windows 缩放**：内网同事多是 1366×768 + 125% 缩放，CSS 视口只有 1093px。用 Chrome 设备工具把宽度拨到 1093 和 1280 各过一遍全站 12 页：侧栏 + 内容不许横向滚动、表格容器自己滚、页头动作不折成两行。发现问题按响应式铁律只往窄处加规则（≥lg 不变）。
5. 交付时附三张截图：1093 宽登录页、1093 宽账户池、Network 面板里字体请求列表。

### F8-10 修订（P0）：「变形」根因已定位在我们自己的壳——最小宽 1290px（arch 2026-09-09，本地 headless Chrome 实测，证据 `docs/evidence/ui/2026-09-09-1093px/`）
老板说的不是登录页，是登录后**很多页面**在内网机器上变形。我把本地生产构建缩到 1093px（Windows 1366×768 @125% 的 CSS 视口）实测：**8 个页面全部横向溢出 32～197px**；1280 基本正常；1440 全正常。表在 evidence README，截图三张。
**根因（一处壳）**：
- `components/site-header.tsx:45-72`：面包屑 `Breadcrumb className="min-w-0 shrink-0"` + `BreadcrumbList flex-nowrap whitespace-nowrap`，右侧 `ml-auto` 簇 = ThemeSwitch 三个带字按钮（黑白/黑白+彩/全彩）+ 搜索框 + 铃铛 + 头像，全 `whitespace-nowrap`，页头 min-content ≈ **1002px**；侧栏固定 `SIDEBAR_WIDTH = 16rem`（272px + inset 16px）→ 壳最小 **1290px**。
- `SidebarInset`/`main`（`relative flex w-full flex-1 …`）没有 `min-w-0`，flex 子项默认 `min-width:auto`，被页头的 min-content 撑开，整个 main 右移出视口（实测 main.left=288、width=1002、right=1290）。
**修法（按顺序，先壳后页）**：
1. `SidebarInset`/`main` 加 `min-w-0 overflow-x-clip`；`header` 内层 `div.flex.w-full` 加 `min-w-0`；面包屑改 `min-w-0 shrink truncate`（只留末两级，前面省略）；ThemeSwitch **< xl 只显图标**（下拉三选）；搜索框 `< lg` 收成图标按钮；右簇 `gap-1`。目标：页头 min-content ≤ 560px。
2. 侧栏 `collapsible="icon"`，**< xl（1280）默认折叠成 3rem 图标栏**（`SidebarProvider defaultOpen` 按 `matchMedia('(min-width:1280px)')`，用户手动展开的状态照旧记 cookie）。
3. 页内：`accounts/pool-views.tsx` 九态卡 `grid-cols-9` → `grid-cols-5 xl:grid-cols-9`（或 `[repeat(auto-fit,minmax(112px,1fr))]`）；`tasks/task-detail-page.tsx` 的 `grid-cols-12` KPI → `md:grid-cols-6 xl:grid-cols-12`；`tasks-page.tsx` 同。表格已在容器内滚，不动。
4. 仍按响应式铁律：只往窄处加规则，≥1440 一像素不变。
**验收（硬）**：仓库新加 `scripts/ui/overflow-check.mjs`（headless Chrome + CDP，用法在文件头），跑出 **1093 与 1280 两档 8 页横向溢出全 0px**，把输出表贴回执；再手动过全站 12 页两档宽度，附 1093 账户池、任务详情、工作台三张截图。
之前那条 F8-10 的 Unsplash 本地图、外链守卫、MiSans 预载/optional 三项照做，排在壳修之后。

### F8-10 验收补充：适配测试计划已出（arch 2026-09-09）
`docs/plans/2026-09-09-内测Mac-Win适配测试计划.md`：矩阵五档宽度 × 四浏览器 × 三主题；通过标准五条；你交付附 L1 脚本结果 + L2 三张截图。Win 上 MiSans 先雅黑后切换一次算正常，反复跳/换行不同才算 bug。

### F8-11（排在 F8-10 之后）：成员页「新增成员 / 重置密码」对话框（契约 v1.9.5）（arch 2026-09-09）
现在没有注册入口，内测同事由管理员在治理后台开。做三件：① 成员 tab 的「邀请」改成「新增成员」对话框：显示名（可中文）、登录名（ASCII，实时校验 `^[A-Za-z0-9._@-]{1,128}$`，中文提示「用拼音或工号」）、角色、可选初始密码；提交后弹「一次性初始密码」面板（复制按钮 + 「关闭后不再显示」），fixture `admin/member-created.json`；② 行动作「重置密码」→ 二次确认 → 同样一次性面板，fixture `admin/member-reset-password.json`；③ 成员行 `mustChangePassword=true` 显「未改初始密码」角标；该用户自己进设置页顶部提示「请修改初始密码」。BFF 透传两条 POST。

### F8-12（排在 F8-11 之后）：登录页「访客浏览」+ viewer 只读态（契约 v1.9.6）（arch 2026-09-09）
① 登录页加「访客浏览」按钮（`GET /auth/capabilities` 或 BFF 透出 `guestEnabled` 时才显示）；② viewer 会话：顶部常驻条「演示数据 · 只读 · 想用真数据找管理员开户」，所有写入口（新建/批量/导入/自定义列/确认/推送/导出）对 viewer 隐藏，治理后台入口隐藏；③ 空间切换器只显示演示空间。fixtures `auth/login-guest.json`、`session/guest.json`。

### F8-10 补证据：内网 Windows 实机截图（arch 2026-09-09）
`docs/evidence/ui/2026-09-09-内网Win-数据分析页-缩放80.png`：老板在内网 Win 机上把浏览器**缩到 80%** 才勉强放下（就是 1290px 壳最小宽的症状），侧栏占比过大、KPI 卡右侧被截；另外 ⌘K 面板在截图时是开着的（确认不是自动弹出）。修完请用同一台机 100% 缩放复验。

### F8-13（排在 F8-8 之后）：日报页接真后端 `GET /reports/daily`（arch 2026-09-09）
后端已合 main 并实测：13 模块、管理摘要六卡、trend 7 点、dim_task/dim_account/dim_biz 有行（行 = `account.dimension/v3` 行）、其余维度 `unsupported:true` 显「待接源」、`delivery.status=not_sent`、`actions` 双 false → 推送/PDF 按钮禁用带说明。BFF 透传 `GET /api/internal/reports/daily?date=&role=`；日期选择器默认昨天；fixture `reports/daily-v1.json`（已按 v1.9.2 更新）。

### F8-14（小）：错误码映射加 `RATE_LIMITED`（429，可重试）（arch 2026-09-09，v1.9.9）
改密/登录限速会回 `{code:"RATE_LIMITED", retryable:true}`；前端显「操作太频繁，15 分钟后再试」并保留表单内容，不当未知错误。`errorBody.retryable` 以后按码判，不再恒 false。

### F8-8 / F8-9 ✅ 已合 main `bd847313`，浏览器路径实测通（arch 2026-09-09）
- 联调（main @ 69b1582b，web build 新）：BFF `GET /api/internal/tasks/1803240580` 200、overview 19 键真数据；`admin/naming-rules?media=KUAISHOU`、`admin/account-names?media=KUAISHOU` 200；`/tasks/1803240580`、`/admin?tab=naming`、`/reports` 页面 200。
- readiness 只读 GET **不需要**，就用 `overview.readiness`；你的结论对。
- 「合完 main 主动扫新增 fixture 有没有页面接上」——好，立成你的交付自检项，我记进循环工程。
- **优先级提醒**：F8-10（壳最小宽 1290px）是内测第一印象的 P0，排在 F8-11/12/13/14 前面；交付带 `scripts/ui/overflow-check.mjs` 两档 0px 结果。

### F8-14 扩（v1.9.10）：共享稳定码枚举加 `NOT_FOUND / CONFLICT / RATE_LIMITED`（arch 2026-09-09）
be2 发现 BFF forwarder 只认 11 个共享码，后端正常返回的 404/409/429 被翻成 502「上游坏了」（kb 读不存在的文档、交接撞变更集、任务详情越权、改密限速）。他在 r014 forwarder 本地扩了，共享 `contracts.ts` 是你的：把三码并进枚举 + 状态映射 404/409/429，`retryable` 只有 RATE_LIMITED 为 true。

### F8-12 改口（v1.9.12）：演示空间不是新 kind（arch 2026-09-10）
访客会话的空间是 `kind:"team"` + `isDemo:true`（不再有 `demo` kind）。只读条按 `isDemo` 显「演示数据 · 只读」，写入口按 `role === "viewer"` 隐藏；空间切换器照常。fixtures `auth/login-guest.json`、`session-http/guest.json` 已更新。

### F8-13 改口 + 所有权知会（arch 2026-09-10）
be2 发现 kb / 账户交接 / 改密 / 日报四组端点在 BFF 里一条透传都没有，我把这四组透传**临时移交 be2**（`lib/data/r014/handlers.ts` + `app/api/internal/` 对应路由，Q-030，半天内到）。你 F8-13 只做日报页接真数据；改密表单、知识库页、交接对话框等 be2 透传到位后再接。F8-14（共享 `contracts.ts` 加 RATE_LIMITED / INVALID_CREDENTIALS / READ_ONLY_ROLE / NOT_FOUND / CONFLICT）仍归你，优先做——be2 的 forwarder 只在 r014 侧认了，别处解析还会当未知错误。F8-10 `e2b3bc10` 门禁中。

### F8-10 ✅ 已合 main `9c84581a`（arch 2026-09-10）
web 223 绿。我在本地生产构建上用 `scripts/ui/overflow-check.mjs` 复验三档（结果随后回你）；老板那台内网 Win 机等 OS 部署新版后再验 100% 缩放。接着 F8-14（共享错误码枚举）→ F8-13（日报页接线）→ F8-11/12。

### F8-10 复验 ✅（arch 2026-09-10）
本地生产构建 `scripts/ui/overflow-check.mjs`：1093 / 1280 / 1440 × 8 页 = 24 项横向溢出全 0px。截图入 `docs/evidence/ui/2026-09-09-1093px/after-1093-*.jpg`。剩内网 Win 真机 100% 缩放一验（等 OS 部署）。

### F8-14 + F8-10 收尾 ✅ 已合 main `53f2a215`（arch 2026-09-10 循环第 2 圈）
web 230 绿。演示环境重建中，我会验登录页无外链图、BFF 错误码映射（kb 不存在文档 → 404 NOT_FOUND）。接着 F8-13（日报页接线；be2 的透传 Q-030 到位后）→ F8-11（新增成员对话框）→ F8-12（访客只读态）。

### F8-10 收尾的一个部署副作用（arch 2026-09-10）
你让 `prepare-misans.mjs` 多生成 `preload.css` 并在 `layout.tsx` 引用——老树上 `misans.css` 在、`preload.css` 缺，`next build` 直接 Module not found（我联调环境撞上，演示站掉了几分钟）。CI 自检和 runbook 已改成两个文件都查、部署固定重跑脚本。以后**新增生成物**在回执里点名。另：登录页 HTML 里我没 grep 到 `rel="preload" as="font"`，预载是走 `<link>` 还是 CSS？回一句。
（补：预载链接我看到了，`href` 在 `as` 前面我 grep 漏了——登录页 2 条字体 preload 在，不用回。）

### 三问裁了 → v1.9.14；F8-11 收到（arch 2026-09-10 循环第 3 圈）
- ➊ `mustChangePassword` **加到 session 的 identity 上**（v1.9.14，be2 实现 Q-032，fixture 已加默认 false）；你先按 fixture 接提示条。
- 文案取舍**按你的**：RATE_LIMITED / READ_ONLY_ROLE 我们的，其余上游 message，冻结。
- `font-display: optional` **不做**，等预载版上内网实机复验再定。
- 两处哑功能修得对；`members-v195.json` 并回时我说。`52f5aee8` 门禁中。接 F8-12 → F8-13。
