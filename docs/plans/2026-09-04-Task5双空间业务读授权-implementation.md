# Task5 双空间业务读授权 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 query、tasks、accounts、work-items list/detail 的身份与范围只来自服务端 Session，并严格执行 personal 显式账户授权与 team workspace 全空间只读隔离。

**Architecture:** `Authorization: Bearer` 只认证可信 BFF/内部调用方；后端从 `HttpOnly` Session cookie 解析唯一 `ApprovedWorkspaceAuthContext`。业务 Service 与 DB Repository 全程传递判别式 scope，personal 使用 `(media, account_id)` tuple，team 只使用 active team workspace 且不读取 account grants。输出侧继续做 workspace/tuple 二次守卫。

**Tech Stack:** TypeScript, Node HTTP, Zod, PostgreSQL, Vitest, pnpm/npm workspace scripts.

---

### Task 1: Freeze business-session auth bridge

**Files:**
- Create: `apps/worker/src/auth/business-read-auth.ts`
- Modify: `apps/worker/src/data/http-server.ts`
- Modify: `apps/worker/src/data-api.ts`
- Modify: `packages/contract/api.md`
- Test: `apps/worker/test/data-api-http.test.ts`
- Test: `apps/worker/test/session-http.test.ts`

**Steps:**
1. Add failing HTTP tests proving internal bearer without Session is 401 and forged `x-ka-*` headers never affect scope.
2. Inject `SessionAuthService` into HTTP composition and resolve the cookie for every business route.
3. Remove legacy header decoding and its account-scope schema from production routing.
4. Preserve stable requestId, exact-16MB boundary, health and Session route behavior.
5. Run focused Worker tests and commit this vertical slice.

### Task 2: Enforce discriminated scope in data query

**Files:**
- Modify: `apps/worker/src/data/query-service.ts`
- Modify: `apps/worker/src/data/ka-data-client.ts`
- Modify: `apps/worker/src/data/platform-data-source.ts`
- Modify: `packages/db/src/semantic-query-types.ts`
- Modify: `packages/db/src/semantic-query-support.ts`
- Test: relevant Domain/DB/Worker query tests.

**Steps:**
1. Replace `AuthenticatedDataQueryContext` with strict `ApprovedWorkspaceAuthContext`.
2. Personal builds an explicit tuple scope and rejects requested tuples outside grants.
3. Team builds a workspace-only read scope; Platform repository queries stay bounded by workspace and do not inspect grants.
4. Shared KA Data remains disabled/diagnostic-only for team unless a separate approved source path exists; never turn a shared source into authorization.
5. Keep canonical row/output guards, lineage and truncation semantics; commit independently.

### Task 3: Enforce discriminated scope in list repositories

**Files:**
- Modify: `packages/db/src/account-list-{repository,sql}.ts`
- Modify: `packages/db/src/task-list-{repository,sql}.ts`
- Modify: `packages/db/src/work-item-list-{repository,sql}.ts`
- Modify: corresponding Worker services and tests.

**Steps:**
1. Add strict `scopeKind` to repository input; team rejects any carried account grant.
2. Personal SQL joins explicit tuple scope; team SQL filters only the approved workspace.
3. Team work-item SQL excludes both-null personal rows; personal retains only own assignee/creator both-null rows.
4. Add same account ID across media/workspace and malicious-row output-guard tests.
5. Run real PostgreSQL repository suites and commit each coherent vertical slice.

### Task 4: Close detail and read-only boundaries

**Files:**
- Modify: `apps/worker/src/data/read-detail-service.ts`
- Test: `apps/worker/test/read-detail-service.test.ts`
- Test: relevant HTTP tests.

**Steps:**
1. Personal account details require tuple grant; personal unscoped work items require own assignee/creator.
2. Team account work items may be read only inside the approved team workspace; team unscoped work items are forbidden.
3. Team changesets remain forbidden; all non-GET routes remain 405 before repository/media access.
4. Preserve strict identity checks, requestId and response size boundary; commit independently.

### Task 5: Prove the complete login-switch-read-logout path

**Files:**
- Add or modify Worker real-PG HTTP integration tests.
- Modify: `docs/relay/inbox-review-codex.md`
- Modify: `docs/plans/工作台账.md`

**Steps:**
1. Seed one identity with personal and team membership, colliding account IDs across media/workspaces and explicit personal grants.
2. Verify login cookie → personal reads → workspace switch token rotation → team reads → old token 401 → forged headers inert → logout → 401.
3. Run Domain, DB and Worker full tests, typecheck, lint, production dependency audit and diff/security scan.
4. Verify `apps/web` and `apps/ui-layout-demo` have zero diff.
5. Commit evidence/relay/ledger only after the claimed gates pass; do not push or enter Task6.

## 执行结果（2026-09-04）

- Task 1–5 已在代码候选 `b98fa4f` 完成；实际以一个可独立编译、可独立验收的纵切片提交，避免拆出中间不可运行的 HTTP/Service Contract。
- 真实 PostgreSQL + HTTP 证明了登录、personal 账户授权、team 空间只读、token 轮换、旧 token 失效、伪造 `x-ka-*` 无效及 logout 失效链路。
- 未进入 Task6 team ingestion；未修改 `apps/web`、`apps/ui-layout-demo`；未开放任何媒体写路由。
- 前端 BFF 尚未转发 Session cookie，真实奇航/KA Data 与内网部署尚未执行。
