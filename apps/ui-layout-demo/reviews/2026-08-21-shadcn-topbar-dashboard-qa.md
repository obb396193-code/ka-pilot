# shadcn 历史顶栏 Dashboard A 版验收

> 验收日期：2026-08-21
>
> 入口：`http://127.0.0.1:5173/topbar.html`
>
> 数据：全部为脱敏演示数据，未写入真实账户 ID、内部人名或真实业务金额。

## 1. 复用边界

- 整页保留 shadcn 官方历史顶栏 Dashboard 的 `TeamSwitcher / MainNav / Search / UserNav / KPI Cards / Overview / RecentSales` 结构与核心 className。
- 业务适配仅替换中文导航、脱敏数据、指标和投放任务文案。
- 顶栏入口使用独立 shadcn CSS/Geist 字体，不被旧 Demo 的全局 table/svg/font 规则污染。
- 官方上游快照固定在 `upstream/shadcn-dashboard-topbar/`，并记录 commit、来源与 SHA-256。

## 2. 业务口径

- KPI 使用产品已确认口径：今日消耗、真实 CPA、达标率、待处理。
- 图表为“近 14 日消耗与真实 CPA”：面积表示账面消耗，折线表示真实 CPA。
- 运行页面不再出现“支付”或 ROI 字段。
- 近期任务按已有业务链路改写：AAC 拉新、唤端 `wake_uv`、潜客 `aac_ptt_uv`、新建广告 24h 零消耗、主力广告依赖风险。

## 3. 真实浏览器验收

- 1440px 桌面宽度：`scrollWidth = clientWidth = 1440`，无横向溢出。
- 图表容器：`x=41, y=492, width=745.42, height=350`。
- 浏览器 console：0 error / 0 warning。
- 已实测：快手优化师 / KA 负责人视图切换、“更多”菜单、日期范围、投放 Agent 抽屉、账号菜单、三个内容 Tab。
- 侧栏入口回归验证：页面宽度 1440，无溢出，console 0/0。

## 4. 工程门禁

- Topbar Vitest：1/1 通过。
- Node 入口/来源/上游几何回归：7/7 通过。
- 本次范围 Prettier：通过。
- Vite production build：通过；存在 Recharts 共享 chunk >500kB 的性能提示，属 P2 后续按路由拆包。
- `npm audit`：0 vulnerabilities。
- 当前全局 `tsc -b` 会被范围外未完成的 `src/kpi-component-demo/kpi-component-demo.test.tsx` 缺少实现模块阻断；本次 Topbar 改动之前的同范围 TypeScript 检查已通过，本轮未越界修改该独立 Demo。

## 5. 结论

A 版可作为独立完整顶栏方案继续业务评审。它与侧栏版、后续 COSS 版都使用不同入口，页面内不出现布局切换器。
