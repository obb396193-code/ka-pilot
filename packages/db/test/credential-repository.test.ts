import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { CredentialRepository } from "../src/credential-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("CredentialRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new CredentialRepository(pool);
  let workspaceId: string;
  let ownerId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM accounts");
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
