# KPI 彩色方案独立 Demo Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增一个不影响现有布局 Demo 的 KPI 三档配色真实 React 页面。

**Architecture:** 新入口加载现有隔离 shadcn 样式与新建的局部样式。React 组件持有 A/B/C 选择状态，以相同脱敏数据渲染主 KPI、紧凑 KPI、状态分布和成本目标条；独立 Vite 配置只构建该入口。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind CSS 4、shadcn new-york-v4 本地源码、Recharts、Vitest、Testing Library。

---

### Task 1: 固定行为测试

**Files:**
- Create: `apps/ui-layout-demo/src/kpi-color-demo/kpi-color-demo.test.tsx`

**Steps:**
1. 写入默认 B、三种模式按钮、四个指标、模式切换和说明文本测试。
2. 运行 `npm test -- --run src/kpi-color-demo/kpi-color-demo.test.tsx`，确认因组件不存在而失败。

### Task 2: 实现独立组件与样式

**Files:**
- Create: `apps/ui-layout-demo/src/kpi-color-demo/kpi-color-demo.tsx`
- Create: `apps/ui-layout-demo/src/kpi-color-demo/kpi-color-demo.css`
- Create: `apps/ui-layout-demo/src/kpi-color-demo/main.tsx`
- Create: `apps/ui-layout-demo/kpi-color-demo.html`

**Steps:**
1. 使用本地 shadcn Card、Badge、Button 和 Tooltip，实现 A/B/C 选择器。
2. 使用 Recharts 实现主卡 Spark Area，使用纯语义结构实现状态段和目标 Marker Bar。
3. 把全部新增视觉规则限制在 `.kpi-color-demo` 下。
4. 运行目标测试，确认通过。

### Task 3: 建立独立构建门

**Files:**
- Create: `apps/ui-layout-demo/vite.kpi-demo.config.ts`

**Steps:**
1. 新配置仅把 `kpi-color-demo.html` 作为 Rollup input。
2. 运行 `npx vite build --config vite.kpi-demo.config.ts --outDir dist-kpi-demo`。
3. 运行完整 `npm test`、`npm run typecheck` 和节点来源测试，确认原页面无回归。

### Task 4: 浏览器验收与留痕

**Files:**
- Modify: `docs/plans/工作台账.md`

**Steps:**
1. 在 1440×900 检查三种模式、键盘焦点、横向溢出和控制台。
2. 将入口、隔离边界和验收结果写入台账。
3. 只交付独立页面地址，不替老板选择最终正式配色。
