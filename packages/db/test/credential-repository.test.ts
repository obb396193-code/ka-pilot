import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { CredentialRepository } from "../src/credential-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(target.pathname)) throw new Error("Dedicated local test database required");

describe("CredentialRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new CredentialRepository(pool);
  let workspaceId: string;
  let ownerId: string;
  const identities: string[] = [];

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('credential-test') RETURNING id",
    );
    workspaceId = workspace.rows[0]!.id;
    const owner = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, name, qihang_user_id)
       VALUES ($1, 'owner', 'qihang-owner') RETURNING id`,
      [workspaceId],
    );
    ownerId = owner.rows[0]!.id;
  });

  afterEach(async () => {
    await pool.query("DELETE FROM account_access_grants WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM accounts WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [identities]);
    identities.length = 0;
  });
  afterAll(async () => { await pool.end(); });

  it("resolves a Qihang identity only inside its workspace", async () => {
    await expect(repository.resolveQihangUserId(workspaceId, ownerId)).resolves.toBe(
      "qihang-owner",
    );
    await expect(
      repository.resolveQihangUserId("99999999-9999-4999-8999-999999999999", ownerId),
    ).resolves.toBeNull();
  });

  it("does not resolve a Qihang identity for an inactive user", async () => {
    await pool.query("UPDATE users SET is_active = false WHERE id = $1", [ownerId]);

    await expect(repository.resolveQihangUserId(workspaceId, ownerId)).resolves.toBeNull();
  });

  it("keeps IdeaLab secret references workspace-scoped and unavailable for inactive owners", async () => {
    expect(await repository.resolveIdeaLabSecretRef(workspaceId, ownerId)).toBeNull();
    await pool.query("UPDATE users SET idealab_ak_ref='synthetic-secret-reference' WHERE id=$1", [ownerId]);
    expect(await repository.resolveIdeaLabSecretRef(workspaceId, ownerId)).toBe("synthetic-secret-reference");
    expect(await repository.resolveIdeaLabSecretRef("99999999-9999-4999-8999-999999999999", ownerId)).toBeNull();
    await pool.query("UPDATE users SET is_active=false WHERE id=$1", [ownerId]);
    expect(await repository.resolveIdeaLabSecretRef(workspaceId, ownerId)).toBeNull();
  });

  it("rejects ambiguous or missing requested account ownership", async () => {
    await expect(repository.resolveAccountOwner(workspaceId, [])).rejects.toThrow("at least one");
    await expect(repository.resolveAccountOwner(workspaceId, [{ media: "", accountId: "same" }])).rejects.toThrow("media and accountId");
    await expect(repository.resolveAccountOwner(workspaceId, [{ media: "KUAISHOU", accountId: "same" }, { media: "KUAISHOU", accountId: "same" }])).rejects.toThrow("duplicate");
    await expect(repository.resolveAccountOwner(workspaceId, [{ media: "KUAISHOU", accountId: "absent" }])).rejects.toThrow("requested workspace");
  });

  it("revalidates the frozen identity membership for scheduled retries", async () => {
    const identity = await pool.query<{ id: string }>(
      `INSERT INTO auth_identities (provider, provider_subject, display_name)
       VALUES ('internal_test', gen_random_uuid()::text, 'scheduled owner') RETURNING id`,
    );
    const identityId = identity.rows[0]!.id;
    identities.push(identityId);
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, identity_id, user_id, role)
       VALUES ($1, $2, $3, 'optimizer')`,
      [workspaceId, identityId, ownerId],
    );
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','scheduled')", [workspaceId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) VALUES($1,$2,'KUAISHOU','scheduled')", [workspaceId, identityId]);
    const accounts = [{ media: "KUAISHOU", accountId: "scheduled" }];

    await expect(
      repository.resolveScheduledQihangUserId(workspaceId, ownerId, identityId, accounts),
    ).resolves.toBe("qihang-owner");
    await expect(
      repository.resolveScheduledQihangUserId(
        "99999999-9999-4999-8999-999999999999",
        ownerId,
        identityId,
        accounts,
      ),
    ).resolves.toBeNull();

    await pool.query(
      "UPDATE workspace_memberships SET is_active = false WHERE workspace_id = $1 AND identity_id = $2",
      [workspaceId, identityId],
    );
    await expect(
      repository.resolveScheduledQihangUserId(workspaceId, ownerId, identityId, accounts),
    ).resolves.toBeNull();
  });

  it("selects the common account owner and rejects ambiguous scopes", async () => {
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id, owner_user_id)
       VALUES ($1, 'KUAISHOU', 'a-1', $2), ($1, 'KUAISHOU', 'a-2', $2),
              ($1, 'KUAISHOU', 'a-3', NULL)`,
      [workspaceId, ownerId],
    );
    await expect(
      repository.resolveAccountOwner(workspaceId, [
        { media: "KUAISHOU", accountId: "a-1" },
        { media: "KUAISHOU", accountId: "a-2" },
      ]),
    ).resolves.toBe(ownerId);
    await expect(
      repository.resolveAccountOwner(workspaceId, [
        { media: "KUAISHOU", accountId: "a-1" },
        { media: "KUAISHOU", accountId: "a-3" },
      ]),
    ).rejects.toThrow("unambiguous credential owner");
  });
});
