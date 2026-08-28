# PERSONAL-WORKSPACE-V1 工作项详情收口 Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让无账户个人工作项在当前 personal workspace 内仅对本人 assignee/creator 可读，同时维持账户 tuple、变更集、requestId 与 16MB 边界的 fail-closed 语义。

**Architecture:** Domain 用 strict Zod 联合约束区分 work item 的“完整账户 tuple”与“双 null 个人对象”，changeset 继续只接受完整 tuple。Worker Service 在投影响应前先验证 path/workspace 身份，再按 tuple scope 或本人 assignee/creator 授权；HTTP 继续复用现有认证、requestId 和统一有界 JSON 输出。

**Tech Stack:** TypeScript、Zod、Vitest、Node HTTP、pnpm workspace。

---

### Task 1: 冻结 Domain 详情对象边界

**Files:**
- Modify: `packages/domain/src/read-detail-contract.ts`
- Create: `packages/domain/test/read-detail-contract.test.ts`

**Step 1: Write the failing test**

- 断言 work item 的 `media/accountId` 双 null 合法。
- 断言任一字段单独为 null 非法。
- 断言 changeset 的任一账户字段为 null 非法。
- 断言 strict schema 拒绝未知字段。

**Step 2: Run test to verify it fails**

Run: `(cd packages/domain && npm test -- --run test/read-detail-contract.test.ts)`
Expected: FAIL，因为当前 work item 强制两个账户字段为非空字符串。

**Step 3: Write minimal implementation**

- 将 work item 的 `media/accountId` 改为 nullable。
- 用 `superRefine` 强制二者只能同时存在或同时为 null。
- changeset 保持既有 `accountScopeFields`，不放宽。

**Step 4: Run test to verify it passes**

Run: `(cd packages/domain && npm test -- --run test/read-detail-contract.test.ts)`
Expected: PASS。

### Task 2: 收口 ReadDetailService 个人授权

**Files:**
- Modify: `apps/worker/src/data/read-detail-service.ts`
- Modify: `apps/worker/test/read-detail-service.test.ts`

**Step 1: Write the failing tests**

- 无账户工作项 assignee 是当前用户时 200。
- creator 是当前用户时 200，并保留 assignee/creator。
- 其他用户、半空 tuple 返回 fail-closed。
- path id/workspace 不一致继续失败且不泄露记录正文。
- 账户型工作项继续严格匹配 `(media,accountId)` grant。

**Step 2: Run tests to verify they fail**

Run: `(cd apps/worker && npm test -- --run test/read-detail-service.test.ts)`
Expected: FAIL，因为当前 Service 对所有无账户记录返回 403。

**Step 3: Write minimal implementation**

- 对 work item 先判定 tuple 形状：完整、双 null、半空非法。
- 完整 tuple 走 approved account grant。
- 双 null 仅允许 `assignee===auth.userId || creator===auth.userId`。
- 半空和非法 canonical row 返回稳定 `INTERNAL_ERROR`，不回显行内容。
- changeset 不改授权逻辑。

**Step 4: Run tests to verify they pass**

Run: `(cd apps/worker && npm test -- --run test/read-detail-service.test.ts)`
Expected: PASS。

### Task 3: 固化 HTTP/requestId/16MB 回归

**Files:**
- Modify: `apps/worker/test/data-api-http.test.ts`

**Step 1: Write the failing HTTP test**

- 无账户且本人 creator 的详情返回 200。
- 成功响应 `x-request-id` 使用合法 BFF correlation ID。
- 本人字段仍在响应中。
- exact response byte boundary 仍返回 502 `SOURCE_TRUNCATED`。

**Step 2: Run the test**

Run: `(cd apps/worker && npm test -- --run test/data-api-http.test.ts)`
Expected: 新个人详情用例在实现前 FAIL，现有 16MB 用例保持 PASS。

**Step 3: Complete implementation only if needed**

- HTTP composition 不新增路由、不改认证头、不开放写方法。
- 若回归暴露问题，只修共享 read-detail path。

**Step 4: Run targeted regression**

Run: `(cd apps/worker && npm test -- --run test/read-detail-service.test.ts test/data-api-http.test.ts test/work-item-list-http.test.ts)`
Expected: PASS。

### Task 4: 质量门禁、提交与 AUTH/session 只读审计

**Files:**
- Create: `docs/evidence/PERSONAL-WORKSPACE-V1-工作项详情质量报告.md`
- Modify: `docs/plans/工作台账.md`
- Modify: `docs/relay/inbox-be-codex.md`

**Step 1: Commit code and tests independently**

Run: `git commit -- packages/domain/src/read-detail-contract.ts packages/domain/test/read-detail-contract.test.ts apps/worker/src/data/read-detail-service.ts apps/worker/test/read-detail-service.test.ts apps/worker/test/data-api-http.test.ts`
Expected: 一个只含代码与测试的 `[be]` SHA。

**Step 2: Run quality checks**

- Domain/DB/Worker 全量非 PG test、typecheck、lint。
- 定向 coverage、`npm audit`、凭证/危险 API 扫描、复杂度/文件行数、`git diff --check`。
- 仅探测 Docker；若仍 EOF，明确 `pg_blocked`，不得伪报。

**Step 3: Read-only AUTH/session audit**

- 实读 migration、Auth Repository、Session Service 与 HTTP composition。
- 报告同 identity 多 workspace 的底层现状、一期是否有 login/session/personal workspace 初始化路由，以及缺口；不实现新迁移或公开接口。

**Step 4: Record and commit handoff**

Run: `git commit -- docs/plans/2026-08-28-PERSONAL-WORKSPACE-V1工作项详情收口-implementation.md docs/evidence/PERSONAL-WORKSPACE-V1-工作项详情质量报告.md docs/plans/工作台账.md docs/relay/inbox-be-codex.md`
Expected: 一个独立留痕 SHA，注明权威冻结点 `b0b9767`、代码 SHA、门禁结果、PG 状态和 AUTH/session gaps。
