# R3 账户媒体联合键迁移 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将账户对象及所有直接账户事实统一为 `(workspace_id, media, account_id)`，并保证同一 workspace 下不同媒体的同号账户在存储、授权、聚合和回滚中不碰撞、不串数。

**Architecture:** 新增独立 migration，在旧主键仍能证明“每个 workspace/account 只有一个既有媒体”的窗口内，从 `accounts.media` 确定性回填直接账户引用；遇到孤儿、空媒体或歧义即中止，不用默认值掩盖。查询层把浏览器批准的账户 scope 保留为 `(media, accountId)` tuple，并在 SQL 内先限权，再做 summary/trend/table/lineage 聚合；返回层三键守卫继续作为第二道防线。

**Tech Stack:** PostgreSQL 16、node-pg-migrate、TypeScript、node-postgres、Zod、Vitest。

---

## 1. 冻结事实与不外推边界

- 账户身份键已经冻结为 `(workspace_id, media, account_id)`；KA Data 与 platform 的快手账户 ID 同源直连。
- `task_id`、商品、素材、计划、广告组、创意等对象自己的身份规则没有因此被证明；本批不修改它们自身的主键语义。
- `task_accounts`、`ad_metrics_hourly`、`ad_entities` 等如增加 `media`，只表示“它引用的父账户媒体”，不表示这些子对象已被证明跨源同 ID。
- Runtime/Multica/ChangeSet 真实写入口继续关闭。本计划只处理数据库正确性和只读查询授权。

## 2. 影响面审计

| 分类 | 当前缺口 | 本批处理 |
|---|---|---|
| `accounts` | PK 仅 `(workspace_id, account_id)` | PK 改为三键；同 workspace 跨 media 同 account_id 可共存 |
| `task_accounts` | 无 media；重叠与 JOIN 仅 account_id | 增加 media；唯一性、账户存在校验、任务归属 JOIN 带三键 |
| `metrics_raw` | 无 media；回放去重与 replay index 会串媒体 | 增加 media；去重、分组、索引和 ETL payload 带三键 |
| `account_metrics_daily` | PK 无 media；canonical upsert 冲突 | 增加 media；PK/upsert/history/settings/质量查询带三键 |
| `account_balance` | PK 无 media | 增加 media；PK 改三键 |
| `ad_metrics_hourly` / `ad_entities` | 其 `account_id` 不能唯一指向父账户 | 增加父账户 `media`；不改 `ad_id/entity_id` 自身身份裁决 |
| Semantic summary/trend/table/lineage/health/dimension | JOIN 和授权仅 account_id；聚合先串数再守卫 | 三键 JOIN；SQL tuple scope；distinct/account-day 统计带 media |
| `MetricsRepository` / `RawMetricsRepository` / `TaskRepository` | API key 与 SQL key 缺 media | 输入输出 key 带 media，批量完整性与 advisory lock 带 media |
| `DataQualityRepository` | raw/canonical 对账和缺失检查仅 account_id | 分组、JOIN、返回身份带 media；不把跨媒体账户合并 |
| `CredentialRepository` | owner 解析只收 accountIds | 改收 `(media, accountId)`，SQL 内验证所有批准 tuple |
| Worker ETL | raw/canonical work 没有 media | 从可信 job/resource 上下文注入并全链路传递；不信 payload 覆盖 |
| Work item / ChangeSet | 后续只读详情需要账户 scope，但现表无 media | 另在 R3-B 设计；本迁移不顺手开放写接口 |

## 3. 安全回填与回滚策略

1. 新列先 nullable；不设置 `DEFAULT 'KUAISHOU'`。
2. 对每个直接账户引用，按旧架构仍唯一的 `(workspace_id, account_id)` JOIN `accounts`，复制 `accounts.media`。
3. 若存在孤儿引用、空 media 或无法确定的行，migration `RAISE EXCEPTION`，整个事务回滚。
4. 完成验证后再设置 `NOT NULL`、重建 PK/unique/index 和三键 FK。
5. down migration 在降级前检测同一 `(workspace_id, account_id)` 是否已出现多个 media；若有则明确拒绝，避免丢数据或错误合并。清理反例数据后必须支持 down/up 重放。
6. 一期已知 KUAISHOU 历史数据也不靠隐式默认回填；只有未来无法 JOIN 且存在另行审批的显式迁移清单时才能补充条件。

### Task 1: 先写迁移失败测试

**Files:**
- Modify: `packages/db/test/migrations.test.ts`
- Create: `packages/db/test/account-media-identity.test.ts`

**Step 1:** 写真实 PG 测试：升级后同 workspace 下 `KUAISHOU/same-id` 与 `TENCENT/same-id` 同时存在且 daily/raw/balance/task 互不碰撞。

**Step 2:** 写回填测试：旧行从唯一 `accounts.media` 得到 media；孤儿引用使 migration 原子失败；无默认值。

**Step 3:** 写 up/down/up 测试；另写“存在跨 media 同号数据时 down 拒绝”的 fail-safe 测试。

**Step 4:** 运行 `npm --prefix packages/db test -- --run test/migrations.test.ts test/account-media-identity.test.ts`，确认新用例先失败。

### Task 2: 实现 migration 与最终 Contract schema

**Files:**
- Create: `packages/db/migrations/005_account_media_identity.cjs`
- Modify: `packages/contract/schema.sql`

**Step 1:** 按第 3 节分阶段添加、回填、校验、约束和索引。

**Step 2:** 给直接账户事实增加三键 FK；对分区表确认约束可在 PG16 生效。

**Step 3:** 实现 fail-safe down；不吞掉数据库错误。

**Step 4:** 运行 migration 定向测试，确认 up/down/up 与双媒体反例通过。

**Step 5:** 限定提交：`[be] 迁移账户媒体联合键`。

### Task 3: Repository 与 ETL 全链路带 media

**Files:**
- Modify: `packages/db/src/metrics-repository.ts`
- Modify: `packages/db/src/raw-metrics-repository.ts`
- Modify: `packages/db/src/task-repository.ts`
- Modify: `packages/db/src/credential-repository.ts`
- Modify: `packages/db/src/data-quality-repository.ts`
- Modify: `apps/worker/src/etl/raw-ingest.ts`
- Modify: `apps/worker/src/etl/canonical-handler.ts`
- Modify: 其直接测试和 benchmark fixture

**Step 1:** 先将所有 key type 改为 `{media, accountId}`，让旧实现编译/测试失败。

**Step 2:** SQL、序列化 key、完整性检查、upsert conflict、advisory lock 全部纳入 media。

**Step 3:** ETL 的 media 只能来自可信请求/job scope；上游 row 的 media 仅可用于一致性校验，不能覆盖 scope。

**Step 4:** 运行 DB/Worker 定向与全量测试。

**Step 5:** 限定提交：`[be] 贯通账户媒体身份链路`。

### Task 4: Semantic SQL tuple 授权

**Files:**
- Modify: `packages/db/src/semantic-query-types.ts`
- Modify: `packages/db/src/semantic-query-support.ts`
- Modify: `packages/db/src/semantic-query-metrics.ts`
- Modify: `packages/db/src/semantic-query-repository.ts`
- Modify: `packages/db/src/semantic-query-health.ts`
- Modify: `packages/db/src/semantic-query-dimension.ts`
- Modify: `apps/worker/src/data/platform-data-source.ts`
- Modify: `packages/db/test/semantic-query-repository.test.ts`
- Modify: `apps/worker/test/platform-data-source.test.ts`

**Step 1:** 新增严格 `accountScopes: [{media, accountId}]`；空 scope 生成 `false`，重复/空值拒绝。

**Step 2:** 用参数化 `jsonb_to_recordset`/等价 SQL 过滤批准 tuple；禁止把 tuple 降成两个独立集合。

**Step 3:** 所有 metric↔account、metric↔task_account JOIN 带 workspace/media/account；聚合 `DISTINCT` 和 account-day 也带 media。

**Step 4:** 真实 PG 反例：同 workspace、两 media、同 account_id，只批准一对时 summary/trend/table/lineage/health 均只看到一侧。

**Step 5:** 保留返回层三键 guard，形成查询前后双防线。

**Step 6:** 限定提交：`[be] 收紧平台数据tuple授权`。

### Task 5: 全量门禁与交审留痕

**Files:**
- Create: `docs/evidence/R3-账户媒体联合键质量报告.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/relay/inbox-arch.md`

**Step 1:** 运行 Domain、DB、Worker、Gateway 全量 test/typecheck/lint/audit。

**Step 2:** 运行 migration up/down/up 和同号跨媒体真实 PG 证据；扫描 SQL、凭证和写入口。

**Step 3:** 记录每个提交 SHA、原始测试摘要、未完成项与 Claude/arch review pending。

**Step 4:** `git diff --check`、路径限定自查、`git show --stat`；不 push。

