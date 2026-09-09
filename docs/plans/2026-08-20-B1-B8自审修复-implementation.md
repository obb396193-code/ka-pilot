# B1-B8 自审问题修复 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复 B1-B8 自审中不依赖公开产品契约裁决的安全、可靠性和数据链路问题，并用失败反例证明修复有效。

**Architecture:** 继续使用 PostgreSQL 作为任务、执行和审计真相；所有可重试副作用都以持久化状态、fencing token 或确定性幂等键保护。修复按“局部安全不变量 → 队列单活 → 写结果闭环 → ETL 闭环 → 运行维护”分批提交，不借修 bug 发明公开 API。

**Tech Stack:** TypeScript 5.9、Node.js、PostgreSQL 16、node-pg-migrate、Vitest、Zod、Claude Agent SDK、DingTalk Stream

---

## 约束与暂缓项

以下问题必须等老板/Claude 冻结业务或公开契约，本计划不擅自处理：

1. `missing/provisional/error/finite` 是否进入公开指标 DTO。
2. 一账户日多任务是禁止、主归属还是按比例分摊。
3. 启航账户发现结果如何映射到 workspace 的权威来源。
4. 钉钉 durable inbox/ACK/outbox 的公开命令状态和失败可见性。
5. Workflow Run 是否由 Job 单入口驱动以及公开运行控制 API。

在裁决前继续 fail-closed，不把这些问题包装成已完成。

### Task 1: 局部安全不变量

**Files:**
- Modify: `packages/domain/src/knowledge-access.ts`
- Modify: `packages/domain/test/knowledge-access.test.ts`
- Modify: `packages/domain/src/workflow-runtime.ts`
- Modify: `packages/domain/test/workflow-runtime.test.ts`
- Modify: `apps/worker/src/workflows/run-handler.ts`
- Modify: `apps/worker/test/workflows/run-handler.test.ts`
- Modify: `packages/db/src/credential-repository.ts`
- Modify: `packages/db/test/credential-repository.test.ts`
- Modify: `packages/db/src/changeset-repository.ts`
- Modify: `packages/db/test/changeset-repository.test.ts`
- Modify: `apps/worker/src/etl/full-handler.ts`
- Modify: `apps/worker/test/etl-handlers.test.ts`

**Step 1: Write failing tests**

- citation 含任一无权 business ref 时整段不得返回给 Agent。
- offset 不同但时间已过期的 workflow confirmation 必须拒绝。
- confirmation 收到后到实际执行前过期必须拒绝 execute。
- 嵌入普通前缀后的 Bearer/token 形态输出必须拒绝持久化。
- inactive user 不得解析启航身份。
- Changeset result 重复 itemId、错误 executionRunId 必须失败。
- 账户分页返回非空页却缺 totalNum 必须显式失败，不能静默截断。

**Step 2: Run tests and verify RED**

Run the exact affected Vitest files. Expected: each new regression test fails for the audited reason.

**Step 3: Implement minimal guards**

- Knowledge 使用 all-or-nothing citation authorization。
- 时间比较统一 `Date.parse` 后比较；execute 前二次检查 expiry。
- credential-shaped string 扫描整串键值模式，不只匹配开头。
- 启航 identity 查询加入 `is_active = true`。
- Changeset 检查结果 ID 数量与唯一性，并验证 execution run 行更新数。
- 分页元数据缺失时抛可观测错误。

**Step 4: Run focused tests, typecheck and lint**

Expected: focused tests PASS；domain/worker/db typecheck 与 lint PASS。

**Step 5: Commit**

```bash
git add packages/domain apps/worker packages/db
git commit -m "[修复] 收紧确认权限与执行结果校验"
```

### Task 2: Job Lease Fencing

**Files:**
- Create: `packages/db/migrations/004_reliability_hardening.cjs`
- Modify: `packages/contract/schema.sql`
- Modify: `packages/db/src/job-repository.ts`
- Modify: `apps/worker/src/jobs/consumer.ts`
- Modify: `packages/db/test/job-repository.test.ts`
- Modify: `apps/worker/test/job-consumer.test.ts`
- Modify: `packages/db/test/migrations.test.ts`

**Step 1: Write failing concurrent ownership tests**

- A lease 过期、B re-lease 后，A 的 heartbeat/done/failure 必须全部被拒绝。
- B 仍可完成任务。
- retry/recover 后旧 token 不可复用。

**Step 2: Run tests and verify RED**

Expected: old worker currently mutates the new lease, tests fail.

**Step 3: Add internal lease token**

- `jobs.lease_token UUID`；每次 lease 生成新 token。
- `JobRecord` 必须携带 token。
- markRunning/markDone/markFailure/markBlockedAuth/extendLease 全部以 `id + lease_token + expected status` CAS。
- 状态迁移 rowCount 不为 1 时抛 `LostJobLeaseError`；Consumer 不得让旧 Worker 再改新任务状态。

**Step 4: Replay migrations and run DB/Worker tests**

Expected: migration up/down/up、并发 lease、heartbeat、retry 全部 PASS。

**Step 5: Commit**

```bash
git add packages/contract packages/db apps/worker
git commit -m "[修复] 为任务队列增加租约隔离令牌"
```

### Task 3: Changeset 结果与 T+1 闭环

**Files:**
- Modify: `apps/worker/src/changesets/changeset-execution-handler.ts`
- Modify: `apps/worker/src/changesets/types.ts`
- Modify: `apps/worker/test/changeset-execution-handler.test.ts`
- Modify: `packages/db/src/changeset-repository.ts`
- Modify: `packages/db/test/changeset-repository.test.ts`

**Step 1: Write failing crash-window tests**

- completeExecution 成功、scheduleT1 失败时不能二次写 UNKNOWN。
- retry 读取成功/部分成功终态后必须再次幂等补 T+1。
- beginExecution 时 TTL 已过期必须拒绝执行。

**Step 2: Run tests and verify RED**

Expected: 当前 catch 混淆远端执行和后续调度，测试失败。

**Step 3: Split execution phases**

- 只把“远端结果不确定”映射 UNKNOWN。
- complete 后的 follow-up 失败向外抛出，但不回写 UNKNOWN。
- 终态重入调用幂等 T+1 scheduler；successful IDs 从已落库 item 状态恢复。
- `beginExecution` 在锁内重验 TTL。

**Step 4: Run focused and full DB/Worker tests**

Expected: crash-window tests PASS，不破坏 UNKNOWN reconcile。

**Step 5: Commit**

```bash
git add apps/worker packages/db
git commit -m "[修复] 补齐变更集结果与T1回收闭环"
```

### Task 4: 日常 ETL 阶段闭环

**Files:**
- Modify: `apps/worker/src/etl/full-handler.ts`
- Modify: `apps/worker/src/etl/incr-handler.ts`
- Modify: `apps/worker/src/runtime.ts`
- Modify: `apps/worker/test/etl-handlers.test.ts`
- Modify: `apps/worker/test/job-scheduling.test.ts`

**Step 1: Write failing scheduling tests**

- full 完成后必须为 offline D-1 和 realtime 窗口 enqueue 确定性 canonical job。
- incr 完成后必须为目标日 enqueue canonical job。
- raw 持久化失败时不得 enqueue 下游。
- 同一源 job 重试不得创建重复 canonical job。

**Step 2: Run tests and verify RED**

Expected: full/incr 目前只 finish run，测试失败。

**Step 3: Add deterministic downstream scheduling**

- handler 注入 `JobEnqueuerPort`。
- 使用源 job id + date range 生成 deterministic canonical ID。
- 保留原 credential owner、workspace 和优先级。
- canonical 继续负责 enqueue quality，形成 raw -> canonical -> quality。

**Step 4: Run focused tests and runtime composition tests**

Expected: 每个范围只产生一个 canonical job；失败不误报完成。

**Step 5: Commit**

```bash
git add apps/worker
git commit -m "[修复] 接通日常ETL聚合与质量检查"
```

### Task 5: 运行维护与资源边界

**Files:**
- Modify: `packages/db/src/pool.ts` or create `packages/db/src/partition-maintenance.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `packages/db/test/migrations.test.ts`
- Modify: `apps/worker/src/rules/rule-scan-handler.ts`
- Modify: `apps/worker/test/rule-scan-handler.test.ts`
- Modify: `apps/worker/src/config.ts`
- Modify: `apps/worker/test/config.test.ts`

**Step 1: Write failing maintenance tests**

- 启动维护可预建未来 3-6 个月分区，且并发调用安全。
- 所有 rule candidate 都因同一个基础设施错误失败时，job 必须失败而不是成功返回 0。
- Agent runtime timeout 不得超过凭证信封最大 TTL。

**Step 2: Run tests and verify RED**

Expected: 无运行期分区维护、规则系统错误被吞、配置上限缺失。

**Step 3: Implement bounded maintenance**

- advisory lock 下调用现有 `ensure_monthly_metric_partitions`。
- rule scan 区分单候选业务失败和系统性依赖失败。
- 配置 parser 强制 runtime timeout <= credential envelope TTL。

**Step 4: Run focused tests, migrations and lint**

Expected: maintenance idempotent，系统故障可见。

**Step 5: Commit**

```bash
git add packages/db apps/worker
git commit -m "[修复] 增加分区保活与系统故障保护"
```

### Task 6: 全量质量门禁和二次自审

**Files:**
- Create: `docs/evidence/B1-B8自审修复-代码质量报告.md`
- Modify: `docs/evidence/B1-B8多角度后端自审报告.md`
- Modify: `docs/relay/inbox-arch.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: Run full tests**

Run all four packages; expected all default tests PASS and opt-in smoke remains explicitly classified.

**Step 2: Run typecheck, lint, dependency audit and migration replay**

Expected: four packages typecheck/lint/audit green; PostgreSQL migrations up/down/up green.

**Step 3: Run security/performance diff review**

Check SQL parameterization, secrets, unsafe dynamic execution, changed function complexity and concurrency counterexamples.

**Step 4: Update evidence and relay**

Mark each audit item fixed/deferred/partially fixed with evidence and remaining contract decisions.

**Step 5: Commit**

```bash
git add docs
git commit -m "[质检] 完成自审问题修复复验"
```

## 执行结果

Task 1-6 已完成。修复状态、当前测试与覆盖率、未裁决问题见 `docs/evidence/B1-B8自审修复-代码质量报告.md`；审查入口为 `docs/relay/inbox-arch.md` 的 P-014。
