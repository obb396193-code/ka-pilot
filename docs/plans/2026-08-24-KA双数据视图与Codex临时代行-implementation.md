# KA 双数据视图与 Codex 临时代行 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不触碰现有 `fe/f001` 脏工作区的前提下，建立 KA Data / 自建主线 / 对账三态数据 Contract，完成可复用前端纵向切片，并让临时 Codex 审查和 Claude 后续终审都有可追溯交接。

**Architecture:** 从已完成后端分支建立干净集成基线；在 Contract 层新增 `DataViewMode`、来源元数据和对账响应，KA Data 通过白名单 Query Registry 接入，自建数据保持现有 canonical 查询。前端只消费统一 Contract；两个独立 Codex 任务分别负责只读预审和隔离分支上的纵向切片，根任务审计后再形成候选集成。

**Tech Stack:** TypeScript、Node.js、PostgreSQL、Vitest、Zod、Next.js App Router、TanStack Table、ECharts、Playwright、shadcn/ui。

---

## 前置边界

- 禁止在 `/Users/aik/Desktop/投放agent` 当前 `fe/f001` 工作树中改代码或整理他人未提交修改。
- 新实现基线从已完成后端分支构建；每次 cherry-pick 前记录源 SHA 和冲突。
- 任何真实 KA Data token、URL 参数、账户 ID、金额不进入仓库；测试用固定脱敏 fixture。
- 浏览器不得提交原始 SQL；只有服务端 Query Registry 能选择预定义模板。
- 临时 Codex 结论只能是 `codex_prechecked`，不能写成 Claude/arch 已批准。

### Task 1: 冻结干净集成基线和上下文包

**Files:**
- Create: `docs/context/claude-main-session-index.md`
- Create: `docs/context/interim-agent-status.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: 写基线检查脚本的失败断言**

在计划执行日志中记录以下检查要求：当前主工作树分支必须为 `fe/f001` 且非干净；新实现 worktree 必须干净；不得把主工作树未跟踪文件复制进实现分支。

**Step 2: 创建独立实现分支/worktree**

Run:

```bash
git worktree add -b codex/dual-data-integration /private/tmp/ka-dual-data be/b22
```

Expected: `/private/tmp/ka-dual-data` 为 clean，且包含 `apps/worker`、`packages/db`、`packages/domain`、`packages/contract`。

**Step 3: 写 Claude 会话索引**

索引必须包含原始 JSONL 路径、2,785 行快照、SHA-256、关键决策行号、当前有效文档入口、被后续决策覆盖的旧结论和只读规则。不得复制整份 JSONL 入仓。

**Step 4: 写临时协作状态文件**

状态固定为：

```text
draft -> codex_prechecked -> candidate_integrated
      -> awaiting_claude_review -> claude_approved | redo_required
```

**Step 5: 校验并提交**

Run: `git diff --check`

Expected: exit 0。

```bash
git add docs/context docs/plans/工作台账.md
git commit -m "docs: 建立临时Agent上下文与状态基线"
```

### Task 2: 扩展双数据 Contract

**Files:**
- Create: `packages/contract/src/data-view.ts`
- Create: `packages/contract/test/data-view.test.ts`
- Modify: `packages/contract/api.md`
- Modify: `packages/contract/metrics.md`
- Modify: `packages/contract/package.json`

**Step 1: 写失败测试**

```ts
import { describe, expect, it } from "vitest";
import { dataQueryRequestSchema, dataQueryResponseMetaSchema } from "../src/data-view";

describe("dual data contract", () => {
  it("accepts the three explicit view modes", () => {
    for (const dataView of ["ka_data", "platform", "reconcile"]) {
      expect(dataQueryRequestSchema.parse({ dataView, queryId: "account.summary", params: {} }).dataView)
        .toBe(dataView);
    }
  });

  it("requires source lineage in every response", () => {
    expect(() => dataQueryResponseMetaSchema.parse({ dataAsOf: "2026-08-24T00:00:00Z" }))
      .toThrow();
  });
});
```

**Step 2: 运行测试确认失败**

Run: `npm test -- --run test/data-view.test.ts`

Expected: FAIL，模块不存在。

**Step 3: 实现最小 Schema**

```ts
export const dataViewModeSchema = z.enum(["ka_data", "platform", "reconcile"]);
export const sourceLineageSchema = z.object({
  source: z.enum(["ka_data", "qihang_realtime", "qihang_offline", "canonical"]),
  datasetVersion: z.string().min(1),
  dataAsOf: z.string().datetime(),
  coverage: z.object({ complete: z.boolean(), reason: z.string().optional() }),
  truncated: z.boolean().default(false),
});
```

响应元数据必须能表达双边 lineage、匹配率、未匹配对象数和口径差异；不使用单个 `_data_source` 覆盖来源。

**Step 4: 运行测试**

Run: `npm test -- --run test/data-view.test.ts`

Expected: PASS。

**Step 5: 文档化接口并提交**

新增 `POST /api/v1/data/query`，请求只接受 `queryId + params + dataView`，不接受 `sql`。

```bash
git add packages/contract
git commit -m "feat: 定义双数据视图查询契约"
```

### Task 3: 实现服务端 Query Registry

**Files:**
- Create: `apps/worker/src/data/query-registry.ts`
- Create: `apps/worker/src/data/query-types.ts`
- Create: `apps/worker/test/query-registry.test.ts`

**Step 1: 写失败测试**

覆盖：未知 queryId 拒绝、未知参数拒绝、日期超范围拒绝、前端传 `sql` 拒绝、每个查询声明允许的数据源和最大行数。

```ts
expect(() => registry.resolve("raw.sql", { sql: "select * from x" })).toThrow("QUERY_NOT_ALLOWED");
expect(registry.resolve("account.summary", { ds: "20260824" }).maxRows).toBeLessThanOrEqual(10_000);
```

**Step 2: 运行确认失败**

Run: `npm test -- --run test/query-registry.test.ts`

Expected: FAIL。

**Step 3: 实现最小白名单**

首批仅注册：

- `account.summary`
- `account.trend`
- `account.table`
- `account.anomalies`
- `account.detail`
- `reconcile.account_daily`

每项含 `paramsSchema`、`supportedViews`、`maxDateSpanDays`、`maxRows`、`requiredDimensions`。

**Step 4: 测试通过并提交**

Run: `npm test -- --run test/query-registry.test.ts`

```bash
git add apps/worker/src/data apps/worker/test/query-registry.test.ts
git commit -m "feat: 增加双数据查询白名单注册表"
```

### Task 4: 实现 KA Data Adapter

**Files:**
- Create: `apps/worker/src/data/ka-data/config.ts`
- Create: `apps/worker/src/data/ka-data/client.ts`
- Create: `apps/worker/src/data/ka-data/adapter.ts`
- Create: `apps/worker/src/data/ka-data/errors.ts`
- Create: `apps/worker/test/ka-data-adapter.test.ts`
- Modify: `apps/worker/.env.example`

**Step 1: 写失败测试**

用 mock HTTP 覆盖：Bearer 只从环境读取、10k/16MB 截断标记、超时、非 JSON、上游错误、SQL 模板从 Registry 取得、响应映射保留数据集版本。

**Step 2: 运行确认失败**

Run: `npm test -- --run test/ka-data-adapter.test.ts`

Expected: FAIL。

**Step 3: 最小实现**

配置只允许：

```ts
KA_DATA_BASE_URL=
KA_DATA_READER_TOKEN=
KA_DATA_ACCESS_MODE=internal_trial_shared_reader
KA_DATA_TIMEOUT_MS=15000
```

Adapter 输入为已解析的 Registry entry 与 params；禁止接受 caller 提供的 SQL 字符串。输出统一为 `{ rows, lineage, warnings }`。

**Step 4: 测试与静态检查**

Run:

```bash
npm test -- --run test/ka-data-adapter.test.ts
npm run typecheck
npm run lint
```

Expected: 全部通过。

**Step 5: 提交**

```bash
git add apps/worker/src/data/ka-data apps/worker/test/ka-data-adapter.test.ts apps/worker/.env.example
git commit -m "feat: 接入KA Data只读适配器"
```

### Task 5: 实现账户命名空间映射和对账引擎

**Files:**
- Create: `packages/db/migrations/010_data_source_mapping.cjs`
- Create: `packages/db/src/data-source-mapping-repository.ts`
- Create: `packages/db/test/data-source-mapping-repository.test.ts`
- Create: `packages/domain/src/reconcile.ts`
- Create: `packages/domain/test/reconcile.test.ts`
- Modify: `packages/domain/src/index.ts`

**Step 1: 写迁移失败测试**

表至少包含：`workspace_id`、`source_system`、`source_object_type`、`source_object_id`、`canonical_object_id`、`match_status`、`valid_from`、`valid_to`、`evidence`、唯一约束和租户隔离。

**Step 2: 写对账纯函数失败测试**

覆盖：匹配对象差值、分母 0 时差异率为 null、未匹配对象双边保留、实时/离线口径不直接判错、未知原因不自动生成。

**Step 3: 实现迁移、仓储和纯函数**

```ts
type ReconcileReason =
  | "time_not_aligned"
  | "metric_definition_diff"
  | "object_unmapped"
  | "partition_incomplete"
  | "source_error"
  | "business_difference"
  | "needs_investigation";
```

**Step 4: 跑测试和迁移重放**

Run:

```bash
npm test -- --run test/reconcile.test.ts
npm test -- --run test/data-source-mapping-repository.test.ts
npm run migrate:down
npm run migrate:up
```

Expected: 全部通过，down/up 可重放。

**Step 5: 提交**

```bash
git add packages/db packages/domain
git commit -m "feat: 增加数据源映射与对账内核"
```

### Task 6: 组装统一查询服务和 API

**Files:**
- Create: `apps/worker/src/data/query-service.ts`
- Create: `apps/worker/test/query-service.test.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `packages/contract/api.md`

**Step 1: 写失败测试**

覆盖三种 mode、来源不可用时显式降级、目标不支持指标时返回 unavailable、KA Data 超限时 `truncated=true`、对账必须返回双方 lineage。

**Step 2: 运行确认失败**

Run: `npm test -- --run test/query-service.test.ts`

Expected: FAIL。

**Step 3: 实现路由**

```ts
switch (request.dataView) {
  case "ka_data": return kaData.query(entry, request.params);
  case "platform": return platform.query(entry, request.params);
  case "reconcile": return reconcile(await Promise.all([
    kaData.query(entry, request.params),
    platform.query(entry, request.params),
  ]));
}
```

错误必须使用稳定 code：`QUERY_NOT_ALLOWED`、`VIEW_UNSUPPORTED`、`SOURCE_UNAVAILABLE`、`SOURCE_TRUNCATED`、`OBJECT_UNMAPPED`。

**Step 4: 全量验证并提交**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add apps/worker packages/contract/api.md
git commit -m "feat: 组装双数据统一查询服务"
```

### Task 7: 为临时前端建立独立分支和 mock Contract

**Files:**
- Create: `apps/web/lib/data/data-view.ts`
- Create: `apps/web/lib/data/client.ts`
- Create: `apps/web/lib/data/mock.ts`
- Create: `apps/web/lib/data/data-view.test.ts`
- Modify: `apps/web/package.json`

**Step 1: 从集成基线创建前端 worktree**

Run:

```bash
git worktree add -b codex/fe-vertical-slice /private/tmp/ka-fe-vertical codex/dual-data-integration
```

Expected: clean；不得使用当前 `fe/f001` worktree。

**Step 2: 写失败测试**

覆盖：URL 中保存 `data_view`、切换保留兼容筛选、reconcile mock 两侧 lineage、无能力字段为 unavailable 而非 0。

**Step 3: 实现 client 与 mock**

client 只认 Contract；页面不得计算 CPA、差异率或状态。

**Step 4: 验证并提交**

Run: `npm test && npm run check`

```bash
git add apps/web/lib/data apps/web/package.json
git commit -m "feat: 建立前端双数据Contract层"
```

### Task 8: 实现纵向切片共享组件

**Files:**
- Create: `apps/web/components/data-view/data-view-switcher.tsx`
- Create: `apps/web/components/data-view/source-lineage-badge.tsx`
- Create: `apps/web/components/data-view/data-health-banner.tsx`
- Create: `apps/web/components/data-view/reconcile-table.tsx`
- Create: `apps/web/components/data-view/data-state.tsx`
- Create: `apps/web/components/data-view/data-view.test.tsx`

**Step 1: 写组件失败测试**

覆盖：键盘可操作、状态可读、来源/截止时间可见、截断警告、未匹配对象、切换后筛选保持。

**Step 2: 运行确认失败**

Run: `npm test -- --run components/data-view/data-view.test.tsx`

**Step 3: 优先从官方资产库选择组件**

按 `apps/web/AGENTS.md` 和 `docs/frontend/ui-assets/`：先查 shadcn/coss/ReUI/Tremor/Dice 候选；记录来源、许可证和选择理由，只写业务适配层。

**Step 4: 实现并验证**

Run: `npm test && npm run check`

**Step 5: 提交**

```bash
git add apps/web/components/data-view
git commit -m "feat: 增加双数据视图共享组件"
```

### Task 9: 实现五页纵向切片

**Files:**
- Modify: `apps/web/app/(main)/page.tsx`
- Modify: `apps/web/app/(main)/data/page.tsx`
- Modify: `apps/web/app/(main)/accounts/page.tsx`
- Create: `apps/web/app/(main)/accounts/[accountId]/page.tsx`
- Create: `apps/web/app/(main)/diagnostics/[findingId]/page.tsx`
- Create: `apps/web/app/(main)/changesets/[changesetId]/page.tsx`
- Create: `apps/web/e2e/vertical-slice.spec.ts`

**Step 1: 写 E2E 失败用例**

路径：工作台异常项 → 数据分析对账 → 账户详情 → 异常诊断 → 变更预览。断言切换数据视图后来源徽标改变、筛选保留、确认页不自动执行写操作。

**Step 2: 运行确认失败**

Run: `npm run e2e -- vertical-slice.spec.ts`

Expected: FAIL，路由或元素不存在。

**Step 3: 实现页面**

所有页面覆盖：loading、empty、error、no-access、partial、stale、success。变更页只做 preview/risk/confirm UI；不接真实媒体写操作。

**Step 4: 视觉与无障碍验收**

Run:

```bash
npm run check
npm run e2e -- vertical-slice.spec.ts
```

人工检查：1440×900、1366 宽度、390 移动端；表格数字 tabular；来源/口径不靠颜色单独表达；无横向页面溢出。

**Step 5: 提交**

```bash
git add apps/web
git commit -m "feat: 完成双数据纵向业务切片"
```

### Task 10: 独立 Codex 预审与根任务审计

**Files:**
- Create: `docs/reviews/2026-08-24-dual-data-codex-precheck.md`
- Create: `docs/relay/inbox-review-codex.md`
- Create: `docs/relay/inbox-fe-codex.md`
- Modify: `docs/context/interim-agent-status.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: 临时审查任务只读检查**

审查维度：指标口径、来源追踪、截断/部分数据、SQL 注入、共享凭证出口、租户隔离、对象映射、对账纯函数、写操作确认门、错误降级、测试遗漏。

**Step 2: 根任务逐项核验报告**

每条问题标：`accepted / adjusted / rejected`，附实际文件行号、测试和复核结果；不得默认采信 Agent 汇报。

**Step 3: 修复 P0/P1 后重跑门禁**

Run:

```bash
git diff --check
npm test
npm run typecheck
npm run lint
```

前端 worktree另跑 `npm run check` 和 E2E。

**Step 4: 更新状态并提交**

只有门禁全过才可将状态改为 `candidate_integrated`；随后立即进入 `awaiting_claude_review`。

```bash
git add docs/reviews docs/relay docs/context docs/plans/工作台账.md
git commit -m "docs: 完成双数据候选预审与交接"
```

### Task 11: 生成 Claude 终审包

**Files:**
- Create: `docs/reviews/2026-08-24-dual-data-claude-handoff.md`
- Modify: `docs/relay/inbox-arch.md`
- Modify: `docs/relay/inbox-fe.md`

**Step 1: 汇总不可省略的证据**

- 基线和实现 commit 范围；
- 被 cherry-pick 的后端分支与 SHA；
- 原始需求 `REQ` 映射；
- 两个 Codex 任务 ID、状态和交付；
- 全部测试/构建/E2E/截图；
- 临时审查 accepted/adjusted/rejected；
- 已知缺口和可能重做的前端范围；
- Claude 主会话 JSONL 原件路径、hash 与关键行号。

**Step 2: 明确终审问题**

Claude 必须裁决：双源权威矩阵、Query Registry public Contract、共享只读试用边界、对账对象映射、Runtime 与 Multica 路由、前端切片是否保留/重做。

**Step 3: 校验并提交**

Run: `git diff --check`

```bash
git add docs/reviews docs/relay
git commit -m "docs: 形成双数据Claude终审包"
```

## 完成定义

- 后端三态 Contract、KA Data Adapter、Query Registry、对象映射和对账纯函数有测试；
- 前端纵向切片能在三种数据视图间切换，并清楚显示来源、时效、覆盖与差异；
- 当前 `fe/f001` 脏工作区未被改动；
- 两个 Codex 任务及根任务的所有动作、SHA、验证和问题都有台账；
- 状态停在 `awaiting_claude_review`，不提前宣称 Claude 已通过。
