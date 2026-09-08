# B11 启航时效、完整性与小时监控加固 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将第二轮 OS 真实只读证据落成可恢复的离线重查、广告查询截断防护、可审计数据观测和确定性小时差分，使启航主取数链可以安全支撑实时监控与延迟结算。

**Architecture:** 保持现有四 resource、Raw append-only、Canonical 和公开 API/Contract 不变。`etl_incr` 复用现有调度承载可配置 D-1 离线重查；Qihang Client 对无过滤广告查询和疑似 2000 行截断 fail-closed；每次查询把不含业务明细的观测元数据写入 `etl_runs.scope.observations`。小时指标由 Domain 对相邻累计快照做 ID 并集差分，再由现有 `ad_metrics_hourly` 表 Upsert；未确认的分区完整性只标 observed/provisional，不虚报 complete。

**Tech Stack:** TypeScript 5.9、Zod 4.1.5、Vitest、PostgreSQL 16、现有 `@ka/domain` / `@ka/db` / `@ka/worker`。

---

### Task 1: 固化第二轮 OS 证据与风险边界

**Files:**
- Modify: `docs/19-实证结果定案.md`
- Modify: `docs/10-数据通路真相.md`
- Create: `docs/evidence/integration/2026-08-20-qihang-readonly-os-probe-round2.md`
- Create: `docs/plans/B11-OS第三轮只读探针.md`

**Step 1: 记录已确认事实**

- `hh` 为 0..hh 含的累计语义；本轮只实测 13/14。
- 同一时点较早快照可能整行缺广告，返回行字段不为 null、缺省补 0。
- offline 区间含首尾且带 `ds`；D-1 在两小时内从空变为有行。
- 无 ready/complete/latest marker；非空不等于完整。
- 无 accountIds 的 `ad_realtime` 恰好 2000 行，仅能标疑似截断。

**Step 2: 写第三轮只读探针**

仅请求 OS 验证：历史 account realtime、hh=0/23/24/25、2000 截断提示/按 accountIds 或 adIds 分片、分页参数是否生效。禁止写操作和压力测试。

**Step 3: 更新证据等级**

区分真实执行、文档确认、源码意图和推断；不把 2000 写成已确认硬上限，不把多次稳定写成平台 complete。

### Task 2: Qihang 广告查询安全与观测元数据

**Files:**
- Modify: `apps/worker/src/qihang/errors.ts`
- Modify: `apps/worker/src/qihang/client.ts`
- Create: `apps/worker/src/qihang/observation.ts`
- Test: `apps/worker/test/qihang-client.test.ts`
- Create: `apps/worker/test/qihang-observation.test.ts`

**Step 1: Write the failing tests**

```ts
await expect(client.query({ resource: "ad_realtime", userId: "u", ds }))
  .rejects.toThrow(/accountIds or adIds/i);

await expect(filteredClient.query({
  resource: "ad_realtime", userId: "u", ds, accountIds: ["a-1"]
})).rejects.toBeInstanceOf(QihangSuspectedTruncationError);
```

另断言 1999/2001 行不触发“恰好 2000”推断；资源上限仍独立生效。观测指纹对行顺序和 object key 顺序不敏感，提取最大 `last_sync_time`，不含原始行、userId 或 account/ad ID。

**Step 2: Run tests to verify RED**

Run: `npm test -- --run test/qihang-client.test.ts test/qihang-observation.test.ts`

Expected: 无过滤广告查询仍发网；2000 行仍成功；observation 模块不存在。

**Step 3: Implement the minimal safety boundary**

- `ad_realtime` 必须至少有非空 `accountIds` 或 `adIds`。
- 新增 `QihangSuspectedTruncationError(rowCount, threshold)`，code=`SUSPECTED_TRUNCATION`。
- 默认只对 `ad_realtime` 恰好 2000 行 fail-closed；阈值可在 Client 测试配置中调整/关闭，但生产默认开启。
- `QihangQueryResult` 增加不含明细的 `observation`：resource、rowCount、fingerprint、observedAt、lastSyncTime、availability。

**Step 4: Run tests to verify GREEN**

Run: `npm test -- --run test/qihang-client.test.ts test/qihang-observation.test.ts`

Expected: PASS。

### Task 3: 可审计的空/非空观测与离线动态重查

**Files:**
- Modify: `apps/worker/src/etl/types.ts`
- Modify: `packages/db/src/etl-run-repository.ts`
- Modify: `apps/worker/src/etl/full-handler.ts`
- Modify: `apps/worker/src/etl/incr-handler.ts`
- Modify: `apps/worker/src/etl/payload.ts`
- Test: `apps/worker/test/etl-handlers.test.ts`
- Test: `packages/db/test/etl-outbound-repository.test.ts`

**Step 1: Write the failing tests**

- `etl_incr` 默认重查 D-1 offline；`offlineReconcileDays=0` 可关闭，最大 3。
- D-1 空也记录 `availability=not_observed,rowCount=0`，随后仍完成当日 realtime。
- D-1 后续出现时 Raw 追加新快照，Canonical 范围从 D-1 到当日，支持修订。
- 每个 query 观测 append 到对应 `etl_runs.scope.observations`；记录 resource/date/hh/rowCount/hash/lastSyncTime，不记录业务 ID 与 userId。

**Step 2: Run tests to verify RED**

Run: `npm test -- --run test/etl-handlers.test.ts`

Expected: incremental handler 不查询 offline，EtlRunStore 无 recordObservation。

**Step 3: Implement**

```ts
recordObservation(runId: number, observation: QihangObservation): Promise<void>;
```

Repository 使用单条参数化 UPDATE 将观测 append 到 `scope.observations`。Full/Incr 每次成功查询后立即记录，包括空数组；失败仍走现有 `failRun`。`offlineReconcileDays` 默认 1、范围 0..3，逐日单日请求，不把跨日能力变成未经压测的生产优化。

**Step 4: Run Worker and PG tests**

Run: `npm test -- --run test/etl-handlers.test.ts`

Run: `npm test -- --run test/etl-outbound-repository.test.ts`

Expected: PASS；若本机 PG 不可用，记录连接阻断并保留纯单元门禁。

### Task 4: 相邻累计快照的安全小时差分

**Files:**
- Create: `packages/domain/src/hourly-ad-metrics.ts`
- Modify: `packages/domain/src/index.ts`
- Create: `packages/domain/test/hourly-ad-metrics.test.ts`

**Step 1: Write the failing tests**

- 当前快照 ID 集合大于上一快照时，上一时点缺行按 0，新增广告得到完整当前窗口值。
- 上一快照有、当前缺行时输出 `incomplete_current_snapshot`，不产出负数假数据。
- cost/exposure/click/conversion/realConversion 做差；负差分 clamp 0 并返回 `data_correction` 字段列表。
- null/非数/缺 ad_id/account_id/ds、重复 ad_id fail-closed。
- 输出 `lastSyncTime` 和 `hh`，不把 hh 当独立小时原始值。

**Step 2: Run test to verify RED**

Run: `npm test -- --run test/hourly-ad-metrics.test.ts`

Expected: module not found。

**Step 3: Implement pure function**

```ts
deriveHourlyAdMetrics({ currentHh, previousRows, currentRows }): {
  rows: HourlyAdMetric[];
  issues: HourlyMetricIssue[];
}
```

只输出安全、有限、冻结对象；按 adId 稳定排序。缺上一行可补 0，缺当前行只报 issue；不信任 null 与字符串垃圾值。

**Step 4: Run Domain tests**

Run: `npm test -- --run test/hourly-ad-metrics.test.ts`

Expected: PASS。

### Task 5: 写入现有小时表并接入增量 ETL

**Files:**
- Create: `packages/db/src/ad-hourly-metrics-repository.ts`
- Modify: `packages/db/src/index.ts`
- Create: `packages/db/test/ad-hourly-metrics-repository.test.ts`
- Modify: `apps/worker/src/etl/types.ts`
- Modify: `apps/worker/src/etl/incr-handler.ts`
- Modify: `apps/worker/src/runtime.ts`
- Test: `apps/worker/test/etl-handlers.test.ts`

**Step 1: Write the failing tests**

- payload 带 `hh>0` 时，focused ad query 必须拉 `hh-1` 与 `hh` 两份累计快照。
- 通过 Task 4 差分后批量 Upsert `ad_metrics_hourly`。
- 重跑同 workspace/ad/ds/hh 覆盖同一行；另一 workspace 不互相覆盖。
- 当前快照缺行不写；数据修正计数进入 ETL observation，不静默伪装正常。
- `hh=0` 以前一空快照为基线，只请求一次。

**Step 2: Run tests to verify RED**

Run: `npm test -- --run test/etl-handlers.test.ts`

Run: `npm test -- --run test/ad-hourly-metrics-repository.test.ts`

Expected: 无小时 Store/Repository，增量只请求一个 hh。

**Step 3: Implement**

- 使用现有 `ad_metrics_hourly`，不新增迁移。
- Repository 通过参数化 `jsonb_to_recordset` 或等价有界批量 Upsert；精确映射 workspace/ad/account/ds/hh 和七项指标。
- Handler 先成功持久化两份 Raw，再计算/Upsert 小时行；任一步失败不派生 Canonical。
- 观测/issue 只记录计数和字段名，不记录广告明细。

**Step 4: Run tests**

Run: `npm test -- --run test/etl-handlers.test.ts`

Run: `npm test -- --run test/ad-hourly-metrics-repository.test.ts`

Expected: PASS。

### Task 6: 全量质量门禁、证据和审查交接

**Files:**
- Create: `docs/evidence/B11-代码质量报告.md`
- Create: `docs/plans/B11-状态.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1: Run quality gates**

- Domain / DB / Worker / DingTalk 全量 tests。
- 四包 typecheck、lint、audit。
- 新模块 coverage ≥80%。
- 复杂度≤10、函数≤100 行、diff check、凭证/动态执行扫描。
- PG 可用时 migration replay 与真实 Repository tests。

**Step 2: Apply code-quality-checker**

按规范、安全、性能、覆盖、依赖和复杂度六维审查；Critical/High 必须修复，Medium 明确处置。

**Step 3: Write arch handoff**

明确：2000 仍是疑似信号；没有平台 complete marker；稳定性不是结算完成；公开 API/前端展示字段、最终保留周期和调度频率待 Claude/arch 冻结。

**Step 4: Commit**

按功能批次频繁提交，最终回填所有 SHA；不 push。
