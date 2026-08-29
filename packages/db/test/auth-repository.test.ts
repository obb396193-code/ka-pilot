import { createHash, randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import { AuthSessionRepository } from "../src/auth-repository.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";
const NOW = new Date("2026-08-25T08:00:00Z");

describe("AuthSessionRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const repository = new AuthSessionRepository(pool);
  let workspaceA: string;
  let workspaceB: string;
  let identityId: string;
  let userA: string;
  let tokenAHash: string;
  let tokenBHash: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    const suffix = randomUUID();
    const workspaces = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name, kind) VALUES ($1, 'personal'), ($2, 'team') RETURNING id",
      [`auth-repo-a-${suffix}`, `auth-repo-b-${suffix}`],
    );
    workspaceA = workspaces.rows[0]!.id;
    workspaceB = workspaces.rows[1]!.id;
    const users = await pool.query<{ id: string; workspace_id: string }>(
      `INSERT INTO users (
         workspace_id, name, qihang_user_id, multica_pat_ref, idealab_ak_ref
       ) VALUES ($1, 'actor-a', 'private-qihang-a', 'secret-ref-a', 'ak-ref-a'),
                ($2, 'actor-b', 'private-qihang-b', 'secret-ref-b', 'ak-ref-b')
       RETURNING id, workspace_id`,
      [workspaceA, workspaceB],
    );
    userA = users.rows.find((row) => row.workspace_id === workspaceA)!.id;
    const userB = users.rows.find((row) => row.workspace_id === workspaceB)!.id;
    const identity = await pool.query<{ id: string }>(
      `INSERT INTO auth_identities (provider, provider_subject, display_name)
       VALUES ('internal_test', $1, 'repo identity') RETURNING id`,
      [`private-subject-${suffix}`],
    );
    identityId = identity.rows[0]!.id;
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, identity_id, user_id, role)
       VALUES ($1, $3, $4, 'admin'), ($2, $3, $5, 'optimizer')`,
      [workspaceA, workspaceB, identityId, userA, userB],
    );
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'same-account'),
              ($1, 'TENCENT', 'same-account'),
              ($2, 'KUAISHOU', 'same-account')`,
      [workspaceA, workspaceB],
    );
    await pool.query(
      `INSERT INTO account_access_grants (
         workspace_id, identity_id, media, account_id, access_level
       ) VALUES ($1, $2, 'KUAISHOU', 'same-account', 'read'),
                ($1, $2, 'TENCENT', 'same-account', 'preview'),
                ($3, $2, 'KUAISHOU', 'same-account', 'read')`,
      [workspaceA, identityId, workspaceB],
    );
    tokenAHash = createHash("sha256").update(`token-a-${suffix}`).digest("hex");
    tokenBHash = createHash("sha256").update(`token-b-${suffix}`).digest("hex");
    await pool.query(
      `INSERT INTO auth_sessions (
         identity_id, active_workspace_id, token_hash, expires_at, created_at, last_seen_at
       ) VALUES ($1, $2, $3, '2026-08-25T09:00:00Z', '2026-08-25T07:00:00Z', '2026-08-25T07:00:00Z'),
                ($1, $4, $5, '2026-08-25T09:00:00Z', '2026-08-25T07:00:00Z', '2026-08-25T07:00:00Z')`,
      [identityId, workspaceA, tokenAHash, workspaceB, tokenBHash],
    );
  });

  afterEach(async () => {
    await pool.query("DELETE FROM auth_sessions WHERE identity_id = $1", [identityId]);
    await pool.query("DELETE FROM account_access_grants WHERE identity_id = $1", [identityId]);
    await pool.query("DELETE FROM workspace_memberships WHERE identity_id = $1", [identityId]);
    await pool.query("DELETE FROM accounts WHERE workspace_id = ANY($1::uuid[])", [[workspaceA, workspaceB]]);
    await pool.query("DELETE FROM users WHERE workspace_id = ANY($1::uuid[])", [[workspaceA, workspaceB]]);
    await pool.query("DELETE FROM workspaces WHERE id = ANY($1::uuid[])", [[workspaceA, workspaceB]]);
    await pool.query("DELETE FROM auth_identities WHERE id = $1", [identityId]);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("resolves only the active workspace grants and keeps media-account tuples distinct", async () => {
    await expect(repository.resolveApprovedAuthContext(tokenAHash, NOW)).resolves.toEqual({
      status: "approved",
      context: {
        workspaceId: workspaceA,
        userId: userA,
        role: "admin",
        workspaceKind: "personal",
        scope: {
          kind: "explicit_accounts",
          accounts: [
            { media: "KUAISHOU", accountId: "same-account", accessLevel: "read" },
            { media: "TENCENT", accountId: "same-account", accessLevel: "preview" },
          ],
        },
      },
    });
    const workspaceBResult = await repository.resolveApprovedAuthContext(tokenBHash, NOW);
    expect(workspaceBResult).toMatchObject({
      status: "approved",
      context: {
        workspaceId: workspaceB,
        workspaceKind: "team",
        scope: { kind: "team_workspace_readonly" },
      },
    });
  });

  it("returns an approved empty scope when the active membership has no grants", async () => {
    await pool.query(
      "DELETE FROM account_access_grants WHERE workspace_id = $1 AND identity_id = $2",
      [workspaceA, identityId],
    );
    await expect(repository.resolveApprovedAuthContext(tokenAHash, NOW)).resolves.toMatchObject({
      status: "approved",
      context: {
        workspaceId: workspaceA,
        workspaceKind: "personal",
        scope: { kind: "explicit_accounts", accounts: [] },
      },
    });
  });

  it("ignores more than 1000 unrelated grants in a team workspace", async () => {
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       SELECT $1, 'KUAISHOU', 'team-bulk-' || generate_series
       FROM generate_series(1, 1000)`,
      [workspaceB],
    );
    await pool.query(
      `INSERT INTO account_access_grants (
         workspace_id, identity_id, media, account_id, access_level
       )
       SELECT $1, $2, 'KUAISHOU', 'team-bulk-' || generate_series, 'execute'
       FROM generate_series(1, 1000)`,
      [workspaceB, identityId],
    );

    await expect(repository.resolveApprovedAuthContext(tokenBHash, NOW)).resolves.toMatchObject({
      status: "approved",
      context: {
        workspaceId: workspaceB,
        workspaceKind: "team",
        scope: { kind: "team_workspace_readonly" },
      },
    });
  });

  it("fails closed when a personal workspace has more than 1000 grants", async () => {
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       SELECT $1, 'KUAISHOU', 'personal-bulk-' || generate_series
       FROM generate_series(1, 999)`,
      [workspaceA],
    );
    await pool.query(
      `INSERT INTO account_access_grants (
         workspace_id, identity_id, media, account_id, access_level
       )
       SELECT $1, $2, 'KUAISHOU', 'personal-bulk-' || generate_series, 'read'
       FROM generate_series(1, 999)`,
      [workspaceA, identityId],
    );

    await expect(repository.resolveApprovedAuthContext(tokenAHash, NOW)).resolves.toEqual({
      status: "rejected",
      httpStatus: 403,
      reason: "INVALID_AUTH_STATE",
    });
  });

  it("fails closed for duplicate personal workspaces and a shared personal workspace", async () => {
    const extraWorkspace = (await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name, kind) VALUES ($1, 'personal') RETURNING id",
      [`extra-personal-${randomUUID()}`],
    )).rows[0]!.id;
    const extraUser = (await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, name)
       VALUES ($1, 'extra personal actor') RETURNING id`,
      [extraWorkspace],
    )).rows[0]!.id;
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, identity_id, user_id, role)
       VALUES ($1, $2, $3, 'optimizer')`,
      [extraWorkspace, identityId, extraUser],
    );
    await expect(repository.resolveApprovedAuthContext(tokenAHash, NOW)).resolves.toMatchObject({
      status: "rejected",
      reason: "PERSONAL_WORKSPACE_AMBIGUOUS",
    });
    await pool.query("DELETE FROM workspace_memberships WHERE workspace_id = $1", [extraWorkspace]);
    await pool.query("DELETE FROM users WHERE workspace_id = $1", [extraWorkspace]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [extraWorkspace]);

    const otherIdentity = (await pool.query<{ id: string }>(
      `INSERT INTO auth_identities (provider, provider_subject, display_name)
       VALUES ('internal_test', $1, 'other identity') RETURNING id`,
      [`other-${randomUUID()}`],
    )).rows[0]!.id;
    const otherUser = (await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, name)
       VALUES ($1, 'other actor') RETURNING id`,
      [workspaceA],
    )).rows[0]!.id;
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, identity_id, user_id, role)
       VALUES ($1, $2, $3, 'optimizer')`,
      [workspaceA, otherIdentity, otherUser],
    );
    await expect(repository.resolveApprovedAuthContext(tokenAHash, NOW)).resolves.toMatchObject({
      status: "rejected",
      reason: "PERSONAL_WORKSPACE_SHARED",
    });
    await pool.query("DELETE FROM workspace_memberships WHERE identity_id = $1", [otherIdentity]);
    await pool.query("DELETE FROM users WHERE id = $1", [otherUser]);
    await pool.query("DELETE FROM auth_identities WHERE id = $1", [otherIdentity]);
  });

  it("issues into the unique personal workspace and atomically rotates on team switch", async () => {
    const issuedHash = createHash("sha256").update(`issued-${randomUUID()}`).digest("hex");
    const issue = await repository.createSessionForIdentity({
      identityId,
      tokenHash: issuedHash,
      now: NOW,
      expiresAt: new Date("2026-08-25T10:00:00Z"),
    });
    expect(issue).toMatchObject({
      status: "approved",
      context: { workspaceId: workspaceA, workspaceKind: "personal" },
    });

    const switchedHash = createHash("sha256").update(`switched-${randomUUID()}`).digest("hex");
    const switched = await repository.switchSessionWorkspace({
      tokenHash: issuedHash,
      nextTokenHash: switchedHash,
      targetWorkspaceId: workspaceB,
      now: NOW,
    });
    expect(switched).toMatchObject({
      status: "approved",
      context: {
        workspaceId: workspaceB,
        workspaceKind: "team",
        scope: { kind: "team_workspace_readonly" },
      },
    });
    await expect(repository.resolveApprovedAuthContext(issuedHash, NOW)).resolves.toMatchObject({
      status: "rejected",
      reason: "SESSION_NOT_FOUND",
    });
    await expect(repository.resolveApprovedAuthContext(switchedHash, NOW)).resolves.toMatchObject({
      status: "approved",
      context: { workspaceId: workspaceB },
    });

    const staleSwitch = await repository.switchSessionWorkspace({
      tokenHash: issuedHash,
      nextTokenHash: createHash("sha256").update(`stale-${randomUUID()}`).digest("hex"),
      targetWorkspaceId: workspaceA,
      now: NOW,
    });
    expect(staleSwitch).toMatchObject({ status: "rejected", reason: "SESSION_NOT_FOUND" });
    await expect(repository.resolveApprovedAuthContext(switchedHash, NOW)).resolves.toMatchObject({
      status: "approved",
      context: { workspaceId: workspaceB },
    });
  });

  it("does not issue when the identity has duplicate active personal workspaces", async () => {
    const extraWorkspace = (await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name, kind) VALUES ($1, 'personal') RETURNING id",
      [`duplicate-personal-${randomUUID()}`],
    )).rows[0]!.id;
    const extraUser = (await pool.query<{ id: string }>(
      "INSERT INTO users (workspace_id, name) VALUES ($1, 'duplicate actor') RETURNING id",
      [extraWorkspace],
    )).rows[0]!.id;
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, identity_id, user_id, role)
       VALUES ($1, $2, $3, 'optimizer')`,
      [extraWorkspace, identityId, extraUser],
    );
    const tokenHash = createHash("sha256").update(`ambiguous-${randomUUID()}`).digest("hex");
    await expect(repository.createSessionForIdentity({
      identityId,
      tokenHash,
      now: NOW,
      expiresAt: new Date("2026-08-25T10:00:00Z"),
    })).resolves.toMatchObject({
      status: "rejected",
      reason: "PERSONAL_WORKSPACE_AMBIGUOUS",
    });
    await expect(repository.findSnapshotByTokenHash(tokenHash)).resolves.toBeNull();
    await pool.query("DELETE FROM workspace_memberships WHERE workspace_id = $1", [extraWorkspace]);
    await pool.query("DELETE FROM users WHERE workspace_id = $1", [extraWorkspace]);
    await pool.query("DELETE FROM workspaces WHERE id = $1", [extraWorkspace]);
  });

  it("rejects an inactive team membership without rotating the current session", async () => {
    await pool.query(
      `UPDATE workspace_memberships
       SET is_active = false
       WHERE workspace_id = $1 AND identity_id = $2`,
      [workspaceB, identityId],
    );
    const nextTokenHash = createHash("sha256").update(`inactive-${randomUUID()}`).digest("hex");
    await expect(repository.switchSessionWorkspace({
      tokenHash: tokenAHash,
      nextTokenHash,
      targetWorkspaceId: workspaceB,
      now: NOW,
    })).resolves.toMatchObject({ status: "rejected", reason: "MEMBERSHIP_MISSING" });
    await expect(repository.resolveApprovedAuthContext(tokenAHash, NOW)).resolves.toMatchObject({
      status: "approved",
      context: { workspaceId: workspaceA },
    });
    await expect(repository.findSnapshotByTokenHash(nextTokenHash)).resolves.toBeNull();
  });

  it.each([
    ["session", "SESSION_REVOKED"],
    ["membership", "MEMBERSHIP_INACTIVE"],
    ["identity", "IDENTITY_INACTIVE"],
    ["user", "USER_INACTIVE"],
  ])("fails closed after %s revocation", async (kind, reason) => {
    if (kind === "session") {
      await pool.query(
        "UPDATE auth_sessions SET revoked_at = '2026-08-25T07:30:00Z' WHERE token_hash = $1",
        [tokenAHash],
      );
    }
    if (kind === "membership") {
      await pool.query(
        "UPDATE workspace_memberships SET is_active = false WHERE workspace_id = $1 AND identity_id = $2",
        [workspaceA, identityId],
      );
    }
    if (kind === "identity") {
      await pool.query("UPDATE auth_identities SET is_active = false WHERE id = $1", [identityId]);
    }
    if (kind === "user") {
      await pool.query(
        "UPDATE users SET is_active = false WHERE workspace_id = $1 AND id = $2",
        [workspaceA, userA],
      );
    }
    await expect(repository.resolveApprovedAuthContext(tokenAHash, NOW)).resolves.toMatchObject({
      status: "rejected",
      reason,
    });
  });

  it("rejects an expired session and an expected-workspace mismatch", async () => {
    await pool.query(
      "UPDATE auth_sessions SET expires_at = '2026-08-25T08:00:00Z' WHERE token_hash = $1",
      [tokenAHash],
    );
    await expect(repository.resolveApprovedAuthContext(tokenAHash, NOW)).resolves.toMatchObject({
      status: "rejected",
      reason: "SESSION_EXPIRED",
    });
    await pool.query(
      "UPDATE auth_sessions SET expires_at = '2026-08-25T09:00:00Z' WHERE token_hash = $1",
      [tokenAHash],
    );
    await expect(repository.resolveApprovedAuthContext(tokenAHash, NOW, workspaceB)).resolves
      .toMatchObject({ status: "rejected", reason: "WORKSPACE_MISMATCH" });
  });

  it("does not expose token hash, provider subject, qihang identity or secret refs", async () => {
    const snapshot = await repository.findSnapshotByTokenHash(tokenAHash);
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain(tokenAHash);
    expect(serialized).not.toContain("private-subject");
    expect(serialized).not.toContain("private-qihang");
    expect(serialized).not.toContain("secret-ref");
    expect(serialized).not.toContain("ak-ref");
  });
});
