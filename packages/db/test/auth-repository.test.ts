import { createHash, randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
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
      "INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id",
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

  it("resolves only the active workspace grants and keeps media-account tuples distinct", async () => {
    await expect(repository.resolveApprovedAuthContext(tokenAHash, NOW)).resolves.toEqual({
      status: "approved",
      context: {
        workspaceId: workspaceA,
        userId: userA,
        role: "admin",
        allowedAccounts: [
          { media: "KUAISHOU", accountId: "same-account", accessLevel: "read" },
          { media: "TENCENT", accountId: "same-account", accessLevel: "preview" },
        ],
      },
    });
    const workspaceBResult = await repository.resolveApprovedAuthContext(tokenBHash, NOW);
    expect(workspaceBResult).toMatchObject({
      status: "approved",
      context: {
        workspaceId: workspaceB,
        allowedAccounts: [{ media: "KUAISHOU", accountId: "same-account" }],
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
      context: { workspaceId: workspaceA, allowedAccounts: [] },
    });
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
