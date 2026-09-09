import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "@ka/db";
import { findR014Route, registerR014Routes } from "../../src/r014/routes.js";
import { createTransferRoutes } from "../../src/r014/transfer-routes.js";
import { callRoute, type Captured } from "./fake-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface Person { userId: string; identityId: string }
interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer" | "admin"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "read" }[] };
}

describe("A7 account transfer routes (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let workspaceId = "";
  let alice: Person;
  let bob: Person;
  let admin: Person;
  let auth: AuthContext;
  const ACCOUNTS = ["a7-a1", "a7-a2"] as const;

  const dataOf = (result: Captured): Record<string, unknown> =>
    (result.body as { data: Record<string, unknown> }).data;

  async function makePerson(name: string, role: string): Promise<Person> {
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`a7-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,$2,$3) RETURNING id", [workspaceId, name, role],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,$4,true)",
      [workspaceId, identityId, userId, role],
    );
    return { userId, identityId };
  }

  /** 把两个户的有效授权重置回 alice，供每条用例从同一起点开始。 */
  async function resetGrants(): Promise<void> {
    await pool.query("DELETE FROM account_access_grants WHERE workspace_id=$1", [workspaceId]);
    for (const accountId of ACCOUNTS) {
      await pool.query(
        "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU',$3,'execute')",
        [workspaceId, alice.identityId, accountId],
      );
    }
    await pool.query("DELETE FROM changesets WHERE workspace_id=$1", [workspaceId]);
    await pool.query("UPDATE work_items SET assignee=$2 WHERE workspace_id=$1", [workspaceId, alice.userId]);
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    registerR014Routes(createTransferRoutes(pool));
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`a7-${randomUUID()}`],
    )).rows[0].id;
    alice = await makePerson("交出方", "optimizer");
    bob = await makePerson("接收方", "optimizer");
    admin = await makePerson("管理员", "admin");
    for (const accountId of ACCOUNTS) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2)", [workspaceId, accountId]);
    }
    await pool.query(
      `INSERT INTO work_items(workspace_id,type,severity,title,status,media,account_id,assignee)
       VALUES($1,'diagnosis','P1','待处理','open','KUAISHOU',$2,$3)`,
      [workspaceId, ACCOUNTS[0], alice.userId],
    );
    auth = {
      workspaceId, userId: alice.userId, role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: ACCOUNTS.map((accountId) => ({ media: "KUAISHOU", accountId, accessLevel: "read" as const })) },
    };
  });

  beforeEach(resetGrants);

  afterAll(async () => {
    for (const table of ["outbound_messages", "account_transfers", "changesets", "work_items",
      "account_access_grants", "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'a7-%'");
    await pool.end();
  });

  const transfer = (body: unknown, context: AuthContext = auth): Promise<Captured> =>
    callRoute(context, "/api/v1/accounts/transfer", "POST", body);

  it("claims both transfer paths", () => {
    expect(findR014Route("/api/v1/accounts/transfer")).not.toBeNull();
    expect(findR014Route(`/api/v1/users/${alice.userId}/transfer-all`)).not.toBeNull();
    expect(findR014Route("/api/v1/users/not-a-uuid/transfer-all")).toBeNull();
  });

  it("moves the grant and revokes the old one without deleting the audit row", async () => {
    const result = await transfer({
      items: [{ media: "KUAISHOU", account_id: ACCOUNTS[0] }],
      to_user_id: bob.userId,
      include: { work_items: true, dispatches: true, starred: true },
      note: "交接给同事",
    });
    expect(result.status).toBe(200);
    expect(dataOf(result).moved).toEqual({ accounts: 1, workItems: 1, dispatches: 0 });

    const grants = (await pool.query(
      `SELECT identity_id, revoked_at IS NULL AS active FROM account_access_grants
       WHERE workspace_id=$1 AND account_id=$2 ORDER BY active`,
      [workspaceId, ACCOUNTS[0]],
    )).rows as { identity_id: string; active: boolean }[];
    // 旧行保留且被置为已撤销，新行归接收方——删行会让「以前归谁」永久消失。
    expect(grants).toHaveLength(2);
    expect(grants.find((row) => !row.active)!.identity_id).toBe(alice.identityId);
    expect(grants.find((row) => row.active)!.identity_id).toBe(bob.identityId);
  });

  it("hands the open work items to the receiver", async () => {
    await transfer({
      items: [{ media: "KUAISHOU", account_id: ACCOUNTS[0] }],
      to_user_id: bob.userId,
      include: { work_items: true, dispatches: false, starred: false },
    });
    const assignee = (await pool.query(
      "SELECT assignee FROM work_items WHERE workspace_id=$1 AND account_id=$2", [workspaceId, ACCOUNTS[0]],
    )).rows[0].assignee;
    expect(assignee).toBe(bob.userId);
  });

  it("reports dispatches as zero because that table is not deployed yet", async () => {
    const result = await transfer({
      items: [{ media: "KUAISHOU", account_id: ACCOUNTS[1] }],
      to_user_id: bob.userId,
      include: { work_items: false, dispatches: true, starred: false },
    });
    // dispatches 表要 migration 014：表不在 = 系统里根本没有派发单，计数确实是 0。
    expect((dataOf(result).moved as Record<string, number>).dispatches).toBe(0);
  });

  it("refuses to transfer an account that has a changeset mid-flight", async () => {
    await pool.query(
      `INSERT INTO changesets(workspace_id,media,account_id,initiator,credential_owner_user_id,status)
       VALUES($1,'KUAISHOU',$2,$3,$3,'executing')`,
      [workspaceId, ACCOUNTS[0], alice.userId],
    );
    const blocked = await transfer({
      items: [{ media: "KUAISHOU", account_id: ACCOUNTS[0] }],
      to_user_id: bob.userId,
      include: { work_items: true, dispatches: false, starred: false },
    });
    expect(blocked.status).toBe(409);
    expect(JSON.stringify(blocked.body)).toContain("TRANSFER_BLOCKED_BY_CHANGESET");
    // 授权必须原封不动——执行到一半换人会让「谁发起、谁负责」对不上。
    expect((await pool.query(
      "SELECT count(*)::int AS n FROM account_access_grants WHERE workspace_id=$1 AND account_id=$2 AND revoked_at IS NULL",
      [workspaceId, ACCOUNTS[0]],
    )).rows[0].n).toBe(1);
  });

  it("moves the unblocked accounts and lists the blocked one instead of failing the batch", async () => {
    await pool.query(
      `INSERT INTO changesets(workspace_id,media,account_id,initiator,credential_owner_user_id,status)
       VALUES($1,'KUAISHOU',$2,$3,$3,'confirmed')`,
      [workspaceId, ACCOUNTS[0], alice.userId],
    );
    const result = await transfer({
      items: ACCOUNTS.map((accountId) => ({ media: "KUAISHOU", account_id: accountId })),
      to_user_id: bob.userId,
      include: { work_items: false, dispatches: false, starred: false },
    });
    // 部分成功不该被当成整批失败：交接了一户，被挡的那户逐条列出来。
    expect(result.status).toBe(200);
    expect((dataOf(result).moved as Record<string, number>).accounts).toBe(1);
    expect(dataOf(result).skipped).toEqual([
      { media: "KUAISHOU", accountId: ACCOUNTS[0], reason: "blocked_by_changeset" },
    ]);
  });

  it("reports an ungranted account as skipped rather than pretending it moved", async () => {
    await pool.query(
      "UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1 AND account_id=$2",
      [workspaceId, ACCOUNTS[1]],
    );
    const result = await transfer({
      items: [{ media: "KUAISHOU", account_id: ACCOUNTS[1] }],
      to_user_id: bob.userId,
      include: { work_items: false, dispatches: false, starred: false },
    });
    expect((dataOf(result).moved as Record<string, number>).accounts).toBe(0);
    expect(dataOf(result).skipped).toEqual([
      { media: "KUAISHOU", accountId: ACCOUNTS[1], reason: "not_granted" },
    ]);
  });

  it("queues one inbox notification for each side", async () => {
    const result = await transfer({
      items: [{ media: "KUAISHOU", account_id: ACCOUNTS[0] }],
      to_user_id: bob.userId,
      include: { work_items: false, dispatches: false, starred: false },
    });
    expect(dataOf(result).notifiedUserIds).toEqual([alice.userId, bob.userId]);
    const messages = (await pool.query(
      "SELECT target FROM outbound_messages WHERE workspace_id=$1 AND kind='account_transfer' ORDER BY target",
      [workspaceId],
    )).rows as { target: string }[];
    expect(new Set(messages.map((row) => row.target))).toEqual(new Set([alice.userId, bob.userId]));
  });

  it("refuses a receiver outside the workspace and refuses transferring to yourself", async () => {
    const outsider = await transfer({
      items: [{ media: "KUAISHOU", account_id: ACCOUNTS[0] }],
      to_user_id: randomUUID(),
      include: { work_items: false, dispatches: false, starred: false },
    });
    expect(outsider.status).toBe(403);
    const self = await transfer({
      items: [{ media: "KUAISHOU", account_id: ACCOUNTS[0] }],
      to_user_id: alice.userId,
      include: { work_items: false, dispatches: false, starred: false },
    });
    expect(self.status).toBe(400);
  });

  it("lets an admin hand over everything a departing member still holds", async () => {
    const result = await callRoute(
      { ...auth, userId: admin.userId, role: "admin" },
      `/api/v1/users/${alice.userId}/transfer-all`, "POST", { to_user_id: bob.userId, note: "离职交接" },
    );
    expect(result.status).toBe(200);
    expect((dataOf(result).moved as Record<string, number>).accounts).toBe(2);
    // 撤的是离职者的授权，不是管理员自己的。
    expect((await pool.query(
      `SELECT count(*)::int AS n FROM account_access_grants
       WHERE workspace_id=$1 AND identity_id=$2 AND revoked_at IS NULL`,
      [workspaceId, alice.identityId],
    )).rows[0].n).toBe(0);
  });

  it("refuses transfer-all from a non-admin", async () => {
    const result = await callRoute(
      auth, `/api/v1/users/${alice.userId}/transfer-all`, "POST", { to_user_id: bob.userId },
    );
    expect(result.status).toBe(403);
  });
});
