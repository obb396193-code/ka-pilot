# KPI 组件替换对比 Demo Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立一个独立真实页面，比较当前 shadcn SectionCards、Tremor 官方 Spark KPI Block 与 Tremor 多组件组合。

**Architecture:** A 直接导入现有 SectionCards；B/C 使用隔离复制的 Tremor MIT 官方组件。页面状态只控制三套组件树的切换，现有侧栏与顶栏代码保持只读。

**Tech Stack:** React 19、TypeScript、Vite、Tailwind CSS 4、Recharts、Radix、shadcn 本地源码、Tremor Raw 官方源码、Vitest。

---

### Task 1: 测试先行

1. 新建 `src/kpi-component-demo/kpi-component-demo.test.tsx`。
2. 断言默认方案、三个按钮、A/B/C 切换、四个业务指标和 Tremor Raw 标记。
3. 运行目标测试，确认组件尚不存在而失败。

### Task 2: 复制官方源码

1. 从固定 Tremor commit 复制 Card、SparkChart、CategoryBar、Tracker、Tooltip、chartUtils、cx。
2. 仅将 `@/components`、`@/lib` import 改为 Demo 内部相对路径。
3. 新增 `THIRD_PARTY_SOURCES.md` 记录 MIT、commit、原始文件路径和适配边界。

### Task 3: 实现三个真实方案

1. A 直接渲染当前 SectionCards。
2. B 使用 Tremor `kpi-card-14` 结构和四个 SparkAreaChart。
3. C 分别使用 SparkAreaChart、CategoryBar、Tracker、CategoryBar marker。
4. 新建独立 HTML、main、CSS 和 Vite 配置。

### Task 4: 验收

1. 运行目标测试、完整 Vitest、TypeScript、独立 production build。
2. Playwright 在 1440×900 切换 A/B/C，检查 DOM、overflow、console 和键盘焦点。
3. 打开原 sidebar/topbar，确认不存在 `.kpi-component-demo`。
4. 更新台账并交付独立 URL。
