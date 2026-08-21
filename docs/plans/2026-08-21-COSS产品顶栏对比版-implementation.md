# COSS 产品顶栏对比版 Implementation Plan

**Goal:** 在不改动已验收 shadcn A 版的前提下，新增独立 `topbar-coss.html`，用 COSS current 官方组件组合投放经营首页。

**Architecture:** 新建 `src/topbar-coss/`、`src/topbar-coss/coss-ui/` 和独立 `coss.css`。COSS 组件从已缓存/实时核验 Registry 源码机械复制后仅改 import path；业务页仅负责数据映射与必要组合。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind CSS 4、Base UI、COSS current、Recharts、Vitest

## Task 1: 固定 COSS 运行时组件

- 新增 `coss-ui/button|card|badge|avatar|input|table|spinner.tsx`。
- 新增 `segmented-control.ts`，保留 `p-navigation-1` 组合方式。
- 新增 COSS 来源清单与源码回归测试。
- 安装 `@base-ui/react` 与 `@fontsource-variable/inter`。

## Task 2: 建立独立入口与样式

- 新增 `topbar-coss.html`、`src/topbar-coss/main.tsx`、`coss.css`。
- 在 Vite Rollup input 增加 `topbarCoss`，不修改原两个入口。
- 编写入口隔离测试，禁止页面内互跳和共享污染 CSS。

## Task 3: 组合 COSS 顶栏与看板

- 用 segmented navigation 完成工作台/投放任务/数据分析/账户池，其余收入一个产品菜单。
- 用 COSS Input/Button/Avatar 完成搜索、Agent 和账号区。
- 用 COSS Card/Badge/Table 完成 KPI、异常队列和任务表。
- 共用 shadcn A 版脱敏 demo data，但不共用其 UI 组件或 CSS。

## Task 4: 验收与留痕

- 运行针对性 Vitest、Node tests、Prettier、Vite build、npm audit。
- 真实浏览器检查 1440px 无溢出、交互、console、A 版/侧栏版回归。
- 新增独立 QA 文档并更新工作台账。
- 只 stage 本计划文件，不触碰 `apps/web` 和独立 KPI Demo。
