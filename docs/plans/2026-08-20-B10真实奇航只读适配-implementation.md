# B10 真实启航只读适配修复 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用 2026-08-20 内网 OS 的真实只读探针证据，修正启航日期序列化、离线分区延迟和离线真实转化字段优先级，使现有 ETL 能安全接入真实 `get_data` 返回。

**Architecture:** 保持现有 Qihang Client、Raw append-only、Canonical Merge 和公开契约不变，只在内部适配层增加严格日期转换、有限离线分区回退及字段级来源优先级。未知的 `hh`、跨日区间、现金字段业务口径和服务身份不在本批推断实现。

**Tech Stack:** TypeScript 5.9、Zod、Vitest、PostgreSQL 16（回归）、现有 `@ka/domain` / `@ka/worker`。

---

### Task 1: 修正启航日期参数序列化

**Files:**
- Modify: `apps/worker/src/qihang/client.ts`
- Test: `apps/worker/test/qihang-client.test.ts`

**Step 1: Write the failing test**

- 断言内部 ISO 日期 `2026-08-18` 在 GET query 中转换为 `20260818`。
- 断言已经是 `YYYYMMDD` 的输入保持不变。
- 断言非法日期在网络请求前 fail-closed。

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/qihang-client.test.ts`

Expected: ISO 日期仍带连字符或非法日期未被拒绝。

**Step 3: Write minimal implementation**

- 增加只接受 `YYYY-MM-DD` / `YYYYMMDD` 的严格转换函数。
- 对 `beginDate`、`endDate`、`ds` 统一输出 `YYYYMMDD`。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/qihang-client.test.ts`

Expected: PASS。

### Task 2: 有界寻找最新已产出离线分区

**Files:**
- Modify: `apps/worker/src/etl/full-handler.ts`
- Test: `apps/worker/test/etl-handlers.test.ts`

**Step 1: Write the failing test**

- 模拟 D-1 返回空数组、D-2 返回数据。
- 断言 ETL 查询 D-2、持久化 D-2，并让 Canonical 覆盖到实际命中的离线日。
- 断言 D-1 命中时不产生额外回退请求。

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/etl-handlers.test.ts`

Expected: 现有代码只查询 D-1。

**Step 3: Write minimal implementation**

- 从 D-1 起最多向前探测 3 个自然日。
- 首个非空分区命中后停止；不做区间和压力测试假设。
- Canonical `dateFrom` 纳入实际命中的离线日期。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/etl-handlers.test.ts`

Expected: PASS。

### Task 3: 历史日优先使用离线真实转化

**Files:**
- Modify: `packages/domain/src/canonical.ts`
- Test: `packages/domain/test/canonical.test.ts`

**Step 1: Write the failing test**

- 离线与实时同时含 `account_real_conversion` 时，断言历史日采用离线值和 `offline` 来源。
- 离线缺字段时，断言继续用实时值补齐。

**Step 2: Run test to verify it fails**

Run: `npm test -- --run test/canonical.test.ts`

Expected: 现有实现无条件采用实时真实转化。

**Step 3: Write minimal implementation**

- 只改变 `realConversion` 的字段级优先级。
- 不改变消耗、曝光、点击、现金和补偿的既有口径。

**Step 4: Run test to verify it passes**

Run: `npm test -- --run test/canonical.test.ts`

Expected: PASS。

### Task 4: 全量质量、证据与审查交接

**Files:**
- Create: `docs/evidence/B10-真实启航只读适配报告.md`
- Create: `docs/plans/B10-状态.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1: Run package gates**

- Domain / DB / Worker / DingTalk 全量 tests。
- 四包 typecheck、lint、audit。
- 变更代码复杂度与敏感信息扫描。

**Step 2: Record evidence**

- 只记录脱敏接口事实和测试结果。
- 明确本批未直接从本机访问内网，真实证据来源为老板转交的 OS 探针。
- `hh`、跨日区间、服务身份、现金字段口径继续标未验证。

**Step 3: Commit**

提交代码、测试、证据、台账和 Claude/arch 审查入口；不 push。
