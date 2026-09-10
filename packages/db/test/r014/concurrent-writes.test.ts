import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { AccountTransferRepository } from "../../src/r014/account-transfer-repository.js";
import { KbRepository } from "../../src/r014/kb-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database.
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be_be2check_test";

/**
 * 并发写。这一类此前没测过，而失败模式都很难看：
 * 两个人同时改同一篇文档 → 一次修订被**静默吞掉**；
 * 同一个户被两处同时交接 → 账户**搬两次**、审计里出现两条互相矛盾的交接记录。
 * 两条路径分别靠行锁 + 唯一约束、和「撤权 UPDATE 只会命中一次」来收敛，这里把它钉住。
 */
describe("concurrent writes converge instead of losing or duplicating work (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  const kb = new KbRepository(pool);
  const transfers = new AccountTransferRepository(pool);
  let workspaceId = "";
  let documentId = "";
  const identities: string[] = [];
  let alice = { userId: "", identityId: "" };
  let bob = { userId: "", identityId: "" };
  let auth: never;

  async function makePerson(name: string, role: string): Promise<{ userId: string; identityId: string }> {
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`cw-${randomUUID()}`],
    )).rows[0].id;
    identities.push(identityId);
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,$2,$3) RETURNING id", [workspaceId, name, role],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,$4,true)",
      [workspaceId, identityId, userId, role]);
    return { userId, identityId };
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`cw-${randomUUID()}`],
    )).rows[0].id;
    alice = await makePerson("甲", "admin");
    bob = await makePerson("乙", "optimizer");
    auth = {
      workspaceId, userId: alice.userId, role: "admin", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [] },
    } as never;

    const created = await kb.create(auth, {
      title: "并发编辑的文档", kind: "manual", visibility: "workspace",
    });
    documentId = created.id;

    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','cw-a1')", [workspaceId]);
    await pool.query(
      "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU','cw-a1','execute')",
      [workspaceId, alice.identityId]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM kb_business_refs WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM kb_links WHERE workspace_id=$1", [workspaceId]);
    await pool.query(
      "DELETE FROM kb_revisions WHERE document_id IN (SELECT id FROM kb_documents WHERE workspace_id=$1)", [workspaceId]);
    for (const table of ["kb_documents", "outbound_messages", "account_transfers", "account_access_grants",
      "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id = ANY($1::uuid[])", [identities]);
    await pool.end();
  });

  it("keeps every concurrent kb edit as its own revision, none silently dropped", async () => {
    const edits = 5;
    const results = await Promise.allSettled(Array.from({ length: edits }, (_, index) =>
      kb.patch(auth, documentId, {
        contentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: `第 ${index} 次` }] }] },
      })));
    const ok = results.filter((result) => result.status === "fulfilled");
    // 一次都不许静默吞：要么写成一条修订，要么明确失败让调用方重试。
    expect(ok.length).toBe(edits);

    const revisions = (await pool.query(
      "SELECT revision FROM kb_revisions WHERE document_id=$1 ORDER BY revision", [documentId],
    )).rows.map((row) => Number((row as { revision: unknown }).revision));
    // 版本号连续无重复：撞号会被 (document_id, revision) 唯一约束挡下，不会互相覆盖。
    expect(new Set(revisions).size).toBe(revisions.length);
    expect(revisions).toEqual(revisions.map((_, index) => index + 1));
    // 建文档时那一条 + 五次编辑。
    expect(revisions.length).toBe(edits + 1);
  });

  it("moves an account exactly once when two transfers race for it", async () => {
    const request = {
      items: [{ media: "KUAISHOU", accountId: "cw-a1" }],
      toUserId: bob.userId,
      include: { workItems: false, dispatches: false, starred: false },
      note: null,
    };
    const results = await Promise.allSettled([
      transfers.transfer(auth, request),
      transfers.transfer(auth, request),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled")
      .map((result) => (result as PromiseFulfilledResult<{ moved: { accounts: number } }>).value);

    // 两次都不该抛：一次真搬、另一次如实回「没有有效授权」，而不是搬两遍。
    expect(fulfilled.length).toBe(2);
    const movedTotal = fulfilled.reduce((total, value) => total + value.moved.accounts, 0);
    expect(movedTotal, "同一个户只能被搬走一次").toBe(1);

    const grants = (await pool.query(
      `SELECT identity_id, revoked_at FROM account_access_grants
       WHERE workspace_id=$1 AND account_id='cw-a1' ORDER BY revoked_at NULLS FIRST`, [workspaceId],
    )).rows as { identity_id: string; revoked_at: Date | null }[];
    // 有效授权只剩接手人一条；原授权行留着且已置位（软撤权，审计要查得到）。
    const live = grants.filter((row) => row.revoked_at === null);
    expect(live).toHaveLength(1);
    expect(live[0]!.identity_id).toBe(bob.identityId);

    // 审计行两次都写（「有人试过」是值得留痕的），但只有一条真搬了东西——
    // 另一条 moved.accounts=0、items 为空，不谎称搬过。
    const audits = (await pool.query(
      "SELECT moved, items FROM account_transfers WHERE workspace_id=$1", [workspaceId],
    )).rows as { moved: { accounts: number }; items: unknown[] }[];
    expect(audits).toHaveLength(2);
    expect(audits.filter((row) => row.moved.accounts === 1)).toHaveLength(1);
    expect(audits.filter((row) => row.moved.accounts === 0 && row.items.length === 0)).toHaveLength(1);

    // ★没搬成的那次**不该给任何人发通知**——那是通知一件没发生的事。
    const notified = Number((await pool.query(
      "SELECT count(*)::int AS n FROM outbound_messages WHERE workspace_id=$1 AND kind='account_transfer'",
      [workspaceId])).rows[0].n);
    expect(notified, "只有真搬那次通知双方，共 2 条").toBe(2);
  });
});
