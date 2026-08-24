# packages/contract — 唯一事实源

> v1.0（2026-08-18，与 PRD v1.6 同步冻结）。改动只能由 arch 提交；be/fe 发现缺口 → 写 inbox-arch.md 提议。

双数据公开查询的可执行 Schema 位于 `packages/domain/src/data-query-contract.ts`；本目录保留面向前后端、Agent 与验收的协议说明。BE-001 的 Contract 改动由控制线明确授权：`api.md` 冻结受控 Query Registry、认证 scope、稳定错误与截断语义，`metrics.md` 冻结逐指标权威矩阵和可比条件。

文件：
- `metrics.md` 指标字典（口径公式，计算层唯一依据）
- `schema.sql` 数据库契约（B1a 迁移的蓝本）
- `api.md` 数据服务 API 合同（B1c）
- `types.ts` 共享 TS 类型
- `mock-data.json` 脱敏 mock 数据集（fe 先行开发用）
