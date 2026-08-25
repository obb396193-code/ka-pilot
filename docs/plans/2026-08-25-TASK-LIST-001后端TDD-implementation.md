# TASK-LIST-001 后端 TDD Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现只读 `GET /api/v1/tasks`，在 AUTH-001 批准的 workspace/account tuple 内返回稳定分页的任务、权限化账户/工作项摘要和由 `computeTaskPacing` 生成的 pacing。

**Architecture:** Domain 冻结 strict request/response/error schema 和上海 03:00 业务日；DB 在单个 `REPEATABLE READ READ ONLY` 事务中查 total、稳定分页与本页聚合事实，所有账户派生数据通过 `(media,account_id)` JSON tuple scope 过滤。Worker Service 只组合批准身份、业务日、契约状态与奇航主源审计；HTTP 复用已有 internal Bearer + server-side scope + requestId 边界，不增加任何写路由。

**Tech Stack:** TypeScript、Zod、PostgreSQL 16、node-postgres、Vitest、现有 `@ka/domain` / `@ka/db` / Worker data-api。

---

### Task 1: Domain strict Contract 与业务日

**Files:**
- Create: `packages/domain/src/task-list-contract.ts`
- Create: `packages/domain/test/task-list-contract.test.ts`
- Modify: `packages/domain/src/index.ts`

1. 先写 RED：默认/边界请求、未知字段、真实日历日、状态枚举、opaque task ID、RatioValue 不变式和 strict response。
2. 增加 `taskListRequestSchema/taskListResponseSchema`，成功与错误 envelope 不共享任意 record。
3. 新增上海 03:00 业务日纯函数，覆盖 02:59/03:00/跨年。
4. 运行 Domain 定向 test/typecheck/lint，路径限定提交。

### Task 2: 真实 PG 任务列表 Repository

**Files:**
- Create: `packages/db/src/task-list-repository.ts`
- Create: `packages/db/test/task-list-repository.test.ts`
- Modify: `packages/db/src/index.ts`

1. 先写真实 PG RED：搜索/状态/负责人/周期/工作项筛选，active→preparing→ended + period end + task ID 稳定分页。
2. 用同一 `REPEATABLE READ READ ONLY` 事务查 total、page 和聚合；失败回滚，禁止 N+1。
3. assessment price 仅取 `effective_date <= businessDate` 的最新版本。
4. linked account、metrics 和 open work-item 全部用参数化 tuple scope；空 scope 返回任务 metadata 但不泄露账户派生事实，并标 coverage 不完整。
5. 覆盖同 workspace 跨 media 同 ID、跨 workspace、未授权工作项、未来考核价、非法 DB 状态和并发分页快照。
6. 运行 DB 定向 test/typecheck/lint，路径限定提交。

### Task 3: Worker Service 与 pacing 组合

**Files:**
- Create: `apps/worker/src/tasks/task-list-service.ts`
- Create: `apps/worker/test/task-list-service.test.ts`

1. 先写 RED：无 auth 401，严格请求 400，两种 scope 权限，pacing 逐字段等于 `computeTaskPacing`。
2. 对 Repository facts 做 fail-closed 验证，非法任务状态/数值为 502；source unavailable/timeout 映射 503/504，未知错误 500。
3. `dataState` 固定 `partial > stale > empty > ready`，`selectedSource` 固定 `qihang`；`dataAsOf` 只来自 canonical `computed_at`。
4. 比率不重算、不四舍五入；仅对 `computeTaskPacing` 结果做契约字段投影。
5. 运行 Worker 定向 test/typecheck/lint，路径限定提交。

### Task 4: 只读 HTTP composition 与 fixtures

**Files:**
- Modify: `apps/worker/src/data/http-server.ts`
- Modify: `apps/worker/src/data-api.ts`
- Create: `apps/worker/test/task-list-http.test.ts`
- Create: `packages/contract/fixtures/task-list/*.json`
- Create: `packages/domain/test/task-list-response-fixtures.test.ts`

1. 先写 HTTP RED：GET ready/empty/partial/stale，401/403/400/502/503/504/500，requestId 头体一致。
2. 挂载精确 `/api/v1/tasks`；仅解析冻结 query，未知 `workspaceId/accountIds/dataSource` 统一 400。
3. POST/PATCH 不挂载，对 tasks 路由的非 GET 只返 405 + 稳定错误，不产生写副作用。
4. 复用 16MB 有界响应；错误不回显 SQL/scope/Secret/上游正文。
5. 所有 fixture 由 Domain schema 直接校验，作为前端 parity 唯一真相。

### Task 5: 全量质量与交接

**Files:**
- Create: `docs/evidence/TASK-LIST-001-后端质量报告.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/relay/inbox-be-codex.md`
- Modify: `docs/relay/inbox-arch.md`

1. 运行 Domain/DB/Worker 全量 test/typecheck/lint/coverage/audit 与真实 PG。
2. 扫描动态 SQL、凭证、N+1、响应边界、复杂度和前端 0 diff。
3. 记录独立 SHA、原始测试摘要和真实未完成项；未 push、未部署、真实媒体写继续关闭。
