# B23-C1 奇航账户主表同步 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让奇航 `resource=account` 的可信任务范围安全、幂等地创建/更新 `accounts`，并在同一短事务中先建户再落同页 Raw，使未预置新账户可进入既有 Canonical 主链。

**Status:** 已实现并完成 Codex 自审；代码终态 `ec4934a`，质量与交接见 `docs/evidence/B23-C1-奇航账户主表同步质量报告.md`。未合入 root、未部署、未联调真实奇航。

**Architecture:** Full ETL 与 Backfill Coordinator 仍负责真实奇航 account 分页。Worker 只从任务范围注入 `workspaceId/media`，从上游精确读取 `account_id` 及允许的可选 `account_name/status`；DB Repository 对每个已取回分页执行短事务：校验整页、upsert accounts、append metrics_raw、commit。网络请求不进入 DB 事务；已提交分页可幂等重放，任一页失败时该页 0 写入且不派 canonical/fanout，前页可信结果保留供 Job 重试恢复。

**Tech Stack:** TypeScript、Zod、PostgreSQL 16、node-postgres、Vitest、现有 Qihang Client/ETL Runtime。

---

### Task 1: 冻结账户 metadata Adapter

**Files:**
- Create: `apps/worker/src/etl/account-metadata.ts`
- Create: `apps/worker/test/account-metadata.test.ts`

1. 先写失败测试：`workspaceId/media` 必须取 Raw Record 的受信字段；payload 中伪造 workspace 不得覆盖。
2. 写 `account_id` 缺失/类型非法/与 record 不一致、`account_name/status` present-but-invalid 的 fail-closed 反例。
3. 只映射精确字段 `account_id/account_name/status`；缺失 metadata 输出 `null`，不推断 owner/lifecycle/star/tags。
4. 同一 tuple 重复且 metadata 冲突时拒绝；完全相同重复可合并为一个 upsert 对象。
5. 运行定向 test/typecheck/lint，确认 RED→GREEN。

### Task 2: DB 每页 accounts + Raw 原子同步

**Files:**
- Modify: `packages/db/src/raw-metrics-repository.ts`
- Modify: `packages/db/test/raw-metrics-repository.test.ts`

1. 先写真实 PG 失败测试：不预置账户直接同步一页；当前 Raw FK 必须失败。
2. 新增 `AccountMetadataUpsert` 与 `syncAccountMetadataAndRaw`；进入事务前校验 metadata/raw tuple 集合完全一致。
3. 事务内先批量 `INSERT ... ON CONFLICT(workspace_id,media,account_id) DO UPDATE`，仅更新非 null `account_name/status`；随后批量插入 Raw，最后 commit。
4. 测试同 ID 跨 workspace、同 workspace 跨 media、重复回放不重复建户；已有 owner/lifecycle/star/tags 保持。
5. 用真实 PG 失败触发器制造一页部分 upsert 失败，断言该页 accounts/raw 均为 0；非法/缺 account ID 在 SQL 前拒绝。
6. 运行 DB 定向 test/typecheck/lint，路径限定提交。

### Task 3: 接入 Full 与 Backfill account 分页

**Files:**
- Modify: `apps/worker/src/etl/types.ts`
- Modify: `apps/worker/src/etl/full-handler.ts`
- Modify: `apps/worker/src/backfill/coordinator-handler.ts`
- Modify: `apps/worker/src/runtime.ts`
- Modify: `apps/worker/test/etl-handlers.test.ts`
- Modify: `apps/worker/test/backfill-coordinator.test.ts`

1. 扩展仅供账户发现流程使用的 `AccountMetadataEtlStore`，不强迫 Incr/BackfillDay 伪造 metadata。
2. Full/Coordinator 对 `resource=account` 调用 account adapter，再调用原子 DB port；其他资源继续 `appendRaw`。
3. step 名明确区分 fetch 与 `persist_accounts_and_raw`；同步失败必须 failRun，且不得抓后续指标、派 canonical 或 fanout。
4. 测试调用顺序、失败短路、可信 workspace/media 和跨页幂等恢复语义。
5. 运行 Worker 定向 test/typecheck/lint，路径限定提交。

### Task 4: 真实 PG 无预置账户纵切片

**Files:**
- Modify: `apps/worker/test/data-pipeline-pg.integration.test.ts`

1. 删除目标 workspace 的预置 account fixture；奇航 account row 提供精确可选 metadata。
2. Full ETL 后断言 accounts 先存在、Raw 已落库、另 workspace 同号未污染。
3. Full 成功后再建立 task_accounts 关系，继续执行 Canonical→Quality→Semantic→Rule→WorkItem 既有纵切片。
4. 重放 Full，断言账户不重复、经营字段不被覆盖。
5. 运行真实 PG 定向 test，路径限定提交。

### Task 5: 全量质量与交接

**Files:**
- Create: `docs/evidence/B23-C1-奇航账户主表同步质量报告.md`
- Modify: `docs/evidence/B23-C-奇航只读链Gap矩阵.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/relay/inbox-be-codex.md`
- Modify: `docs/relay/inbox-arch.md`

1. 跑 DB/Worker 全量 test、typecheck、lint、coverage、audit 与真实 PG。
2. 检查 SQL 参数化、事务回滚、凭证/上游正文泄漏、N+1、复杂度与前端 0 diff。
3. 报告 Full/Incr/Backfill/Raw 最终事务边界，以及仍未完成的普通 runtime scheduler。
4. 独立提交质量/交接；确认分支 clean、未 push、真实媒体写关闭，停在 C1 边界。
