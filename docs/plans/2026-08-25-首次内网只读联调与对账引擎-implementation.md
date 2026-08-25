# 首次内网只读联调与对账引擎 Implementation Plan

> **状态更新（2026-08-25）：不再作为首次内网前置任务包。** 对账引擎 G2-G4 暂停派发；奇航为默认主通路，KA Data 只作备用/管理员诊断，见 `docs/decisions/2026-08-25-奇航主源与KAData备用路径.md`。内部试用身份和多租户作为独立后端批次推进。

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在不开放任何媒体写操作的前提下，完成真实 KA Data、自建 Platform、双源对账和内网固定试用身份的端到端只读纵切片，并达到可部署、可回滚、可审计状态。

**Architecture:** 浏览器只访问同源 Next BFF；BFF 从服务端批准身份解析固定 workspace/user/account tuple，再用内部 Bearer 调 Worker Data API。Worker 通过 Query Registry 分别调用 KA Data 与 PostgreSQL Platform Adapter，统一输出 Canonical Row；对账纯函数按 `(workspace_id,media,account_id,ds)` 做 union join，只并列原值并计算已冻结可比指标，不生成第三个主数。首次 daily 内网试用可用显式固定服务端 scope，BUC 仍作为正式应用接入批次。

**Tech Stack:** Next.js 15 Route Handler、TypeScript、Zod、Node test/Vitest、PostgreSQL 16、Worker HTTP Data API。

---

## 0. 老板裁决门（未批准前不派发、不部署）

本文件只是 root 汇总的候选任务包，不等于已经给前端/后端派活。老板批准 G1~G4 后：root 先冻结 Task 1 Contract；随后后端执行 Task 2/3、前端执行 Task 4/5，root 每批独立复核；Task 6/7 由 root 集成与验收。任何人在批准前不得把内容追加为实现方“待处理”信箱任务。

### G1 首次内网试用身份

- A（推荐）：沿用 `docs/plans/BUC接入定案.md` 已定 demo 节奏，daily 使用显式 `internal_trial_static` 服务端固定 scope；页面显示“固定试用身份”，浏览器不能提交或覆盖 workspace/user/account。
- B：首次 daily 就接 BUC；需要先创建 Aone 平台应用、老板完成 BUC 自助注册/白名单并提供 Secret 引用，周期更长。

无论选 A/B：真实账号、workspace、token 只能进 Secret/config，不进 Git、聊天、截图、日志。

### G2 对账差值方向

- 推荐冻结：`delta = platform - ka_data`；`deltaRate = (platform - ka_data) / ka_data`。
- 理由：当前脱敏 Mock 已使用该方向，含义是“自建平台相对运营权威版偏高/偏低多少”。
- `ka_data=0` 时：delta 仍可用；deltaRate 返回 `denominator_zero`，不返回 Infinity/字符串。

### G3 对象匹配率

- 推荐冻结：`matchRate = matched / union`（Jaccard 同键覆盖率）。
- 同时返回 `kaObjectCount/platformObjectCount/matchedObjectCount/kaOnlyCount/platformOnlyCount`，不靠单一百分比掩盖单边缺失。
- union=0 时 matchRate 为 `missing`，不能显示 100%。

### G4 首批可比指标

- 推荐直接可比：`cost`、`realConversion`、`realCpa`；必须双方完整、非 stale、metricVersion 相同且两值 available。
- 其他 Canonical 指标继续并列原值，但在逐指标政策冻结前标 `metric_not_comparable`；考核价、返点、赔付、现金成本继续遵守“分来源版本化”，不得跨来源混算。
- 后续新增可比指标只改后端 policy registry + Contract 测试，前端不自行放开。

---

### Task 1: 冻结 reconcile v1.1 Contract

**Files:**
- Modify: `packages/contract/metrics.md`
- Modify: `packages/contract/api.md`
- Modify: `packages/domain/src/data-query-contract.ts`
- Modify: `packages/domain/test/data-query-contract.test.ts`
- Modify: `apps/web/lib/data/contracts.ts`
- Modify: `apps/web/lib/data/canonical-contract-parity.test.ts`
- Modify: `packages/contract/fixtures/data-query/reconcile-pending.json`
- Modify: `apps/web/lib/data/fixtures/e2b0f1a/reconcile-pending.json`

**Step 1: 写失败 Contract 测试**

要求 `comparison.status=ready` 时必须包含：

```ts
matching: {
  kaObjectCount: number
  platformObjectCount: number
  matchedObjectCount: number
  kaOnlyCount: number
  platformOnlyCount: number
  matchRate: MetricValue
}
```

`metrics` key 冻结为 Canonical 名称，不再使用 UI 别名：至少 `cost/realConversion/realCpa`。补反例：计数不守恒、matchRate 非 finite、ready 缺 matching、unavailable 夹带伪 matching、非可比指标仍有 available delta。

**Step 2: 运行确认失败**

Run:

```bash
cd packages/domain && npm test -- --run test/data-query-contract.test.ts
cd ../../apps/web && npm test -- --run lib/data/canonical-contract-parity.test.ts
```

Expected: 新增 reconcile matching/语义断言失败。

**Step 3: 实现 strict schema 与语义 refine**

- `matched + kaOnly === kaObjectCount`
- `matched + platformOnly === platformObjectCount`
- `matched + kaOnly + platformOnly === union count`
- `matchRate.available` 只允许 union>0 且数值在 `[0,1]`
- `comparison.status=unavailable` 时 rows 为空且 matching 不存在
- `comparison.status=ready` 表示引擎已执行，不代表每个指标都 comparable

**Step 4: 同步两份 fixture 与 SHA 测试**

Fixture 使用脱敏 UUID/账户，不写真实数据。两份文件必须逐字节相同，更新 parity hash。

**Step 5: 运行通过并提交**

```bash
cd packages/domain && npm test -- --run test/data-query-contract.test.ts
cd ../../apps/web && npm test -- --run lib/data/canonical-contract-parity.test.ts
git add packages/contract packages/domain apps/web/lib/data/contracts.ts apps/web/lib/data/canonical-contract-parity.test.ts apps/web/lib/data/fixtures
git commit -m "契约：冻结双源对账匹配与差异语义"
```

---

### Task 2: 实现无账户映射表的纯 Domain 对账引擎

**Files:**
- Create: `packages/domain/src/data-reconciliation.ts`
- Create: `packages/domain/test/data-reconciliation.test.ts`
- Modify: `packages/domain/src/index.ts`

**Step 1: 写失败测试**

覆盖：

1. 按 `(workspaceId,media,accountId,ds)` union join，顺序稳定；
2. 同 workspace、同 accountId、不同 media 必须是两行；
3. matched/kaOnly/platformOnly/matchRate 正确；
4. 单边行完整保留，另一侧 metric 为 missing；
5. `delta=platform-ka`、`deltaRate=delta/ka`；
6. KA 分母 0 时 deltaRate=`denominator_zero`；
7. 任一来源 partial/truncated/stale、coverage 不完整或 metricVersion 不同，所有 delta 不 available；
8. `realCpa.state=infinite|undefined` 不参与差异；
9. 重复同键行、非法 key 或 schema 漂移 fail closed；
10. 未冻结指标保留两侧原值但 reason=`metric_not_comparable`。

**Step 2: 运行确认失败**

Run: `cd packages/domain && npm test -- --run test/data-reconciliation.test.ts`

Expected: FAIL because module does not exist.

**Step 3: 实现 metric policy registry**

```ts
const RECONCILE_METRIC_POLICY = {
  cost: { comparable: true },
  realConversion: { comparable: true },
  realCpa: { comparable: true },
  cashCost: { comparable: false, reason: "source_versioned" },
  cashCpa: { comparable: false, reason: "source_versioned" },
  assessmentPrice: { comparable: false, reason: "source_versioned" },
} as const
```

禁止 LLM 推断原因；原因只来自固定规则与 lineage/coverage 事实。不得创建账户 ID mapping 表或 fuzzy matching。

**Step 4: 运行通过并提交**

```bash
cd packages/domain && npm test -- --run test/data-reconciliation.test.ts
npm run typecheck && npm run lint
git add packages/domain
git commit -m "领域：实现账户日双源对账纯函数"
```

---

### Task 3: 将对账引擎接入 Worker Query Service

**Files:**
- Modify: `apps/worker/src/data/query-service.ts`
- Modify: `apps/worker/test/data-query-service.test.ts`
- Modify: `apps/worker/test/canonical-query-fixtures.ts`

**Step 1: 写失败服务测试**

- 双源 ready/完整 → `comparison.status=ready` + matching + rows；
- 单边无对象 → 引擎仍 ready，union 行保留且单边 metric missing；整体 reason 可为 `source_missing`，不能误报 engine pending；
- 任一整源 unavailable → `comparison.status=unavailable/source_unavailable`；
- 任一 partial/truncated → 对账 rows 可保留原值，但所有 delta 不 available，整体 reason=`partial_source`；
- Contract 损坏继续顶层 502，不能降级成对账结果；
- 输出再次通过 workspace/media/account scope guard。

**Step 2: 运行确认失败**

Run: `cd apps/worker && npm test -- --run test/data-query-service.test.ts`

Expected: 仍返回 `reconciliation_engine_pending`。

**Step 3: 接入 Domain engine**

只在 `queryId=reconcile.account_daily && dataView=reconcile` 调用；其他 Query 不偷跑对账。移除成功路径的 `reconciliation_engine_pending`，但保留稳定错误兼容解析直到前端同批完成。

**Step 4: 运行 Worker 全量门禁并提交**

```bash
cd apps/worker
npm test
npm run typecheck
npm run lint
git add apps/worker
git commit -m "后端：接入双源账户日对账引擎"
```

---

### Task 4: 前端展示真实 matching 与 Canonical 差异字段

**Files:**
- Modify: `apps/web/lib/data/adapters.ts`
- Modify: `apps/web/lib/data/adapters.test.ts`
- Modify: `apps/web/lib/data/contracts.ts`
- Modify: `apps/web/components/data-view/analysis-table.tsx`
- Modify: `apps/web/components/business/data-containers.tsx`
- Modify: `apps/web/lib/data/mock-data.ts`
- Test: `apps/web/lib/data/data-view.test.ts`

**Step 1: 写失败测试**

- 前端只读取后端 `cost/realConversion/realCpa` 差异，不计算；
- 展示 matched/union、双边对象数、单边缺失数；
- partial/stale/source_missing 与 denominator_zero 不显示 0；
- 同 accountId 跨 media 不合并；
- 筛选切换保留，Mock 与真实 Contract 同形。

**Step 2: 运行确认失败**

Run: `cd apps/web && npm test -- --run lib/data/adapters.test.ts lib/data/data-view.test.ts`

**Step 3: 实现 UI**

- 表格列只负责格式化后端字段；
- 顶部对账摘要显示匹配计数与来源状态；
- 未匹配对象仍显示在表中；
- 不显示“账户待映射”，统一显示“该来源缺失”；
- 页面继续展示双方 lineage，不生成统一主数。

**Step 4: 全量验证并提交**

```bash
cd apps/web
npm test
npm run typecheck
npm run lint
npm run build
git add apps/web
git commit -m "前端：展示真实双源匹配与差异结果"
```

---

### Task 5: 增加首次 daily 的服务端固定试用身份模式

**Files:**
- Modify: `apps/web/lib/data/approved-auth-context.ts`
- Modify: `apps/web/lib/data/auth-context.ts`
- Create: `apps/web/lib/data/approved-auth-context.test.ts`
- Modify: `apps/web/.env.example`
- Modify: `apps/web/components/business/data-containers.tsx`

**Step 1: 写失败安全测试**

新增服务器变量：

```text
KA_AUTH_MODE=internal_trial_static|buc
KA_INTERNAL_TRIAL_AUTH_CONTEXT_JSON=<server-only JSON>
```

覆盖：默认无 mode→null；production 只有显式 `internal_trial_static` + 完整 strict JSON 才允许；workspace 必须 UUID、账户 tuple 不可重复/通配、最多 1000；浏览器 header/body/localStorage 不能影响 scope；序列化/错误不回显 JSON；`buc` 未接入时 fail closed。

**Step 2: 运行确认失败**

Run: `cd apps/web && npm test -- --run lib/data/approved-auth-context.test.ts lib/data/bff.test.ts`

**Step 3: 实现固定 scope resolver**

- 复用 `serverAuthContextSchema`；
- 只读取 server env；
- 不提供默认 workspace/account；
- UI 显示“内网固定试用身份”，避免被误解为正式个人权限；
- 正式 BUC 模式仍留明确 integration seam，不能静默退回 static。

**Step 4: 全量验证并提交**

```bash
cd apps/web
npm test
npm run typecheck
npm run lint
npm run build
git add apps/web
git commit -m "鉴权：增加内网固定试用身份安全模式"
```

---

### Task 6: 建立不泄露数据值的真实双源烟测与部署门

**Files:**
- Create: `scripts/smoke-internal-readonly.mjs`
- Create: `scripts/smoke-internal-readonly.test.mjs`
- Create: `docs/runbooks/2026-08-25-首次内网只读联调.md`
- Modify: `apps/worker/.env.example`
- Modify: `apps/web/.env.example`

**Step 1: 写失败测试**

烟测只输出：route/status/requestId/source status/row count/coverage/partial/truncated/metadataAvailability/matching count。禁止输出 metric 值、accountId、token、完整 URL、SQL、上游 body。

固定步骤：

1. Worker `/healthz`；
2. BFF `platform account.summary`；
3. BFF `ka_data account.summary`；
4. BFF `reconcile.account_daily`；
5. 越权账户、跨 media、非法 workspace 负向门；
6. work-item/change-set 详情只读门；
7. 检查无任何 POST/confirm/execute 媒体写路由。

**Step 2: 实现脚本与 runbook**

Runbook 明确 A/B/C：

- A 阻断部署：Secret 缺失、scope 无法证明、真实 KA Data 不通、任一越权反例未拒绝、migration 未完成、Contract/parity 失败；
- B 可试用后修：详情自动关联、P2 数据库复合关系；
- C 后续复审：Claude/arch 与知识资产 approval，不阻塞已通过安全门的 daily 联调。

**Step 3: 本机 fake upstream 先验收**

Run: `node --test scripts/smoke-internal-readonly.test.mjs`

Expected: 所有日志脱敏断言通过。

**Step 4: 真实环境仅在老板确认后执行**

所需外部输入只通过 Secret/config 提供：

- `DATABASE_URL`
- `KA_DATA_BASE_URL`
- `KA_DATA_READER_TOKEN`
- `DATA_API_INTERNAL_TOKEN`
- `KA_DATA_BACKEND_ORIGIN`
- `KA_DATA_SERVICE_TOKEN`
- `KA_INTERNAL_TRIAL_AUTH_CONTEXT_JSON` 或正式 BUC Secret

不得要求老板把值发进对话。

**Step 5: 提交**

```bash
git add scripts/smoke-internal-readonly.mjs scripts/smoke-internal-readonly.test.mjs docs/runbooks/2026-08-25-首次内网只读联调.md apps/worker/.env.example apps/web/.env.example
git commit -m "联调：增加内网只读烟测与部署门"
```

---

### Task 7: 总门禁、本机逐页复验与 daily 部署

**Files:**
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-be-codex.md`
- Modify: `docs/relay/inbox-fe-codex.md`
- Create: `docs/evidence/R4-首次内网只读联调质量报告.md`

**Step 1: 全仓质量门**

Domain/DB/Worker/Web/知识资产 test、typecheck、lint、真实 PostgreSQL migration、production build 全绿；`git diff --check` 与凭证扫描通过。

**Step 2: 本机浏览器门**

逐页检查 9 导航、三数据视图、账户详情、诊断、预览确认门；1440/1366/390 宽度无关键遮挡；console error=0；所有媒体写操作仍不可执行。

**Step 3: 老板本机验收门**

老板确认页面与功能方向后，才允许进入 daily/FaaS。视觉细调可单独提交，但不得覆盖本批 Contract/鉴权/数据范围。

**Step 4: daily 部署与真实烟测**

按 runbook 迁移、配置 Secret、启动 Worker Data API 和 Web；运行脱敏烟测，记录 commit、环境、时间、requestId、状态与回滚点。只有这一步通过后才标 `deployed_internal + runtime_verified_readonly`。

**Step 5: 停止与回滚**

任一 P0/P1 安全门失败：关闭 Web 数据入口或回滚到上一个已验证包；不得用 Mock、空 scope、默认账户或关闭校验来“先跑起来”。
