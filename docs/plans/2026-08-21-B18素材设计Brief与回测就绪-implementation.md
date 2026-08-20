# B18 素材设计 Brief 与回测就绪 Implementation Plan

> 日期：2026-08-21
> 设计：`docs/plans/2026-08-21-B18素材设计Brief与回测就绪-design.md`

**Goal:** 交付结构化单变量素材 brief、谱系绑定交付记录和 B17 样本驱动的回测就绪判断。

**Architecture:** 新增 `material-design-brief.ts` 纯领域模块，消费 B16/B17 的 fingerprint 和 `ProductMaterialExperiment`；不做 IO、Agent 或状态持久化。

## Task 1：Brief

1. RED：严格字段、1~20 variant、唯一 key、单一改变维度、keep 冲突、规范时间、稳定 fingerprint、深冻结。
2. 实现 `createMaterialDesignBrief` 与 schema v1。

## Task 2：交付记录

1. RED：交付必须引用 brief 中 variant，绑定派生素材和 lineage fingerprint；重复幂等、同 variant 冲突失败。
2. 实现 `normalizeMaterialBriefDeliveries`，最多 20 条，稳定排序。

## Task 3：回测就绪

1. RED：缺交付、缺实验格、样本不足、policy/product 错配、全部充分。
2. 实现 `assessMaterialBriefBacktestReadiness`；只返回 awaiting_delivery/awaiting_sample/ready 和缺口列表。

## Task 4：质量交接

1. Domain coverage、四包静态/audit、全仓测试、复杂度/安全/冻结目录。
2. 写 B18 状态、质量报告、总账、台账和 arch P-025。
