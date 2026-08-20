# B19 月度结算单内核 Implementation Plan

> 设计：`docs/plans/2026-08-21-B19月度结算单内核-design.md`

**Goal:** 交付版本化结算模板、受限公式、离线事实预览、人工修正链、显式对账检查与冻结快照。

**Architecture:** 新增 `packages/domain/src/settlement.ts` 纯领域模块；输入由未来语义层适配器提供，输出供未来 DB/API/导出层持久化。无 IO、Agent、动态代码或默认业务阈值。

## Task 1：模板与公式 Schema

1. 先写失败测试：未知字段、重复 order/key、非法类型引用、未知引用、循环、超深/超节点、非规范时间。
2. 实现严格模板、公式 AST 验证、稳定排序和 fingerprint。
3. 跑定向 test/typecheck/lint/复杂度。

## Task 2：离线事实与预览

1. 先写事实幂等/冲突、行唯一、字段类型、缺 required、四则运算、除零和口径门测试。
2. 实现逐行求值、字段来源、issue 和检查结果；无阻断才 ready_to_freeze。
3. 输入顺序不能影响结果/fingerprint。

## Task 3：人工修正与冻结

1. 先写 correction from-value、权限字段、幂等/冲突、时间、证据和重算检查测试。
2. 实现稳定修正事件链；修正后重新跑 required/check。
3. 实现冻结函数：只接受完整性正确且 ready 的预览，确认时间合法；输出不可变快照。

## Task 4：质量与交接

1. 跑 Domain/DB/Worker/Gateway 全量、SDK opt-in、真实 PG/migration/FFmpeg/gateway 回归。
2. 四包 typecheck/lint/audit，coverage，complexity≤10，函数≤100，安全与冻结目录扫描。
3. 写 `B19-状态.md`、质量报告、总账、工作台账与 arch P-026。
4. 明确未完成真实模板、数据适配、DB/API、导出/推送和页面。
