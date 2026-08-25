# Sidebar 唯一视觉母版基线

- 日期：2026-08-25
- 页面：`apps/ui-layout-demo/sidebar.html`
- 接管基线：`cd40927`
- 视觉来源：shadcn `new-york-v4/dashboard-01` 官方 Registry 区块，本地只做中文业务内容与脱敏演示数据适配
- 老板视觉签字：已明确选定当前 `sidebar.html` 为唯一视觉母版
- root 功能签字：不适用；本文件只冻结视觉母版，正式业务 Contract 尚未接入

## 冻结范围

- 产品名：`KA Pilot`
- 九项业务导航：工作台、投放任务、数据分析、账户池、自动化、商品素材、报告、知识库、集成与通知
- 官方区块：Sidebar、Header、四 KPI、Chart、Tabs、DataTable
- 字体与主题：Geist / Geist Mono、官方 Lab token、antialiased
- 桌面几何：Sidebar 288px、Header 48px；1440×900 与 1366×768 为第一阶段基线
- 禁止回流：旧 `PageShell`、`MetricGrid`、`DataViewSwitcher` 及旧 FrontendAgent/F-001 视觉层

## 自动证据

| 检查 | 结果 |
|---|---|
| `npm test -- src/sidebar/sidebar-shell.test.tsx` | 1/1 PASS |
| `npm run test:node` | 10/10 PASS |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `node --test scripts/sidebar-visual-baseline.test.mjs` | PASS |

## 边界

- 本基线只证明当前 Demo 是正式迁移的视觉母版，不证明 `apps/web` 已迁移完成。
- KPI 字段、图表 series、Tabs 业务含义、表格字段和所有数值继续等待 root Contract；前端不得按 Demo 假数据计算或猜测。
- 构建的共享 `CartesianChart` chunk 为 586.92 kB，记质量 P2；正式 Next.js 迁移时通过按需加载/拆包处理，不修改当前母版视觉。
