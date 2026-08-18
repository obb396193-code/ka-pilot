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
