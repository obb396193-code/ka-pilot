# Personal and Team Workspaces Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a default personal workspace plus a switchable read-only team workspace without mixing data or write authority.

**Architecture:** Persist workspace kind and resolve a discriminated server-side scope from session membership. Personal reads use explicit account grants; team reads are bounded by a separate team workspace and are read-only. Team ingestion is source-neutral so KA Data or an approved department Qihang adapter can populate the same canonical tables.

**Tech Stack:** PostgreSQL migrations, Zod Domain contracts, Node/TypeScript Worker services, Next.js BFF, Vitest, real PostgreSQL integration tests.

---

### Task 1: Freeze workspace kind and scope contracts

**Files:**
- Modify: `packages/domain/src/auth-context.ts`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/contract/api.md`
- Test: `packages/domain/test/auth-context.test.ts`

**Steps:**
1. Add failing tests for `workspaceKind=personal|team` and discriminated scopes
   `explicit_accounts|team_workspace_readonly`.
2. Verify invalid combinations fail: personal+team scope, team+execute account grant, or missing kind.
3. Implement strict Zod schemas and preserve requestId/error conventions.
4. Run Domain focused and full tests.
5. Commit only Domain/Contract files.

### Task 2: Persist workspace kind with safe migration

**Files:**
- Create: `packages/db/migrations/010_workspace_kind.cjs`
- Modify: `packages/contract/schema.sql`
- Test: `packages/db/test/workspace-kind-migration.test.ts`
- Test: `packages/db/test/migrations.test.ts`

**Steps:**
1. Write up/down/up real-PG tests, including legacy deterministic backfill to `personal` and invalid kind rejection.
2. Add `workspaces.kind NOT NULL CHECK (kind IN ('personal','team'))` without weakening existing FKs.
3. Verify two workspaces may contain the same `(media,account_id)` without collision.
4. Run migration-focused then DB full tests serially.
5. Commit migration, schema and tests.

### Task 3: Resolve personal and team session scopes

**Files:**
- Modify: `packages/db/src/auth-repository.ts`
- Modify: `packages/domain/src/auth-context.ts`
- Modify: `apps/worker/src/auth/session-auth-service.ts`
- Test: `packages/db/test/auth-repository.test.ts`
- Test: `apps/worker/test/session-auth-service.test.ts`

**Steps:**
1. Add failures for wrong workspace kind, inactive team membership, other user's personal workspace and stale switch state.
2. Resolve personal scope only from explicit grants; resolve team scope only from active team membership.
3. Default a newly issued session to the identity's personal workspace; duplicate active personal workspaces fail closed.
4. Ensure switching rotates/updates server session state and never accepts browser-supplied scope mode.
5. Run Domain/DB/Worker auth tests and commit.

### Task 4: Add session read and workspace-switch HTTP vertical slice

**Files:**
- Create: `apps/worker/src/auth/session-http.ts`
- Modify: `apps/worker/src/data/http-server.ts`
- Test: `apps/worker/test/session-http.test.ts`

**Steps:**
1. Write failing tests for session response workspace kind/readOnly and allowed switch.
2. Add 401/403 tests for missing session, non-member workspace and inactive membership.
3. Implement only session GET and workspace switch; no team administration endpoint.
4. Verify requestId, no-store, exact-16MB and token redaction.
5. Run Worker focused/full gates and commit.

### Task 5: Enforce team-readonly across business reads

**Files:**
- Modify: `apps/worker/src/data/query-service.ts`
- Modify: `apps/worker/src/tasks/task-list-service.ts`
- Modify: `apps/worker/src/accounts/account-list-service.ts`
- Modify: `apps/worker/src/work-items/work-item-list-service.ts`
- Modify relevant DB repositories and tests.

**Steps:**
1. Add cross-workspace and same-account-id counterexamples for both scope modes.
2. Personal queries keep tuple grants; team queries may read only rows whose workspace equals the approved team workspace.
3. Team work-item list excludes unscoped personal `self/agent_question` rows.
4. Reject every team-context write or transition before repository/media access.
5. Run real-PG repository tests, Worker service/HTTP tests and commit per vertical slice.

### Task 6: Add source-neutral team ingestion

**Files:**
- Create: `apps/worker/src/team-data/team-data-source.ts`
- Create: `apps/worker/src/team-data/team-sync-service.ts`
- Modify: `apps/worker/src/data/data-api-config.ts`
- Test: `apps/worker/test/team-sync-service.test.ts`
- Test: `apps/worker/test/team-sync-pg.integration.test.ts`

**Steps:**
1. Define a read-only Adapter contract shared by KA Data and an approved department Qihang implementation.
2. Add failures for missing service credential, out-of-workspace rows, invalid lineage and truncation.
3. Persist only into the configured team workspace using the canonical account composite key.
4. Make team source failure produce bounded team-only unavailable/partial state; never fall through to personal credentials.
5. Run real-PG, typecheck, lint, audit and commit.

### Task 7: Implement BFF workspace context without touching visual design

**Files:**
- Modify: `apps/web/lib/data/auth-context.ts`
- Create: `apps/web/lib/data/session-bff.ts`
- Create: `apps/web/app/api/internal/auth/session/route.ts`
- Create: `apps/web/app/api/internal/auth/workspace/route.ts`
- Test: `apps/web/lib/data/session-bff.test.ts`

**Steps:**
1. Consume canonical backend fixtures; do not hand-copy a second response schema.
2. Add requestId header/body parity, exact-16MB, no browser scope and team readOnly tests.
3. Clear workspace-keyed caches on switch and prevent stale personal/team response reuse.
4. Expose functional state to the existing frontend line without changing layout or styling.
5. Run Web data tests, typecheck, lint, production build and commit.

### Task 8: End-to-end acceptance

**Files:**
- Create: `docs/evidence/PERSONAL-TEAM-WORKSPACE-001-验收报告.md`
- Modify: `docs/plans/工作台账.md`

**Steps:**
1. Seed two identities, two personal workspaces and one shared team workspace with colliding account IDs.
2. Verify membership, switching, isolation, team read-only and personal source independence.
3. Verify team source unavailable does not affect personal routes.
4. Run all package tests/typecheck/lint/audit and production build; record real-PG evidence separately.
5. Commit evidence only after all claimed gates actually pass.
