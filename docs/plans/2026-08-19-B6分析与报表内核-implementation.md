# B6 Analysis and Reporting Core Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the contract-safe B6 reporting and analysis backend core without changing frozen database/API contracts or touching the frontend worktree.

**Architecture:** A strict internal `ReportExecutionPlan` separates future public report configuration from deterministic execution. Domain functions assemble trusted semantic facts, reconcile Gap, and apply strategy sample guards; a PostgreSQL adapter reuses B1c queries; a Worker handler provides idempotent generation through ports without choosing final artifact storage.

**Tech Stack:** TypeScript 5.9, Zod 4, Vitest 3, PostgreSQL 16, existing `@ka/domain`, `@ka/db`, and `apps/worker` packages.

---

### Task 1: Strict internal report execution plan

**Files:**
- Create: `packages/domain/test/report-plan.test.ts`
- Create: `packages/domain/src/report-plan.ts`
- Modify: `packages/domain/src/index.ts`

**Step 1: Write failing parser tests**

Cover one valid plan containing KPI, trend, grouped table, and bar components. Assert rejection of unknown fields (`sql`, `formula`, `schedule`, `rows`), invalid dates, unsupported metrics/dimensions, duplicate IDs, more than 24 components, empty metric lists, and mismatched component source/kind.

**Step 2: Run the focused test and verify failure**

Run: `npm test -- --run test/report-plan.test.ts`

Expected: FAIL because `report-plan.ts` and its exports do not exist.

**Step 3: Implement the minimal strict plan schema**

Implement:

```ts
export const INTERNAL_REPORT_PLAN_VERSION = "b6-internal-v1" as const;
export type ReportMetricKey = /* frozen internal whitelist */;
export type ReportDimensionKey = "account" | "task" | "biz";
export function parseReportExecutionPlan(input: unknown): ReportExecutionPlan;
export function fingerprintReportExecutionPlan(plan: ReportExecutionPlan): string;
```

Use strict discriminated Zod component schemas. Validate real calendar dates, `dateFrom <= dateTo`, unique component IDs, maximum counts, finite limits, and filter lengths. Fingerprinting must canonicalize object key order and component order exactly as supplied, use SHA-256, and include the internal version. The parser must never accept code, URLs, precomputed values, sharing, or scheduling.

**Step 4: Run focused and package checks**

Run:

```bash
npm test -- --run test/report-plan.test.ts
npm run typecheck
npm run lint
```

Expected: all PASS.

**Step 5: Commit**

```bash
git add packages/domain/src/report-plan.ts packages/domain/src/index.ts packages/domain/test/report-plan.test.ts
git commit -m "[be] 增加B6内部报表执行计划"
```

### Task 2: Trusted fact normalization and component dataset assembly

**Files:**
- Create: `packages/domain/test/report-dataset.test.ts`
- Create: `packages/domain/src/report-dataset.ts`
- Modify: `packages/domain/src/index.ts`

**Step 1: Write failing assembly tests**

Cover KPI, trend, grouped table, and bar outputs; finite/infinite/undefined ratio preservation; deterministic limit ordering; empty source; missing source; duplicate/foreign component facts; invalid cutoff timestamp; and one missing component not corrupting other components.

**Step 2: Run the focused test and verify failure**

Run: `npm test -- --run test/report-dataset.test.ts`

Expected: FAIL because the assembler does not exist.

**Step 3: Implement normalized facts and assembler**

Define structural facts independent of `@ka/db`:

```ts
export interface ReportFactsBundle {
  workspaceId: string;
  dataCutoffAt: string;
  summary: ReportMetricBag | null;
  trend: readonly ReportTrendFact[] | null;
  dimensions: Partial<Record<ReportDimensionKey, readonly ReportDimensionFact[]>>;
}

export function assembleReportDataset(
  plan: ReportExecutionPlan,
  facts: ReportFactsBundle,
): ReportDataset;
```

Metric values use `finite|infinite|undefined|missing`. Never coerce null/missing to zero. Component result status is `ready|empty|missing`. Sort breakdown rows by the first selected finite metric descending, then stable key; apply limit after sorting.

**Step 4: Run focused and package checks**

Run domain test, typecheck, and lint. Expected: all PASS.

**Step 5: Commit**

Commit only the dataset files with `[be] 装配可信报表组件数据`.

### Task 3: Gap reconciliation and strategy sample guards

**Files:**
- Create: `packages/domain/test/gap-reconciliation.test.ts`
- Create: `packages/domain/src/gap-reconciliation.ts`
- Create: `packages/domain/test/strategy-analysis.test.ts`
- Create: `packages/domain/src/strategy-analysis.ts`
- Modify: `packages/domain/src/index.ts`

**Step 1: Write failing Gap tests**

Cover equal values, positive/negative difference, real conversion zero with positive media conversion, both zero, explicit missing, negative/non-finite rejection, and evidence output.

**Step 2: Implement Gap reconciliation minimally**

Return signed difference, `RatioValue`, `matched|mismatch|undefined|missing`, and source facts. Do not add normal/abnormal business thresholds.

**Step 3: Write failing strategy tests**

Cover account deduplication, `<3` accounts, `<100` cost, zero real conversions, only eligible finite cells competing, stable tie-breaking, invalid numeric observation, and no-winner result.

**Step 4: Implement strategy aggregation and guard**

Aggregate by generic `rowKey/columnKey`; recompute CPA from summed cost/summed real conversions. Use constants `MIN_STRATEGY_ACCOUNTS=3` and `MIN_STRATEGY_COST=100` from the PRD. Return structured cells, exclusion reasons, and optional winner; no generated prose.

**Step 5: Run all new domain tests and checks**

Expected: all PASS; no existing metric behavior changes.

**Step 6: Commit**

Commit with `[be] 增加Gap对账与策略样本护栏`.

### Task 4: B1c semantic query adapter

**Files:**
- Create: `packages/db/test/report-facts-source.test.ts`
- Create: `packages/db/src/report-facts-source.ts`
- Modify: `packages/db/src/index.ts`

**Step 1: Write failing PostgreSQL adapter tests**

Use migrated PostgreSQL fixtures. Cover summary/trend/dimension mapping, tenant isolation, only requested dimensions loaded, repeated same-dimension components issuing one query, RatioValue preservation, and propagation of `AmbiguousTaskMappingError`.

**Step 2: Start PostgreSQL and verify the test initially fails**

Run:

```bash
docker compose up -d
npm test -- --run test/report-facts-source.test.ts
```

from `packages/db`.

Expected: PostgreSQL healthy; test FAIL because the adapter does not exist.

**Step 3: Implement `SemanticReportFactsSource`**

Wrap an injected `SemanticQueryRepository`-compatible port. Derive required summary/trend/dimensions from the validated plan, deduplicate calls, map existing metric summaries without recomputing ratios, and return the exact requested workspace. Obtain `dataCutoffAt` from an injected clock/cutoff provider rather than inventing it from query completion time.

**Step 4: Run DB focused tests, all DB tests, typecheck, and lint**

Expected: all PASS; migration unchanged.

**Step 5: Commit**

Commit with `[be] 适配语义层报表事实源`.

### Task 5: Idempotent report generation Worker

**Files:**
- Create: `apps/worker/src/reports/types.ts`
- Create: `apps/worker/src/reports/report-generation-handler.ts`
- Create: `apps/worker/src/reports/index.ts`
- Create: `apps/worker/test/reports/report-generation-handler.test.ts`

**Step 1: Write failing Worker tests**

Use memory ports. Cover generated, duplicate retry, malformed plan, cross-workspace facts, plan source failure, facts source failure, artifact sink failure, stable idempotency key, and safe error summary without raw plan/credential text.

**Step 2: Run focused Worker test and verify failure**

Run: `npm test -- --run test/reports/report-generation-handler.test.ts`

Expected: FAIL because report Worker modules do not exist.

**Step 3: Implement ports and handler**

Ports:

```ts
interface ReportPlanSource { load(input): Promise<unknown>; }
interface ReportFactsSource { load(input): Promise<ReportFactsBundle>; }
interface ReportArtifactSink { saveOnce(input): Promise<"saved" | "duplicate">; }
interface ReportRunLog { succeeded(input): Promise<void>; failed(input): Promise<void>; }
```

The handler parses the unknown plan, verifies workspace ownership, loads facts, assembles the dataset, derives the idempotency key from workspace/report/plan fingerprint/asOf, saves once, and records a safe terminal event. It must never register itself in the production runtime in B6 because job type/API contracts are not frozen.

**Step 4: Run focused and Worker package checks**

Expected: all PASS.

**Step 5: Commit**

Commit with `[be] 增加幂等报表生成Worker内核`.

### Task 6: Full quality gate and adversarial review

**Files:**
- Modify as findings require, only within B6-owned backend files.
- Create: `docs/evidence/B6-代码质量报告.md`

**Step 1: Run all package tests**

Run all four packages' test suites. Expected: all PASS.

**Step 2: Run coverage**

Run Vitest coverage for domain, db, worker, and dingtalk-gateway. Expected: business source line coverage remains at least 80% for each package and every new B6 module at least 80%.

**Step 3: Run type, lint, dependency, and diff gates**

Run typecheck/lint for all packages, `npm audit --audit-level=high`, `git diff --check be/b5..HEAD`, and credential/dynamic-execution scans. Expected: 0 Critical/High, no credentials, no new arbitrary execution, clean diff.

**Step 4: Run PostgreSQL regression**

Run migrations and all DB tests against PostgreSQL 16. Because B6 has no migration, schema hash/diff must remain unchanged from B5.

**Step 5: Write evidence report and fix findings**

Record exact commands, counts, coverage, limitations, and any remediation. Do not call fake/local verification production integration.

**Step 6: Commit**

Commit with `[be] 完成B6质量门禁`.

### Task 7: Status, master ledger, and Claude audit handoff

**Files:**
- Modify: `docs/plans/B6-状态.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1: Update B6 task checklist and exact verification results**

Mark only actually completed items. Include functional review SHA and final branch SHA distinction.

**Step 2: Add P-010 B6 contract differences and audit checklist**

List precise unresolved public config DTO, assets/share permissions, schedule/export, snapshot storage, missing strategy dimensions, and Worker job type questions. Include per-module audit targets and explicit non-goals.

**Step 3: Update the master ledger and work ledger**

Add B6 to the linear chain, exact functionality, tests, evidence, and “not production integration” boundary.

**Step 4: Run final documentation diff check and commit**

Expected: clean working tree, branch ahead of B5 only by B6 commits, no frontend or contract changes.

Commit with `[be] 回执B6分析与报表内核`.
