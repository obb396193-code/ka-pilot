// Synthetic identities/accounts only; never run against an implicit shared database.
import { randomUUID } from "node:crypto";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { AccountMuteRepository } from "../src/account-mute-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined) throw new Error("Explicit TEST_DATABASE_URL required for synthetic account-mute tests");

describe("account mute PostgreSQL scope and authority", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 3000 });
  const repo = new AccountMuteRepository(pool);
  const ownedWorkspaces: string[] = [], ownedIdentities: string[] = [];
  let first: ApprovedWorkspaceAuthContext;
  let second: ApprovedWorkspaceAuthContext;
  let identityId: string;
  const input = { media: "KUAISHOU", accountId: "synthetic-account", mutedUntil: "2026-09-09", reasonChip: "合成测试" };

  async function seed(): Promise<{ auth: ApprovedWorkspaceAuthContext; identityId: string }> {
    const workspaceId = randomUUID(), userId = randomUUID(), identityId = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name,kind) VALUES($1,$2,'personal')", [workspaceId, `synthetic-mute-${workspaceId}`]);
    ownedWorkspaces.push(workspaceId);
    await pool.query("INSERT INTO users(id,workspace_id,name,role) VALUES($1,$2,'合成用户','optimizer')", [userId, workspaceId]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1::uuid,'internal_test',$1::text,'合成身份')", [identityId]);
    ownedIdentities.push(identityId);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'optimizer')", [workspaceId, identityId, userId]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2),($1,'TENCENT',$2)", [workspaceId, input.accountId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id) VALUES($1,$2,'KUAISHOU',$3),($1,$2,'TENCENT',$3)", [workspaceId, identityId, input.accountId]);
    return { identityId, auth: { workspaceId, userId, role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: ["KUAISHOU", "TENCENT"].map((media) => ({ media, accountId: input.accountId, accessLevel: "read" })) } } };
  }
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => {
    try {
      // Restrict teardown to IDs created by this suite, including partially seeded cases.
      for (const table of ["account_mutes", "account_access_grants", "workspace_memberships", "accounts", "users"] as const) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [ownedWorkspaces]);
      }
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [ownedWorkspaces]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [ownedIdentities]);
    } finally { await pool.end(); }
  });
  beforeEach(async () => {
    const a = await seed(); const b = await seed(); first = a.auth; second = b.auth; identityId = a.identityId;
  });
  it("isolates same account ID across media/workspaces and idempotently replays concurrent writes", async () => {
    await Promise.all([repo.set(first, input), repo.set(first, input)]);
    await repo.set(first, { ...input, media: "TENCENT", mutedUntil: "2026-09-10" });
    await repo.set(second, { ...input, mutedUntil: "2026-09-11" });
    expect(await repo.find(first, { media: "KUAISHOU", accountId: input.accountId })).toMatchObject({ workspaceId: first.workspaceId, mutedUntil: "2026-09-09", mutedBy: first.userId });
    expect(await repo.find(first, { media: "TENCENT", accountId: input.accountId })).toMatchObject({ workspaceId: first.workspaceId, mutedUntil: "2026-09-10" });
    expect(await repo.find(second, { media: "KUAISHOU", accountId: input.accountId })).toMatchObject({ workspaceId: second.workspaceId, mutedUntil: "2026-09-11", mutedBy: second.userId });
    const count = await pool.query("SELECT count(*)::int AS n FROM account_mutes WHERE workspace_id=$1", [first.workspaceId]);
    expect(count.rows[0]?.n).toBe(2);
  });
  it.each(["grant", "member", "actor", "identity", "workspace"])("stale approved context cannot write/read after %s revocation", async (kind) => {
    await repo.set(first, input);
    if (kind === "grant") await pool.query("DELETE FROM account_access_grants WHERE workspace_id=$1 AND identity_id=$2", [first.workspaceId, identityId]);
    if (kind === "member") await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [first.workspaceId]);
    if (kind === "actor") await pool.query("UPDATE users SET is_active=false WHERE workspace_id=$1", [first.workspaceId]);
    if (kind === "identity") await pool.query("UPDATE auth_identities SET is_active=false WHERE id=$1", [identityId]);
    if (kind === "workspace") await pool.query("UPDATE workspaces SET is_active=false WHERE id=$1", [first.workspaceId]);
    await expect(repo.set(first, { ...input, mutedUntil: "2026-09-12" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repo.find(first, { media: input.media, accountId: input.accountId })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const persisted = await pool.query("SELECT to_char(muted_until,'YYYY-MM-DD') AS until FROM account_mutes WHERE workspace_id=$1", [first.workspaceId]);
    expect(persisted.rows).toEqual([{ until: input.mutedUntil }]);
  });
  it("does not create a row from a forged cross-workspace actor or unknown account", async () => {
    await expect(repo.set({ ...first, userId: second.userId }, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const forged: ApprovedWorkspaceAuthContext = { ...first, workspaceKind: "personal", scope: { kind: "explicit_accounts",
      accounts: [{ media: "KUAISHOU", accountId: "not-in-db", accessLevel: "read" }] } };
    await expect(repo.set(forged, { ...input, accountId: "not-in-db" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await pool.query("SELECT * FROM account_mutes WHERE workspace_id=$1", [first.workspaceId])).rows).toEqual([]);
  });
  it("keeps created_at stable on replay and changes only explicit mute fields", async () => {
    const original = await repo.set(first, input);
    const replay = await repo.set(first, { ...input, mutedUntil: "2026-09-10", reasonChip: null });
    expect(replay.createdAt).toEqual(original.createdAt);
    expect(replay).toMatchObject({ mutedUntil: "2026-09-10", reasonChip: null, mutedBy: first.userId });
  });
});
