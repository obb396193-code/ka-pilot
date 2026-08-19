# B3 安全执行内核 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 交付变更集 TTL、from-value 复核、状态机、逐项结果、幂等执行与 UNKNOWN 对账内核，不绑定未冻结的 OS 协议。

**Architecture:** `@ka/domain` 提供纯状态与校验；`@ka/db` 原子保存 header/items/execution_runs；Worker 通过 `CurrentValueProvider` 和 `ChangeExecutor` 端口执行，UNKNOWN 只对账不重发。真实 Multica/CLI 适配器后补。

**Tech Stack:** TypeScript、Vitest、PostgreSQL 16、`pg`、现有 jobs/lease 基础。

---

### Task 1: 变更集领域安全规则

**Files:**
- Create: `packages/domain/src/changesets.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/changesets.test.ts`

**Steps:**
1. 写失败测试：合法/非法状态、TTL 等于当前时刻即过期、逐项 from 冲突、结果聚合、UNKNOWN 要求 reconcile、只反转成功项。
2. 运行 `npm test -- --run test/changesets.test.ts`，确认缺模块失败。
3. 实现 `transitionChangeSet`、`verifyCurrentValues`、`aggregateExecutionResult`、`executionDirective`、`buildReverseItems`。
4. 运行 test/typecheck/lint，全部通过。
5. 提交 `[be] 实现变更集安全领域规则`。

### Task 2: PostgreSQL 变更集仓储

**Files:**
- Create: `packages/db/src/changeset-repository.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/changeset-repository.test.ts`

**Steps:**
1. 写失败测试：原子创建、租户隔离、重复确认、过期、from 冲突不确认、execution_run 审计、部分成功聚合、UNKNOWN 禁止再次领取。
2. 确认缺模块失败。
3. 实现 header/items 的 JOIN 租户查询、`FOR UPDATE` 状态变化、逐项结果和 execution_run。
4. PostgreSQL test/typecheck/lint 全绿。
5. 提交 `[be] 实现变更集事务仓储`。

### Task 3: 执行 Worker 端口与编排

**Files:**
- Create: `apps/worker/src/changesets/types.ts`
- Create: `apps/worker/src/changesets/changeset-execution-handler.ts`
- Test: `apps/worker/test/changeset-execution-handler.test.ts`

**Steps:**
1. 写 fake 端口测试：执行前 from 冲突、全成功、部分成功、UNKNOWN、终态重跑跳过、unknown 重跑只 reconcile、T+1 只安排成功项。
2. 确认缺 handler 失败。
3. 实现 `CurrentValueProvider`、`ChangeExecutor`、`ChangeSetStore`、`FollowUpScheduler` 与 handler。
4. Worker test/typecheck/lint 全绿。
5. 提交 `[be] 实现变更集执行编排`。

### Task 4: 全量质量与交付

**Files:**
- Modify: `docs/plans/B3-状态.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`
- Create: `docs/evidence/B3-代码质量报告.md`

**Steps:**
1. 四包全量 tests/coverage/typecheck/lint；核心与各包行覆盖率 >80%。
2. 四包 `npm audit --audit-level=high`；凭证与动态执行扫描。
3. 新增生产文件执行 complexity<=10、function<=100 行门禁并修复 warning。
4. 如实记录未实现的真实 OS、同账户锁、T+1 指标适配和 API Route。
5. 提交并给 arch 功能审查 SHA。
