# B1b 回灌、聚合与数据对平 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建立可断点恢复、实时优先、按日独立重试的 90 天回灌链路，并在 canonical 聚合后自动完成三类数据质量检查。

**Architecture:** 使用 `backfill_historical` 协调器一次扇出确定性 `backfill_day` job；日任务只抓目标日离线数据，然后以确定性后续 job 串起 canonical 与 data quality。数据库仍以契约 v1.1 的 jobs/backfill_jobs/data_quality_checks 为真相，不新增平行任务表；Worker 用 heartbeat 和启动回收保证单 job 不被重复执行。

**Tech Stack:** Node.js 20、TypeScript、PostgreSQL 16、node-pg-migrate、Vitest、Zod、原生 fetch。

---

### Task 1: 固化 B1b 状态、优先级与确定性 Job ID

**Files:**
- Create: `docs/plans/B1b-状态.md`
- Create: `apps/worker/src/jobs/priorities.ts`
- Create: `apps/worker/src/jobs/deterministic-id.ts`
- Test: `apps/worker/test/job-scheduling.test.ts`

**Step 1: Write the failing test**

验证 `etl_incr < rule_scan < default < backfill_day`，同一 key 生成相同 UUID，不同 key 生成不同 UUID且符合 UUID 格式。

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/job-scheduling.test.ts` in `apps/worker`  
Expected: FAIL，模块不存在。

**Step 3: Write minimal implementation**

```ts
export const JOB_PRIORITY = {
  ETL_INCREMENTAL: 1,
  RULE_SCAN: 3,
  DEFAULT: 5,
  BACKFILL: 9,
} as const;

export function deterministicJobId(key: string): string {
  // SHA-256 前 16 bytes，设置 UUID v5 variant/version bits 后格式化
}
```

状态文件记录 R-008、设计 SHA、当前清单与真实验证数字。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/job-scheduling.test.ts && npm run typecheck && npm run lint`  
Expected: PASS。

**Step 5: Commit**

```bash
git add apps/worker docs/plans/B1b-状态.md
git commit -m "[be] 固化B1b任务优先级与确定性ID"
```

### Task 2: 完善 JobRepository 的幂等入队、heartbeat 与启动回收

**Files:**
- Modify: `packages/db/src/job-repository.ts`
- Modify: `apps/worker/src/jobs/consumer.ts`
- Modify: `apps/worker/src/runtime.ts`
- Test: `packages/db/test/job-repository.test.ts`
- Test: `apps/worker/test/job-consumer.test.ts`

**Step 1: Write the failing tests**

覆盖：

- 同一确定性 ID 入队两次只存在一行，且第二次不覆盖 credential owner。
- `extendLease(id, seconds)` 只更新 running job。
- `recoverStaleLeases(10 minutes)` 只回收超过阈值的 leased/running job。
- handler 运行期间定时 heartbeat，结束后清 timer；heartbeat 失败让本次 job 失败，不静默继续。

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run test/job-repository.test.ts` in `packages/db`; `npm test -- --run test/job-consumer.test.ts` in `apps/worker`  
Expected: FAIL，新方法不存在。

**Step 3: Write minimal implementation**

扩展 `NewJob` 支持可选 `id`，SQL 使用：

```sql
INSERT INTO jobs (id, ...)
VALUES (COALESCE($1, gen_random_uuid()), ...)
ON CONFLICT (id) DO NOTHING
RETURNING id
```

冲突时再查询原行并校验 workspace/job_type/credential_owner 不变。Consumer 在 handler 执行时每 `leaseSeconds / 2` 延长 lease，Worker 启动后先运行一次 10 分钟陈旧 lease 回收。

**Step 4: Run tests to verify they pass**

Run DB/Worker 对应测试、typecheck、lint。  
Expected: PASS。

**Step 5: Commit**

```bash
git add packages/db apps/worker
git commit -m "[be] 增强任务幂等与lease恢复"
```

### Task 3: 实现 backfill_jobs 仓储与协调器

**Files:**
- Create: `packages/db/src/backfill-repository.ts`
- Modify: `packages/db/src/index.ts`
- Create: `apps/worker/src/backfill/payload.ts`
- Create: `apps/worker/src/backfill/coordinator-handler.ts`
- Test: `packages/db/test/backfill-repository.test.ts`
- Test: `apps/worker/test/backfill-coordinator.test.ts`

**Step 1: Write the failing tests**

覆盖创建批次、锁定批次、读取日期范围、更新最高连续终态日期、汇总 done/partial_failed；协调器只调用一次账户发现并为每个日期生成 priority=9、同 owner 的确定性 `backfill_day` job。

**Step 2: Run tests to verify they fail**

Expected: FAIL，仓储与 handler 不存在。

**Step 3: Write minimal implementation**

协调器 payload：

```ts
{
  workspaceId: UUID,
  backfillId: positiveInt,
  dateFrom: ISODate,
  dateTo: ISODate,
  accountIds?: string[],
  userId: string,            // 由 withQihangIdentity 注入
  fetchedByUserId: UUID
}
```

若未给 accountIds，调用一次 `resource=account` 分页发现；随后逐日 `enqueue({id: deterministicJobId(...), jobType:'backfill_day', priority:9, credentialOwnerUserId:原owner})`。协调器重试不会重复子任务。

**Step 4: Run tests to verify they pass**

Run package tests + typecheck + lint。  
Expected: PASS。

**Step 5: Commit**

```bash
git add packages/db apps/worker
git commit -m "[be] 实现90天回灌协调与断点仓储"
```

### Task 4: 实现独立 backfill_day 与阶段衔接

**Files:**
- Create: `apps/worker/src/backfill/day-handler.ts`
- Modify: `apps/worker/src/runtime.ts`
- Modify: `packages/db/src/etl-run-repository.ts`
- Test: `apps/worker/test/backfill-day.test.ts`

**Step 1: Write the failing tests**

断言单日 handler：只调用一次 `account_offline(beginDate=ds,endDate=ds)`；不调用 account/account_realtime；raw 带 request_params；成功后确定性入队 `canonical_merge`；失败写 `etl_runs.step_failed=fetch:account_offline` 并抛出，由 consumer 独立重试。

**Step 2: Run test to verify it fails**

Expected: FAIL，handler 不存在。

**Step 3: Write minimal implementation**

扩展 EtlRunRepository 接受 `backfill_day/canonical/quality` run kind。handler 用原 job 的 workspace/owner，完成 raw append 后入队单日 canonical；使用确定性 ID 保证“入队成功后进程崩溃再重试”不会重复阶段任务。

**Step 4: Run tests to verify they pass**

Run worker test/typecheck/lint。  
Expected: PASS。

**Step 5: Commit**

```bash
git add apps/worker packages/db
git commit -m "[be] 增加按日离线回灌处理器"
```

### Task 5: 补齐 canonical 批次留痕与零耗日口径

**Files:**
- Modify: `apps/worker/src/etl/canonical-handler.ts`
- Modify: `packages/db/src/metrics-repository.ts`
- Modify: `packages/domain/src/metrics.ts`
- Test: `apps/worker/test/canonical-handler.test.ts`
- Test: `packages/db/test/metrics-repository.test.ts`
- Test: `packages/domain/test/metrics.test.ts`

**Step 1: Write the failing tests**

覆盖 canonical 的 etl_run start/finish/fail、rows_ingested、阶段错误；历史均值剔除 0/null；同日生效考核价和系数；完成后确定性入队 quality job。

**Step 2: Run tests to verify they fail**

Expected: FAIL，新留痕/回调缺失。

**Step 3: Write minimal implementation**

Canonical handler 依旧只调用 domain 函数；repository 只负责查生效版本、历史 spend 和 upsert。将 spend history 传入既有零耗日函数，不在 SQL/Agent 重写公式。成功后入队 `data_quality_check`。

**Step 4: Run tests to verify they pass**

Run domain/db/worker tests + static checks。  
Expected: PASS。

**Step 5: Commit**

```bash
git add packages/domain packages/db apps/worker
git commit -m "[be] 补齐canonical聚合留痕与阶段衔接"
```

### Task 6: 实现三类数据质量检查与告警

**Files:**
- Create: `packages/db/src/data-quality-repository.ts`
- Modify: `packages/db/src/index.ts`
- Create: `apps/worker/src/quality/check-handler.ts`
- Modify: `apps/worker/src/notifications/types.ts`
- Modify: `apps/worker/src/runtime.ts`
- Test: `packages/db/test/data-quality-repository.test.ts`
- Test: `apps/worker/test/data-quality-check.test.ts`

**Step 1: Write the failing tests**

覆盖：

- raw 重复抓取时只取 latest account_offline，对平不会双计。
- 总量差异正好 0.1% 通过，超过失败；0 对 0 通过。
- CPA 超 5 倍阈值设置 data_anomaly 并记录 sample。
- 活跃账户连续两日缺失失败并入 outbound；单日缺失不告警。
- 每次检查均写 data_quality_checks，检查失败不回滚 canonical。

**Step 2: Run tests to verify they fail**

Expected: FAIL，quality 仓储/handler 不存在。

**Step 3: Write minimal implementation**

Repository 用参数化 SQL 和 latest raw CTE 提供检查输入，handler 依次写 `total_reconciliation`、`cpa_outlier`、`missing_consecutive_days`。任一失败入 outbound `data_quality_failed`，但 handler 自身完成，避免对同一确定性检查无限重试。

**Step 4: Run tests to verify they pass**

Run db/worker tests + static checks。  
Expected: PASS。

**Step 5: Commit**

```bash
git add packages/db apps/worker
git commit -m "[be] 增加三类数据质量检查与告警"
```

### Task 7: 跑通 10 账户 × 90 天 PostgreSQL 冒烟

**Files:**
- Create: `scripts/b1b-90d-smoke.ts`
- Create: `docs/evidence/B1b-90天回灌日志.txt`（运行生成的脱敏假数据证据）
- Create: `docs/evidence/B1b-90天回灌.png`（终端/报告截图）
- Modify: `docs/plans/B1b-状态.md`

**Step 1: Build the deterministic fixture**

生成固定 workspace、10 个脱敏账户、连续 90 日 account_offline raw；明确文件头为假数据。配置生效考核价和渠道系数。

**Step 2: Run the pipeline**

Run: `npx tsx scripts/b1b-90d-smoke.ts`  
Expected progress: `day 1/90 ... day 90/90`。

**Step 3: Verify exact outcomes**

断言：

- `account_metrics_daily=900`
- 每日 canonical 总量等于 latest raw 总量
- 270 条质量检查（90 日 × 3 类）全部 passed
- 无 failed/blocked_auth job
- backfill status=done，cursor_date=date_to

**Step 4: Capture evidence**

把真实命令输出保存为脱敏日志，并渲染为 PNG；不得使用手写“通过”截图冒充运行结果。

**Step 5: Commit**

```bash
git add scripts docs/evidence docs/plans/B1b-状态.md
git commit -m "[be] 验证90天回灌与数据对平"
```

### Task 8: 最终质量门禁与信箱回执

**Files:**
- Modify: `docs/plans/B1b-状态.md`
- Modify: `docs/relay/inbox-codex.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1: Run all package gates**

Run in domain/db/worker/gateway：tests with coverage、typecheck、lint、`npm audit --audit-level=high`。  
Expected: 全绿，业务源码行覆盖率均 ≥80%，0 high vulnerabilities。

**Step 2: Run security and complexity checks**

检查明文 token/私钥、动态执行、非参数化 SQL、最长文件、diff whitespace。  
Expected: 无 Critical/High。

**Step 3: Update records**

状态文件记录真实测试数、覆盖率、90 天结果；信箱给 arch 最终 SHA、设计修正和 mock/真实联调边界。

**Step 4: Commit**

```bash
git add docs/plans/B1b-状态.md docs/relay/inbox-codex.md docs/relay/inbox-arch.md
git commit -m "[be] 回执B1b回灌与对平交付"
```

**Step 5: Final self-check**

Run: `git status --short --branch && git show --stat HEAD`  
Expected: clean `be/b1b` and reviewable final SHA。
