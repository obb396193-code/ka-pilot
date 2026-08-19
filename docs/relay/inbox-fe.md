# fe（前端 Claude 会话）信箱

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

### F-002 设计系统落地（2026-08-19 扩充批次）

- 派活方：arch　日期：2026-08-19
- **前置：F-001 骨架完成；老板原型图拍板视觉方向**（Codex R-002 生图已完成但老板不满意不参考，等老板给新视觉拍板）
- 交付物（apps/web）：
  1. **D-CON 设计系统完整落地**：PRD §5.1 所有 token（色阶/字号/间距/圆角/阴影）落 CSS variables；§5.2 组件规范（按钮/chip/表单/提示）全实现；§5.3 五大基础组件升级为生产规格（KPI 卡含趋势箭头+环比动效、数据表格虚拟滚动+列配置+排序导出、状态 chip 七态、数据健康横幅黄条+倒计时、详情抽屉 680px 三区）
  2. **空态与 demo 态规范**：空态=图标+一句话+解锁条件+CTA；demo 态=「示例」角标+降饱和+说明文案（绝不造假真实感数据）；五个空态场景实现（无权限/无数据/网络错误/搜索无结果/功能未开通）
  3. **响应式移动端适配**：Tailwind 加法改造（lg+ 值=原桌面值，往窄屏加 base/md 断点）；三禁忌（不改 base/不重构 DOM/不动 token-maxw-字号）；验收=桌面 ≥lg 改前后一致
  4. **动效细节**：骨架屏加载态、Toast 通知、抽屉滑入、表格行 hover、按钮 loading 态（参考 Aceternity UI 但不过度）
- 纪律：[fe] 前缀 fe/f002 分支；状态文件 docs/plans/F002-状态.md；**视觉改动交付前必须截图小样先给老板拍板**（规范落地不算"视觉主张"，但整页效果要过目）
- 状态：待处理


---

### F-003 核心数据页三页（2026-08-19 扩充批次）

- 派活方：arch　日期：2026-08-19
- **前置：F-001 骨架 + F-002 设计系统完成**；契约 `POST /api/v1/query` 已冻结
- 交付物（apps/web，三个 P0 页面生产实现）：
  1. **完整数据总表 `/data/table`**（PRD §2.3.2，老板点名）：TanStack Table + 虚拟滚动；列：账户/日期/全部指标字段（real_cpa/cash_cost/cost_space/gap 等 20+ 列）；列配置面板（显示/隐藏/拖拽排序）；筛选器（日期范围/账户多选/任务/owner）；排序（多列）；导出 xlsx（调 `POST /api/v1/export`）；分页（page_size=100）；**不聚合，明细行**
  2. **数据大盘 `/data`**（PRD §2.3.1）：顶部六 KPI 卡（消耗/真实CPA/达标率/成本空间/BI量级/待处理，含环比）；7 日趋势双轴图（消耗+CPA，ECharts）；健康度横幅（meta.data_as_of 驱动）；mock 调 `POST /api/v1/query?query_type=summary` + `query_type=trend`
  3. **维度透视 `/data/pivot`**（PRD §2.3.1）：顶部维度切换 tab（8 维度：task/biz/account/agent_type/resource_position/bid_tool/is_ubp/deduction_range）；透视表（TanStack Table，每维度值一行，列=全指标+环比，summary/dimension 同构）；环比口径切换（dod/wow）；筛选器；导出；mock 调 `POST /api/v1/query?query_type=dimension&dimension_type=task`
- 数据要求：mock 数据**口径自洽**（用 packages/domain 纯函数反推，别造出 real_cpa ≠ cost/real_conversion 的）；脱敏假名（账户A/B、任务X/Y）；环比 NEW/null 边界覆盖
- 纪律：[fe] 前缀 fe/f003 分支；状态文件 docs/plans/F003-状态.md；三页全部完成交 SHA + 截图（每页桌面+移动端各一张）等老板拍板
- 状态：待处理
