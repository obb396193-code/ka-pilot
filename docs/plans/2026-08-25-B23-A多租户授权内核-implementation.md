# B23-A 多租户授权内核 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use TDD and code-quality-checker to implement this plan task-by-task.

**Goal:** 从高熵 session token 安全解析 active identity、workspace membership、workspace-local user 与显式账户授权，输出严格 `approvedAuthContext`。

**Architecture:** PostgreSQL 008 migration 按冻结 Contract 创建身份四表；DB Repository 只接受 SHA-256 token hash，并只读取授权所需字段；Worker Service 负责 token hash，Domain 负责严格状态解析和 fail-closed 决策。现有 `users` 保持 workspace-local actor，不修改前端或媒体写链。

**Tech Stack:** PostgreSQL 16、node-pg-migrate、TypeScript、Zod、Node `crypto`、Vitest。

---

### Task 1: 008 身份四表 migration

**Files:**
- Create: `packages/db/migrations/008_multi_tenant_auth.cjs`
- Modify: `packages/db/test/migrations.test.ts`

1. 先写真实 PG 失败测试：四表不存在、跨 workspace user 绑定未受复合 FK 保护。
2. 运行 `npm --prefix packages/db test -- --run test/migrations.test.ts`，确认 RED。
3. 实现 `auth_identities/workspace_memberships/account_access_grants/auth_sessions`；角色、provider、access level、token hash、时间范围均加 CHECK；token hash 只允许 64 位小写 SHA-256 hex。
4. 覆盖 up/down/up、同 identity 两 workspace、跨 workspace/跨 media 同 account ID、跨 workspace user 绑定 `23503`。
5. 定向测试转绿，路径限定提交。

### Task 2: Domain 授权快照与 fail-closed 解析

**Files:**
- Create: `packages/domain/src/auth-context.ts`
- Create: `packages/domain/test/auth-context.test.ts`
- Modify: `packages/domain/src/index.ts`

1. 先写 RED：active 链输出 `{workspaceId,userId,role,allowedAccounts}`；空 grant 输出空数组。
2. 写 revoked/expired/inactive identity/inactive membership/inactive user/workspace mismatch/非法 grant 的拒绝反例。
3. 实现 strict Zod schemas、稳定 rejection reason、账户 tuple 去重和排序；只允许 `read|preview|execute`，不生成通配符。
4. 运行 Domain 定向 test/typecheck/lint，路径限定提交。

### Task 3: DB Repository 与 Worker Session Service

**Files:**
- Create: `packages/db/src/auth-repository.ts`
- Create: `packages/db/test/auth-repository.test.ts`
- Modify: `packages/db/src/index.ts`
- Create: `apps/worker/src/auth/session-auth-service.ts`
- Create: `apps/worker/test/session-auth-service.test.ts`

1. 先写 RED：Repository 只接受 token hash，SQL 不选择 `provider_subject`、`qihang_user_id`、Secret ref 或 token hash；Service 才接收明文 token并立即 SHA-256。
2. 真实 PG 覆盖同 identity 两 workspace、跨 workspace同号、同 workspace跨 media同号、空 grant、撤销 session、撤销 membership、过期/inactive。
3. Service 返回 Domain resolution；不日志化、不缓存、不持久化明文 token；Repository 结果错误或多 session fail closed。
4. 运行 DB/Worker 定向 test/typecheck/lint，路径限定提交。

### Task 4: 全量质量与 B23-C gap matrix

**Files:**
- Create: `docs/evidence/B23-A-代码质量报告.md`
- Create: `docs/evidence/B23-C-奇航只读链Gap矩阵.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/plans/Codex后端交付总账.md`
- Modify: `docs/relay/inbox-arch.md`
- Modify: `docs/relay/inbox-be-codex.md`

1. 跑 Domain/DB/Worker 全量 test、typecheck、lint、coverage、npm audit 和真实 PG。
2. 检查敏感字段、动态执行、SQL 参数化、复杂度、N+1 与 diff 边界；修复所有 Critical/High。
3. 只读审计现有 Qihang→Canonical→Semantic Query 到 `/api/v1/query`、`/tasks`、`/accounts`、`/work-items` 列表的真实缺口，引用文件行号，不发明 DTO。
4. 写质量/交接留痕并独立提交；确认分支 clean、未改前端、未 push、真实写仍关闭。
