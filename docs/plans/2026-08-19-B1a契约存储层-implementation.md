# B1a 契约存储层 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 建成可重放的 PostgreSQL 契约迁移、唯一指标计算实现、Qihang 取数客户端，以及具备 DB lease、ETL 留痕、重试和 canonical 合并能力的 Worker 骨架。

**Architecture:** 采用 SQL-first 的 `node-pg-migrate`，冻结 `packages/contract/schema.sql` 的迁移快照，并用独立分区维护函数按月创建指标分区。`packages/domain` 只放无 IO 纯函数；`packages/db` 负责连接、迁移与仓储；`apps/worker` 通过 PostgreSQL `jobs` 表租约消费任务，Qihang 原始响应先落 `metrics_raw`，再由独立 canonical merge job 字段级合并。

**Tech Stack:** Node.js 20、TypeScript、PostgreSQL 15+、node-pg-migrate、pg、Zod、Vitest、原生 fetch。

---

### Task 1: 固化批次状态与包级工具链

**Files:**
- Create: `docs/plans/B1a-状态.md`
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/domain/package.json`
- Create: `packages/domain/tsconfig.json`
- Create: `apps/worker/package.json`
- Create: `apps/worker/tsconfig.json`
- Create: `apps/worker/.env.example`

**Step 1: 写状态文件并记录边界**

列出 R-007 五项交付、契约缺口、测试命令和当前 SHA；所有项初始为 pending。

**Step 2: 创建包级 manifests**

`packages/db` 使用 `node-pg-migrate`、`pg`；`packages/domain` 只依赖开发期 TypeScript/Vitest；`apps/worker` 使用 `pg`、`zod`，并通过本地 package 依赖复用 db/domain。

**Step 3: 安装依赖并验证基础脚本**

Run: `npm install`（分别在三个包目录）
Expected: 三个目录均生成 lockfile，`npm test -- --run` 能启动 Vitest，即使暂时显示 no tests。

**Step 4: Commit**

```bash
git add docs/plans/B1a-状态.md packages/db packages/domain apps/worker
git commit -m "[be] 初始化B1a后端包与状态文件"
```

### Task 2: 建立可重放 PostgreSQL 迁移

**Files:**
- Create: `packages/db/migrations/001_contract_v1.cjs`
- Create: `packages/db/migrations/002_metric_partitions.cjs`
- Create: `packages/db/src/migrate.ts`
- Create: `packages/db/src/pool.ts`
- Create: `packages/db/test/migrations.test.ts`
- Create: `packages/db/docker-compose.yml`

**Step 1: 写失败的迁移集成测试**

测试流程：空库执行 `up` 两次；断言第二次无新迁移；核对 `jobs`、`metrics_raw`、`account_metrics_daily`、`etl_runs` 存在；核对当前月和下月分区存在；执行 `down` 后重新 `up` 成功。

**Step 2: 启动本地 PostgreSQL**

Run: `docker compose -f packages/db/docker-compose.yml up -d`
Expected: `pg_isready` 返回 accepting connections。

**Step 3: 运行测试确认失败**

Run: `npm test -- --run test/migrations.test.ts`
Expected: FAIL，原因是迁移文件或迁移入口尚不存在。

**Step 4: 实现迁移**

- `001_contract_v1.cjs` 冻结契约表结构，不在运行时读取会继续变化的源文件；
- `002_metric_partitions.cjs` 创建 `ensure_monthly_metric_partitions(month_start)`，为 raw/canonical/hourly 三张分区表创建月分区；
- 首次迁移固定创建覆盖 90 天回灌所需月份、当前月与下月；Worker 启动时再调用函数续建；
- `down` 按依赖逆序删除，迁移元数据由 node-pg-migrate 管理。

**Step 5: 运行重放测试**

Run: `npm test -- --run test/migrations.test.ts`
Expected: PASS。

**Step 6: Commit**

```bash
git add packages/db
git commit -m "[be] 增加契约迁移与指标月分区"
```

### Task 3: 实现指标纯函数唯一口径

**Files:**
- Create: `packages/domain/src/metrics.ts`
- Create: `packages/domain/src/types.ts`
- Create: `packages/domain/src/index.ts`
- Create: `packages/domain/test/metrics.test.ts`

**Step 1: 写公式失败测试**

覆盖 CTR、CVR、real CPA、cash cost/cash CPA、cost space、GAP、潜客率、BI 转化率、velocity、日消耗预估和断量倒计时。

**Step 2: 写边界失败测试**

覆盖：分母 0→null；cost>0 且真实转化 0→infinite 状态；昨 0 今>0→`NEW`；昨 0 今 0→0；比率型环比返回百分点；零耗日不进均值；单日消耗大于历史均值 5 倍标异常但不删除。

**Step 3: 运行测试确认失败**

Run: `npm test -- --run test/metrics.test.ts`
Expected: FAIL，模块尚未实现。

**Step 4: 实现无 IO 纯函数**

导出 `safeDivide`、`compareAbsolute`、`compareRate`、`computeDerivedMetrics`、`meanIgnoringZeroSpend`、`isSpendAnomaly`。金额计算内部不格式化字符串，显示层不进入 domain。

**Step 5: 运行测试**

Run: `npm test -- --run test/metrics.test.ts`
Expected: PASS。

**Step 6: Commit**

```bash
git add packages/domain
git commit -m "[be] 实现冻结指标口径与边界测试"
```

### Task 4: 实现 Qihang get_data 客户端

**Files:**
- Create: `apps/worker/src/qihang/client.ts`
- Create: `apps/worker/src/qihang/schemas.ts`
- Create: `apps/worker/src/qihang/errors.ts`
- Create: `apps/worker/test/qihang-client.test.ts`

**Step 1: 写请求构造失败测试**

覆盖四个 resource：`account` 使用分页参数；`account_realtime`/`ad_realtime` 使用 `ds`；`account_offline` 使用 `beginDate/endDate`；`userId` 必须来自 job payload，不读取本机个人环境变量。

**Step 2: 写重试失败测试**

Mock fetch：502→503→200 应成功且等待 100ms/200ms；504 连续三次后抛 RetryExhausted；401/403 或已冻结的业务鉴权码直接抛 `BlockedAuthError` 且只调用一次。

**Step 3: 实现客户端**

- Base URL 默认 `https://qh.alibaba-inc.com/qihang/api/rta_auto/tmp/get_data`，可由应用级环境变量覆盖；
- URLSearchParams 构造，日志不得打印 userId 完整值；
- 原生 fetch + 可注入 `sleep`/`fetch` 便于单测；
- Zod 只校验响应外壳和 account 分页体，不丢弃接口额外字段。

**Step 4: 运行测试**

Run: `npm test -- --run test/qihang-client.test.ts`
Expected: PASS，且测试不访问真实内网。

**Step 5: Commit**

```bash
git add apps/worker/src/qihang apps/worker/test/qihang-client.test.ts
git commit -m "[be] 封装Qihang四类取数与重试边界"
```

### Task 5: 实现 jobs DB lease 消费器

**Files:**
- Create: `packages/db/src/job-repository.ts`
- Create: `apps/worker/src/jobs/types.ts`
- Create: `apps/worker/src/jobs/consumer.ts`
- Create: `apps/worker/src/jobs/retry.ts`
- Create: `apps/worker/test/job-consumer.test.ts`
- Create: `packages/db/test/job-repository.test.ts`

**Step 1: 写并发租约失败测试**

插入两个 queued job，同时启动两个 lease 请求；断言同一 job 不会被两个消费者取得。验证 SQL 使用事务内 `FOR UPDATE SKIP LOCKED`，并原子更新 `status='leased'`、`lease_until`、`attempts`。

**Step 2: 写状态机失败测试**

覆盖 done、普通失败重试、超过 max_attempts→failed、BlockedAuthError→blocked_auth、不重试。

**Step 3: 实现仓储与消费循环**

消费者一次只租一个 job，handler 开始时标 running；成功标 done；失败时按 attempts 与错误类型更新状态和 run_after。循环支持 AbortSignal，禁止不可停止的常驻 while true。

**Step 4: 运行测试**

Run: `npm test -- --run test/job-repository.test.ts`
Run: `npm test -- --run test/job-consumer.test.ts`
Expected: PASS。

**Step 5: Commit**

```bash
git add packages/db/src/job-repository.ts packages/db/test/job-repository.test.ts apps/worker/src/jobs apps/worker/test/job-consumer.test.ts
git commit -m "[be] 实现PostgreSQL租约任务消费器"
```

### Task 6: 实现 ETL full/incr 与留痕

**Files:**
- Create: `packages/db/src/etl-repository.ts`
- Create: `apps/worker/src/etl/payload.ts`
- Create: `apps/worker/src/etl/full-handler.ts`
- Create: `apps/worker/src/etl/incr-handler.ts`
- Create: `apps/worker/src/etl/raw-ingest.ts`
- Create: `apps/worker/src/notifications/outbound.ts`
- Create: `apps/worker/test/etl-handlers.test.ts`

**Step 1: 写 full/incr 失败测试**

- full：account→昨日 offline→近 7 日 realtime；
- incr：当日 realtime + payload 中重点账户的 ad_realtime；
- 每次创建 etl_run，成功写 rows_ingested，失败写 step_failed/error_summary；
- 每一条原始响应保留完整 payload、resource、查询日期和字段来源。

**Step 2: 写失败通知测试**

普通重试耗尽后插入 outbound_messages 告警；鉴权错误使 job blocked_auth 并生成只通知凭证所有人的告警，不切换 userId。

**Step 3: 实现 handlers**

所有数据库写入通过仓储；handler 不自行计算指标；raw ingest 使用批量参数化 INSERT；日志仅记录 job/resource/行数，不记录完整 payload 与凭证。

**Step 4: 运行测试**

Run: `npm test -- --run test/etl-handlers.test.ts`
Expected: PASS。

**Step 5: Commit**

```bash
git add packages/db/src/etl-repository.ts apps/worker/src/etl apps/worker/src/notifications apps/worker/test/etl-handlers.test.ts
git commit -m "[be] 增加全量增量ETL与运行留痕"
```

### Task 7: 实现 raw → canonical 字段级合并 job

**Files:**
- Create: `packages/domain/src/canonical.ts`
- Create: `packages/domain/test/canonical.test.ts`
- Create: `packages/db/src/metrics-repository.ts`
- Create: `apps/worker/src/etl/canonical-handler.ts`
- Create: `apps/worker/test/canonical-handler.test.ts`

**Step 1: 写字段级合并失败测试**

历史日消耗优先 offline，offline 缺转化字段时只补 realtime 对应字段；当日只用 realtime；每字段写 `field_sources`；离线整行缺失时标 `gap_filled_by_realtime=true`；同一账户同日只产一条 canonical。

**Step 2: 写计算集成失败测试**

将合并后的基础字段传给 `packages/domain` 指标函数，断言 real_cpa/cash_cost/cost_space/gap 等落库值一致；channel coefficient 和 assessment price 必须由仓储按生效日期读取，不硬编码。

**Step 3: 实现合并与 upsert**

纯合并函数与 DB 查询分离；upsert 显式列名，禁止 `SELECT *` 直接映射；canonical job 可按 workspace/account/date 幂等重跑。

**Step 4: 运行测试**

Run: `npm test -- --run packages/domain/test/canonical.test.ts`
Run: `npm test -- --run apps/worker/test/canonical-handler.test.ts`
Expected: PASS。

**Step 5: Commit**

```bash
git add packages/domain packages/db/src/metrics-repository.ts apps/worker/src/etl/canonical-handler.ts apps/worker/test/canonical-handler.test.ts
git commit -m "[be] 实现字段级canonical合并任务"
```

### Task 8: Worker 入口、全量验证与交付回执

**Files:**
- Create: `apps/worker/src/config.ts`
- Create: `apps/worker/src/index.ts`
- Create: `apps/worker/test/worker-smoke.test.ts`
- Modify: `docs/plans/B1a-状态.md`
- Modify: `docs/relay/inbox-codex.md`

**Step 1: 写启动冒烟测试**

缺 DATABASE_URL 时快速失败且不泄露配置；连接可用时续建月分区、注册三个 handler（etl_full/etl_incr/canonical_merge）并可被 AbortSignal 干净停止。

**Step 2: 实现入口**

Zod 校验环境变量，初始化 Pool，确保分区，启动有界消费循环；SIGTERM/SIGINT 触发 abort、等待当前 job 收口并关闭连接池。

**Step 3: 跑全部检查**

Run: `npm test -- --run`（三个包）
Expected: 全部 PASS。

Run: `npm run typecheck`（三个包）
Expected: 0 errors。

Run: `npm run lint`（三个包）
Expected: 0 errors。

Run: `docker compose -f packages/db/docker-compose.yml down -v && docker compose -f packages/db/docker-compose.yml up -d`
Expected: 空库迁移、重放与 Worker smoke 全通过。

**Step 4: 更新状态与信箱**

逐项填真实测试结果、SHA、未在本地验证的内网事项；不得把 mock client 写成真实连通。

**Step 5: Final Commit**

```bash
git add apps/worker packages/db packages/domain docs/plans/B1a-状态.md docs/relay/inbox-codex.md
git commit -m "[be] 完成B1a契约存储与Worker骨架"
```
