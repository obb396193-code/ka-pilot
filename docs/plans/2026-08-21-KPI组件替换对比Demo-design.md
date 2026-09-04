# KPI 组件替换对比 Demo 设计

> 日期：2026-08-21  
> 状态：老板已确认  
> 边界：新增独立入口，不修改现有 `sidebar.html`、`topbar.html` 或其 SectionCards。

## 目标

比较“继续使用 shadcn 原 SectionCards”与“直接替换为 Tremor 官方数据组件”后的真实视觉差异。此次对比改变组件结构和数据表达方式，不以换色作为主要变量。

## 三套方案

- A 当前 shadcn：直接渲染现有 `SectionCards`，作为基线。
- B Tremor KPI Block：按 Tremor 官方 `kpi-card-14` 的 Card + SparkAreaChart 结构，四个指标均使用迷你趋势图。
- C Tremor 功能组合：根据指标语义分别使用 SparkAreaChart、CategoryBar、Tracker 和带 marker 的 CategoryBar。

## 官方源码边界

Tremor 源码来自 `tremorlabs/tremor-blocks` MIT 仓库，固定 commit `b319e8d3d3678a4f60f4802f7e85bc1abc52d598`。复制 Card、SparkChart、CategoryBar、Tracker、Tooltip、chartUtils 和 cx；仅修改本地 import path 与业务脱敏数据，不改变组件结构和样式类。

## 隔离与验收

- 新入口：`apps/ui-layout-demo/kpi-component-demo.html`。
- 新源码位于 `src/kpi-component-demo/`，所有页面外壳样式限定在 `.kpi-component-demo`。
- 不安装新依赖，不修改原页面构建输入。
- A/B/C 可点击和键盘切换；B/C DOM 必须带官方 `tremor-id="tremor-raw"`。
- 1440×900 无横向溢出、console error 0；原 sidebar/topbar 不加载新根节点。
