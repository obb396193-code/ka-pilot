// Synthetic identities/accounts only; never run against an implicit shared database.
import { randomUUID } from "node:crypto";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { AccountMuteRepository } from "../src/account-mute-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl === undefined) throw new Error("Explicit TEST_DATABASE_URL required for synthetic account-mute tests");
const database = new URL(databaseUrl);
if (!["127.0.0.1", "localhost"].includes(database.hostname) || database.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(database.pathname)) {
  throw new Error("Synthetic account-mute tests require an isolated local55432 ka_*_test database");
}

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
  async function item(context = first, media = "KUAISHOU", status = "open") {
    const id = randomUUID();
    await pool.query("INSERT INTO work_items(id,workspace_id,type,media,account_id,status,title) VALUES($1,$2,'diagnosis',$3,$4,$5,'synthetic mute test')",
      [id, context.workspaceId, media, input.accountId, status]);
    return id;
  }
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => {
    try {
      // Restrict teardown to IDs created by this suite, including partially seeded cases.
      for (const table of ["account_mutes", "work_items", "account_access_grants", "workspace_memberships", "accounts", "users"] as const) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [ownedWorkspaces]);
      }
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [ownedWorkspaces]);
      await pool.query("DELETE FROM auth_identities WHERE id=ANY($1::uuid[])", [ownedIdentities]);
    } finally { await pool.end(); }
  });
  beforeEach(async () => {
    const a = await seed(); const b = await seed(); first = a.auth; second = b.auth; identityId = a.identityId;
  });
  it("shared SQL scope keeps denied media metadata out of the command's first read", async () => {
    const workItemId = await item(first, "TENCENT"), observed: unknown[] = [];
    const guarded = new AccountMuteRepository(new Proxy(pool, { get(target, key) {
      if (key === "connect") return async () => {
        const client = await target.connect();
        return new Proxy(client, { get(connection, prop) {
          if (prop === "query") return async (sql: string, values?: unknown[]) => {
            const result = await connection.query(sql, values);
            if (sql.includes("FROM work_items")) observed.push(...result.rows);
            return result;
          };
          const value = Reflect.get(connection, prop); return typeof value === "function" ? value.bind(connection) : value;
        } });
      };
      return Reflect.get(target, key);
    } }));
    const scoped = { ...first, workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: input.accountId, accessLevel: "read" }] } } as ApprovedWorkspaceAuthContext;
    await expect(guarded.ignoreAndMute(scoped, { workItemId, mutedUntil: input.mutedUntil, reasonChip: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(observed.some(row => (row as { media?: string }).media === "TENCENT")).toBe(false);
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
  it("atomically ignores the locked work item and mutes only its actual tuple", async () => {
    const workItemId = await item();
    const result = await repo.ignoreAndMute(first, { workItemId, mutedUntil: input.mutedUntil, reasonChip: "known" });
    expect(result).toMatchObject({ workspaceId: first.workspaceId, media: "KUAISHOU", accountId: input.accountId, mutedBy: first.userId });
    const state = await pool.query("SELECT status,ignore_reason,muted_until,resolved_at IS NOT NULL AS resolved FROM work_items WHERE id=$1", [workItemId]);
    expect(state.rows).toEqual([{ status: "ignored", ignore_reason: "known", muted_until: null, resolved: true }]);
    expect(await repo.find(first, { media: "TENCENT", accountId: input.accountId })).toBeNull();
    expect(await repo.find(second, { media: "KUAISHOU", accountId: input.accountId })).toBeNull();
  });
  it("rolls back the ignored status when the account mute write fails", async () => {
    const workItemId = await item();
    // Isolated synthetic database only. Force the second write to fail after the
    // work-item UPDATE, then remove the temporary constraint even on assertion failure.
    await pool.query("ALTER TABLE account_mutes ADD CONSTRAINT synthetic_p131_failure CHECK (reason_chip <> 'synthetic-fail')");
    try {
      await expect(repo.ignoreAndMute(first, { workItemId, mutedUntil: input.mutedUntil, reasonChip: "synthetic-fail" })).rejects.toMatchObject({ code: "23514" });
      expect((await pool.query("SELECT status,ignore_reason,resolved_at FROM work_items WHERE id=$1", [workItemId])).rows)
        .toEqual([{ status: "open", ignore_reason: null, resolved_at: null }]);
      expect((await pool.query("SELECT * FROM account_mutes WHERE workspace_id=$1", [first.workspaceId])).rows).toEqual([]);
    } finally { await pool.query("ALTER TABLE account_mutes DROP CONSTRAINT synthetic_p131_failure"); }
  });
  it("concurrent ignore attempts commit only one pair of writes", async () => {
    const workItemId = await item();
    const args = { workItemId, mutedUntil: input.mutedUntil, reasonChip: "known" };
    const results = await Promise.allSettled([repo.ignoreAndMute(first, args), repo.ignoreAndMute(first, args)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find(r => r.status === "rejected")).toMatchObject({ reason: { code: "INVALID_STATE" } });
    expect((await pool.query("SELECT count(*)::int AS n FROM account_mutes WHERE workspace_id=$1", [first.workspaceId])).rows).toEqual([{ n: 1 }]);
  });
  it("cannot mute another workspace or ungranted media through a work-item ID", async () => {
    const foreign = await item(second), otherMedia = await item(first, "TENCENT");
    const own: ApprovedWorkspaceAuthContext = { ...first, workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: input.accountId, accessLevel: "read" }] } };
    await expect(repo.ignoreAndMute(own, { workItemId: foreign, mutedUntil: input.mutedUntil, reasonChip: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(repo.ignoreAndMute(own, { workItemId: otherMedia, mutedUntil: input.mutedUntil, reasonChip: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await pool.query("SELECT status FROM work_items WHERE id=ANY($1::uuid[])", [[foreign, otherMedia]])).rows).toEqual([{ status: "open" }, { status: "open" }]);
  });
  it("a live grant revocation rolls back before changing the work item", async () => {
    const workItemId = await item();
    await pool.query("DELETE FROM account_access_grants WHERE workspace_id=$1 AND identity_id=$2", [first.workspaceId, identityId]);
    await expect(repo.ignoreAndMute(first, { workItemId, mutedUntil: input.mutedUntil, reasonChip: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await pool.query("SELECT status FROM work_items WHERE id=$1", [workItemId])).rows).toEqual([{ status: "open" }]);
  });
});
