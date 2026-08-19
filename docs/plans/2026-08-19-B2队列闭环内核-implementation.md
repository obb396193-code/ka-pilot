# B2 队列闭环内核 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不扩写冻结外部契约的前提下，交付可解释规则、工作项闭环、通知分级和规则扫描 Worker 内核。

**Architecture:** 纯领域函数负责规则判断、状态机和通知策略；PostgreSQL Repository 只使用现有 schema 并用事务 advisory lock 保证工作项并发去重；Worker 通过端口编排候选数据、规则、工作项和通知，缺数据返回 `insufficient_data` 而非误报告警。API Route、真实钉钉发送和 OS 写链路均不在本计划内。

**Tech Stack:** TypeScript 5.9、Vitest、PostgreSQL 16、`pg`、现有 `@ka/domain` / `@ka/db` / `@ka/worker` 包。

---

### Task 1: 可解释的首发规则领域内核

**Files:**
- Create: `packages/domain/src/alert-rules.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/alert-rules.test.ts`

**Step 1: Write the failing tests**

覆盖：

```ts
expect(evaluateOverCostRamp({
  realCpa: 36.01,
  assessmentPrice: 30,
  cost: 3000.01,
  lifecycleStage: "scaling",
  realConversion: 100,
}).outcome).toBe("matched");

expect(evaluateOverCostRamp({
  realCpa: 45,
  assessmentPrice: 30,
  cost: 5000,
  lifecycleStage: "cold_start",
  realConversion: 9,
}).outcome).toBe("not_matched");

expect(evaluateSpendCliff({
  spendChange: -0.31,
  hadManualBudgetChange: undefined,
}).outcome).toBe("insufficient_data");
```

每个结果还必须含逐条件 `trace`，明确 `matched | not_matched | insufficient_data` 和原因。

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/alert-rules.test.ts` in `packages/domain`  
Expected: FAIL because `alert-rules.ts` does not exist.

**Step 3: Implement the minimal rule evaluator**

实现：

```ts
export type RuleOutcome = "matched" | "not_matched" | "insufficient_data";

export interface ConditionTrace {
  condition: string;
  outcome: RuleOutcome;
  actual?: number | boolean | string | null;
  expected?: number | boolean | string;
  reason: string;
}

export interface RuleEvaluation {
  ruleCode: "over_cost_ramp" | "zero_delivery" | "spend_cliff";
  outcome: RuleOutcome;
  severity: "P0" | "P1" | "P2";
  trace: ConditionTrace[];
}
```

规则边界：

- 超成本起量：普通阶段 `real_cpa > assessment_price * 1.2 && cost > 3000`；冷启动转化 `<10` 不判，达到 10 后阈值放宽到 `1.5`；缺字段为数据不足；
- 0 曝光：`entity_age_hours >=24 && cost===0`；创建时间缺失为数据不足；
- 消耗断崖：`spend_change <=-0.3 && had_manual_budget_change===false`；预算调整记录缺失为数据不足。

**Step 4: Run tests and quality checks**

Run: `npm test -- --run test/alert-rules.test.ts && npm run typecheck && npm run lint`  
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/domain/src/alert-rules.ts packages/domain/src/index.ts packages/domain/test/alert-rules.test.ts
git commit -m "[be] 实现可解释首发规则"
```

### Task 2: 工作项状态机与去重策略

**Files:**
- Create: `packages/domain/src/work-items.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/work-items.test.ts`

**Step 1: Write the failing tests**

覆盖：

- `open → processing → done` 合法；
- `done → processing` 非法；
- `open/processing → ignored|rejected|escalated|external_handled` 合法；
- 去重键必须包含 workspace、rule、account；
- 新 P0 覆盖现有 P1 时返回 `upgrade`，同级或更低返回 `merge`；
- 跨租户不能生成相同去重键。

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/work-items.test.ts` in `packages/domain`  
Expected: FAIL because module does not exist.

**Step 3: Implement the state machine**

提供：

```ts
export function assertWorkItemTransition(
  current: WorkItemStatus,
  action: WorkItemAction,
): WorkItemStatus;

export function workItemDedupeKey(input: {
  workspaceId: string;
  ruleId: string | number;
  accountId: string;
}): string;

export function decideDuplicate(
  existing: WorkItemSeverity,
  incoming: WorkItemSeverity,
): "merge" | "upgrade";
```

不加入 PRD 未定义的“自动重开终态”行为。

**Step 4: Run tests and checks**

Run: `npm test -- --run test/work-items.test.ts && npm run typecheck && npm run lint`  
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/domain/src/work-items.ts packages/domain/src/index.ts packages/domain/test/work-items.test.ts
git commit -m "[be] 实现工作项状态与去重策略"
```

### Task 3: 通知分级纯策略

**Files:**
- Create: `packages/domain/src/notification-policy.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/test/notification-policy.test.ts`

**Step 1: Write the failing tests**

覆盖：

- P0 无论静默与否都 `send_now`；
- P1 非静默立即、静默时调度至传入的 `quietHoursEnd`；
- P2 调度至下一整点，静默结束更晚时取更晚者；
- opportunity 返回 `suppress`；
- 所有决策带可解释 reason。

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/notification-policy.test.ts` in `packages/domain`  
Expected: FAIL.

**Step 3: Implement deterministic routing**

```ts
export type NotificationDecision =
  | { kind: "send_now"; reason: string }
  | { kind: "schedule"; at: Date; reason: string }
  | { kind: "suppress"; reason: string };
```

时间解析不在此模块；调用方传入 `now/isQuietHours/quietHoursEnd`。

**Step 4: Run tests and checks**

Run: `npm test -- --run test/notification-policy.test.ts && npm run typecheck && npm run lint`  
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/domain/src/notification-policy.ts packages/domain/src/index.ts packages/domain/test/notification-policy.test.ts
git commit -m "[be] 实现告警通知分级策略"
```

### Task 4: PostgreSQL 工作项 Repository

**Files:**
- Create: `packages/db/src/work-item-repository.ts`
- Modify: `packages/db/src/index.ts`
- Test: `packages/db/test/work-item-repository.test.ts`

**Step 1: Write PostgreSQL failing tests**

覆盖：

- 创建工作项保留证据快照、SLA、任务与账户；
- 两个并发请求对同一 workspace+rule+account 只产生一个活动工作项；
- P0 命中可以升级现有 P1，但不产生第二行；
- 同账户不同 workspace 互不影响；
- 状态转换带 workspace 和旧状态条件；
- `ignore` 写入原因和 `muted_until`；
- 终态不能被普通 process 改写。

**Step 2: Run test to verify it fails**

Run: `TEST_DATABASE_URL=postgres://ka:ka@127.0.0.1:55432/ka npm test -- --run test/work-item-repository.test.ts` in `packages/db`  
Expected: FAIL because repository does not exist.

**Step 3: Implement transaction-safe repository**

核心事务：

```sql
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended($1, 0));
SELECT ... FROM work_items
 WHERE workspace_id=$2 AND rule_id=$3 AND account_id=$4
   AND status IN ('open','processing','escalated')
 ORDER BY created_at DESC LIMIT 1;
-- insert, merge, or severity upgrade
COMMIT;
```

所有公开方法必须显式接收 `workspaceId`；不提供裸 `id` 查询。

**Step 4: Run PostgreSQL and package checks**

Run: `npm test -- --run test/work-item-repository.test.ts && npm run typecheck && npm run lint`  
Expected: PASS.

**Step 5: Commit**

```bash
git add packages/db/src/work-item-repository.ts packages/db/src/index.ts packages/db/test/work-item-repository.test.ts
git commit -m "[be] 实现工作项事务仓储"
```

### Task 5: 规则扫描 Worker 编排

**Files:**
- Create: `apps/worker/src/rules/types.ts`
- Create: `apps/worker/src/rules/rule-scan-handler.ts`
- Test: `apps/worker/test/rule-scan-handler.test.ts`

**Step 1: Write failing orchestration tests**

使用内存 fake 覆盖：

- 命中规则创建工作项并仅对 created/upgraded 发通知；
- 同一扫描重跑得到 merged，不重复通知；
- `not_matched` 和 `insufficient_data` 不创建工作项；
- 返回 summary：evaluated/matched/notMatched/insufficient/created/upgraded/merged；
- 一个候选失败不吞掉其他候选，最终把失败明细返回给 job handler。

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/rule-scan-handler.test.ts` in `apps/worker`  
Expected: FAIL.

**Step 3: Implement ports and handler**

```ts
export interface RuleCandidateProvider {
  listCandidates(input: RuleScanInput): Promise<RuleCandidate[]>;
}

export interface WorkItemSink {
  createOrMerge(input: WorkItemAlertInput): Promise<{
    disposition: "created" | "upgraded" | "merged";
    workItemId: string;
  }>;
}

export interface AlertSink {
  enqueue(input: AlertDelivery): Promise<void>;
}
```

本任务不把 handler 注册进生产 runtime；没有持久化条件树和可靠候选数据前不伪装为可生产扫描。

**Step 4: Run worker checks**

Run: `npm test -- --run test/rule-scan-handler.test.ts && npm run typecheck && npm run lint`  
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/worker/src/rules apps/worker/test/rule-scan-handler.test.ts
git commit -m "[be] 实现规则扫描编排内核"
```

### Task 6: 全量质量门禁与交付留痕

**Files:**
- Modify: `docs/plans/B2-状态.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`
- Create: `docs/evidence/B2-代码质量报告.md`

**Step 1: Run all package tests**

Run in each package: `npm test -- --run`  
Expected: all PASS.

**Step 2: Run coverage, typecheck, lint**

Run in each package:

```bash
npm test -- --run --coverage
npm run typecheck
npm run lint
```

Expected: business source line coverage >=80%, all checks PASS.

**Step 3: Run dependency and secret checks**

Run: `npm audit --audit-level=high` in all four packages.  
Run repository scans for credential prefixes and dynamic execution patterns.  
Expected: Critical/High 0; no real credential or unsafe dynamic execution introduced.

**Step 4: Record exact boundaries**

状态和报告必须写明：

- 已完成领域/仓储/Worker 内核；
- 未实现 Web API、真实钉钉发送、生产 rule scan 注册；
- P-005 仍待 arch；
- 0 曝光/断崖生产取数仍待后续数据与 B3 操作史。

**Step 5: Commit**

```bash
git add docs/plans/B2-状态.md docs/plans/工作台账.md docs/relay/inbox-arch.md docs/evidence/B2-代码质量报告.md
git commit -m "[be] 完成B2队列内核质量门禁"
```

**Step 6: Self-review commit**

Run: `git show --stat HEAD && git diff --check <B2_BASE>..HEAD`  
Expected: only backend-owned paths and agreed docs changed; no contract or frontend file changed.
