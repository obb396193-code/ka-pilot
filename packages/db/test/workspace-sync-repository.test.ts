import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import {
  candidateBlockedReason,
  WorkspaceSyncRepository,
} from "../src/workspace-sync-repository.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("WorkspaceSyncRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const repository = new WorkspaceSyncRepository(pool);
  const workspaceIds: string[] = [];
  const identityIds: string[] = [];

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  afterEach(async () => {
    if (workspaceIds.length === 0) return;
    await pool.query("DELETE FROM etl_runs WHERE workspace_id = ANY($1::uuid[])", [workspaceIds]);
    await pool.query("DELETE FROM jobs WHERE workspace_id = ANY($1::uuid[])", [workspaceIds]);
    await pool.query("DELETE FROM account_access_grants WHERE workspace_id = ANY($1::uuid[])", [workspaceIds]);
    await pool.query("DELETE FROM workspace_memberships WHERE workspace_id = ANY($1::uuid[])", [workspaceIds]);
    await pool.query("DELETE FROM accounts WHERE workspace_id = ANY($1::uuid[])", [workspaceIds]);
    await pool.query("DELETE FROM users WHERE workspace_id = ANY($1::uuid[])", [workspaceIds]);
    await pool.query("DELETE FROM workspaces WHERE id = ANY($1::uuid[])", [workspaceIds]);
    if (identityIds.length > 0) {
      await pool.query("DELETE FROM auth_identities WHERE id = ANY($1::uuid[])", [identityIds]);
    }
    workspaceIds.splice(0);
    identityIds.splice(0);
  });

  afterAll(async () => {
    await pool.end();
  });

  async function seed(options: {
    workspaceActive?: boolean;
    userActive?: boolean;
    membership?: boolean;
    membershipActive?: boolean;
    identityActive?: boolean;
    qihang?: string | null;
  } = {}) {
    const suffix = randomUUID();
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name, is_active) VALUES ($1, $2) RETURNING id",
      [`sync-${suffix}`, options.workspaceActive ?? true],
    );
    const workspaceId = workspace.rows[0]!.id;
    workspaceIds.push(workspaceId);
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, name, is_active, qihang_user_id)
       VALUES ($1, 'sync-user', $2, $3) RETURNING id`,
      [workspaceId, options.userActive ?? true, options.qihang === undefined ? "qihang-private" : options.qihang],
    );
    const userId = user.rows[0]!.id;
    let identityId: string | null = null;
    if (options.membership ?? true) {
      const identity = await pool.query<{ id: string }>(
        `INSERT INTO auth_identities (provider, provider_subject, display_name, is_active)
         VALUES ('internal_test', $1, 'sync identity', $2) RETURNING id`,
        [`subject-${suffix}`, options.identityActive ?? true],
      );
      identityId = identity.rows[0]!.id;
      identityIds.push(identityId);
      await pool.query(
        `INSERT INTO workspace_memberships (
           workspace_id, identity_id, user_id, role, is_active
         ) VALUES ($1, $2, $3, 'optimizer', $4)`,
        [workspaceId, identityId, userId, options.membershipActive ?? true],
      );
    }
    return { workspaceId, userId, identityId };
  }

  it("returns active identity, media-scoped grants and no Qihang identifier", async () => {
    const seeded = await seed();
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'same-account'), ($1, 'TENCENT', 'same-account')`,
      [seeded.workspaceId],
    );
    await pool.query(
      `INSERT INTO account_access_grants (
         workspace_id, identity_id, media, account_id, access_level
       ) VALUES ($1, $2, 'KUAISHOU', 'same-account', 'read'),
                ($1, $2, 'TENCENT', 'same-account', 'preview')`,
      [seeded.workspaceId, seeded.identityId],
    );

    const snapshot = await repository.loadTickSnapshot(seeded.workspaceId, "KUAISHOU");

    expect(snapshot).toMatchObject({
      workspaceId: seeded.workspaceId,
      workspaceActive: true,
      candidates: [{
        userId: seeded.userId,
        identityId: seeded.identityId,
        hasQihangIdentity: true,
        hasSuccessfulFull: false,
        allowedAccounts: [{
          media: "KUAISHOU",
          accountId: "same-account",
          accessLevel: "read",
        }],
      }],
    });
    expect(JSON.stringify(snapshot)).not.toContain("qihang-private");
    expect(candidateBlockedReason(snapshot, snapshot.candidates[0]!)).toBeNull();
  });

  it.each([
    [{ workspaceActive: false }, "WORKSPACE_INACTIVE"],
    [{ userActive: false }, "USER_INACTIVE"],
    [{ membership: false }, "IDENTITY_MISSING"],
    [{ membershipActive: false }, "MEMBERSHIP_INACTIVE"],
    [{ identityActive: false }, "IDENTITY_INACTIVE"],
    [{ qihang: null }, "QIHANG_IDENTITY_MISSING"],
  ] as const)("fails closed for %j", async (options, reason) => {
    const seeded = await seed(options);
    const snapshot = await repository.loadTickSnapshot(seeded.workspaceId, "KUAISHOU");
    expect(candidateBlockedReason(snapshot, snapshot.candidates[0]!)).toBe(reason);
  });

  it("keeps the same external account id isolated by workspace and media", async () => {
    const left = await seed();
    const right = await seed();
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'same-account'),
              ($1, 'TENCENT', 'same-account'),
              ($2, 'KUAISHOU', 'same-account')`,
      [left.workspaceId, right.workspaceId],
    );
    await pool.query(
      `INSERT INTO account_access_grants (
         workspace_id, identity_id, media, account_id, access_level
       ) VALUES ($1, $2, 'KUAISHOU', 'same-account', 'read'),
                ($1, $2, 'TENCENT', 'same-account', 'read'),
                ($3, $4, 'KUAISHOU', 'same-account', 'read')`,
      [left.workspaceId, left.identityId, right.workspaceId, right.identityId],
    );

    const snapshot = await repository.loadTickSnapshot(left.workspaceId, "KUAISHOU");
    expect(snapshot.candidates[0]?.allowedAccounts).toEqual([
      { media: "KUAISHOU", accountId: "same-account", accessLevel: "read" },
    ]);
  });

  it("recognizes only a completed full run for the same workspace, user and media", async () => {
    const seeded = await seed();
    const job = await pool.query<{ id: string }>(
      `INSERT INTO jobs (
         workspace_id, job_type, payload, credential_owner_user_id, status
       ) VALUES ($1, 'etl_full', $2, $3, 'done') RETURNING id`,
      [seeded.workspaceId, { media: "KUAISHOU" }, seeded.userId],
    );
    await pool.query(
      `INSERT INTO etl_runs (
         workspace_id, job_id, run_kind, scope, started_at, finished_at, status, rows_ingested
       ) VALUES ($1, $2, 'full', '{}'::jsonb, now(), now(), 'done', 1)`,
      [seeded.workspaceId, job.rows[0]!.id],
    );

    const kuaishou = await repository.loadTickSnapshot(seeded.workspaceId, "KUAISHOU");
    const tencent = await repository.loadTickSnapshot(seeded.workspaceId, "TENCENT");
    expect(kuaishou.candidates[0]?.hasSuccessfulFull).toBe(true);
    expect(tencent.candidates[0]?.hasSuccessfulFull).toBe(false);
  });
});
