# B11 第三轮实证收口 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将第三轮 OS 真实只读结果固化为历史 realtime 明确口径、`hh` 0..24 客户端边界和广告实时按账户小批查询，彻底规避已证实的 2000 行静默截断。

**Architecture:** 保持公开 Contract、Migration、API、小时表 0..23 桶和前端不变。Qihang 原子 Client 负责单请求参数校验及 2000 行 fail-closed；ETL 在调用原子 Client 前按最多 5 个账户、最多 80 个广告 ID 生成确定性小批查询，逐批持久化 Raw 与观测后再合并快照。`hh=24` 只允许原子查询全天累计，不进入小时差分或 `ad_metrics_hourly`。

**Tech Stack:** TypeScript 5.9、Zod 4.1.5、Vitest、PostgreSQL 16、Docker Desktop、现有 `@ka/domain` / `@ka/db` / `@ka/worker`。

---

### Task 1: 固化第三轮 OS 真实证据

**Files:**
- Create: `docs/evidence/integration/2026-08-20-qihang-readonly-os-probe-round3.md`
- Modify: `docs/19-实证结果定案.md`
- Modify: `docs/10-数据通路真相.md`
- Modify: `docs/plans/工作台账.md`

**Step 1: 写入脱敏证据**

记录 15 次只读 GET 的四类结论：历史 realtime 成功、`hh=0/23/24/25` 行为、分片并集大于无过滤 2000 行、分页参数被静默忽略。只写脱敏行数关系与协议事实，不写 userId、账户/广告 ID、金额或完整响应。

**Step 2: 更正旧结论**

- 将“历史 realtime 仅为 Skill 源码意图”升级为服务端真实执行；历史 realtime 仅用于诊断回溯，结算继续以 offline 为准。
- 将“疑似 2000 行截断”升级为“已证实静默截断”；删除“硬上限待证”的陈述。
- 将 `hh` 服务端行为记为：0、23、24 有效，25 被静默钳制；产品客户端自行限制 0..24。

**Step 3: 复核文档冲突**

Run: `rg -n "实时接口只支持当天|疑似.*2000|硬上限.*待|hh.*待.*边界" docs`

Expected: 只保留历史证据中的被替代说明，不再将旧判断作为当前事实。

**Step 4: Commit**

```bash
git add docs/evidence/integration/2026-08-20-qihang-readonly-os-probe-round3.md docs/19-实证结果定案.md docs/10-数据通路真相.md docs/plans/工作台账.md docs/plans/2026-08-20-B11第三轮实证收口-implementation.md
git commit -m "固化奇航第三轮只读实证"
```

### Task 2: Qihang 原子 Client 自校验 hh 0..24

**Files:**
- Modify: `apps/worker/src/qihang/client.ts`
- Test: `apps/worker/test/qihang-client.test.ts`

**Step 1: Write the failing tests**

新增参数化测试：数字/十进制字符串 `0`、`23`、`24` 被序列化；`-1`、`25`、`1.5`、空白和非数字字符串在发网前抛 `QihangError`。同时断言历史 `ds` 不被客户端阻断。

**Step 2: Run test to verify RED**

Run: `npm test -- --run test/qihang-client.test.ts`

Expected: `hh=25` 当前仍会发网，新增反例失败。

**Step 3: Implement minimal validation**

新增纯函数将 `number|string` 规范为十进制整数，要求 `0 <= hh <= 24`。仅 `ad_realtime` 使用；不改变 ETL payload 的 `hh <= 23`，因此 24 不会写成小时桶。

**Step 4: Run test to verify GREEN**

Run: `npm test -- --run test/qihang-client.test.ts`

Expected: PASS。

**Step 5: Commit**

```bash
git add apps/worker/src/qihang/client.ts apps/worker/test/qihang-client.test.ts
git commit -m "收紧奇航小时查询边界"
```

### Task 3: 广告实时查询按账户和广告 ID 确定性分片

**Files:**
- Create: `apps/worker/src/etl/ad-query-batches.ts`
- Create: `apps/worker/test/ad-query-batches.test.ts`
- Modify: `apps/worker/src/etl/incr-handler.ts`
- Test: `apps/worker/test/etl-handlers.test.ts`

**Step 1: Write the failing pure tests**

- 12 个账户生成 5/5/2 三批，顺序稳定且输入重复 ID 去重。
- 81 个广告 ID 生成 80/1 两批；同时有账户与广告 ID 时生成确定性笛卡尔分片。
- 空过滤 fail-closed。
- 合并结果按 `account_id + ad_id + ds` 去重；相同重复行只保留一份，冲突重复或缺标识 fail-closed。

**Step 2: Run pure tests to verify RED**

Run: `npm test -- --run test/ad-query-batches.test.ts`

Expected: module not found。

**Step 3: Implement pure batching**

默认 `accountIds` 每批最多 5 个，`adIds` 每批最多 80 个。只生成带过滤条件的 `ad_realtime` 查询；不得退化成无 accountIds/adIds 的查询。合并函数不相信服务端分页或 total 字段。

**Step 4: Write handler integration tests**

- `focusAccountIds` 超过 5 时，每个 hh 快照分别按 5/5/N 查询。
- 每批都独立 append Raw、记录 observation；全部成功后才做小时差分和 Upsert。
- 任一批命中 Client 的 2000 截断错误或网络失败时，Run 失败且不派生 Canonical。
- 合并重复行不导致 Domain 假重复，冲突行则 fail-closed。

**Step 5: Implement handler wiring**

用分片规划器替代 `ingestFocusedAds` 的单次查询；保持顺序执行，避免给内网接口制造并发突发。非小时查询返回合并快照；小时查询对前后两个 hh 分别完整分片后再差分。

**Step 6: Run tests**

Run: `npm test -- --run test/ad-query-batches.test.ts test/etl-handlers.test.ts`

Expected: PASS。

**Step 7: Commit**

```bash
git add apps/worker/src/etl/ad-query-batches.ts apps/worker/src/etl/incr-handler.ts apps/worker/test/ad-query-batches.test.ts apps/worker/test/etl-handlers.test.ts
git commit -m "按账户分片查询广告实时数据"
```

### Task 4: PostgreSQL 门禁、全量质量与审查交接

**Files:**
- Modify: `docs/plans/B11-状态.md`
- Modify: `docs/evidence/B11-代码质量报告.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1: Start PostgreSQL 16**

Run: `docker compose up -d` in `packages/db`

Expected: PostgreSQL healthcheck becomes healthy on the test port defined by the compose file。

**Step 2: Run the previously blocked PG gates**

Run in `packages/db`: `npm test -- --run test/ad-hourly-metrics-repository.test.ts test/etl-outbound-repository.test.ts`

Run in `packages/db`: `npm test -- --run`

Run in `apps/worker`: `npm test -- --run test/data-pipeline-pg.integration.test.ts test/benchmark-data-pipeline-pg.test.ts`

Expected: PASS；失败时区分环境、Migration、Repository 与业务语义，不跳过。

**Step 3: Run full quality gates**

运行 Domain / DB / Worker / DingTalk 全量测试、四包 typecheck/lint/audit、变更模块 coverage、复杂度≤10、函数≤100 行、diff check、凭证与动态执行扫描。

**Step 4: Apply code-quality-checker**

按规范、安全、性能、测试、依赖、可维护性审查本轮 diff；Critical/High 必须修复，Medium 明确处置。

**Step 5: Update handoff**

P-018 追加第三轮事实和代码 SHA：2000 截断已证实；默认 5 账户/80 广告分片；`hh=24` 只作原子全天累计，不进入小时表；历史 realtime 只用于诊断。

**Step 6: Commit**

```bash
git add docs/plans/B11-状态.md docs/evidence/B11-代码质量报告.md docs/plans/Codex后端交付总账.md docs/plans/工作台账.md docs/relay/inbox-arch.md
git commit -m "完成B11第三轮实证收口"
```

