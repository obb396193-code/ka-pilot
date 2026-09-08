import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { searchResultSchema } from "@ka/domain";
import { runMigrations } from "../../src/migrate.js";
import { SearchRepository } from "../../src/r014/search-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "read" }[] };
}

describe("R-014 search repository (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const search = new SearchRepository(pool);
  const workspaces: string[] = [];
  let actor: AuthContext;
  let other: AuthContext;

  async function makeWorkspace(prefix: string, slug: string): Promise<AuthContext> {
    const workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`r014-${randomUUID()}`],
    )).rows[0].id;
    workspaces.push(workspaceId);
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`r014-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identityId, userId],
    );
    await pool.query(
      "INSERT INTO accounts(workspace_id,media,account_id,account_name,lifecycle_stage,product_name) VALUES($1,'KUAISHOU',$2,$3,'stable','AAC 拉新包')",
      [workspaceId, `${slug}-acc-1`, `${prefix}拉新_快手_01`],
    );
    await pool.query(
      "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU',$3,'read')",
      [workspaceId, identityId, `${slug}-acc-1`],
    );
    // 同空间但未授权的一户：搜索不该看见它。
    await pool.query(
      "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)",
      [workspaceId, `${slug}-acc-hidden`, `${prefix}拉新_快手_未授权`],
    );
    await pool.query(
      "INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,$2,$3)",
      [workspaceId, `${slug}-task-1`, `${prefix}拉新`],
    );
    await pool.query(
      `INSERT INTO work_items(workspace_id,type,severity,title,status,media,account_id)
       VALUES($1,'diagnosis','P1',$2,'open','KUAISHOU',$3)`,
      [workspaceId, `${prefix}成本超考核`, `${slug}-acc-1`],
    );
    return {
      workspaceId, userId, role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: `${slug}-acc-1`, accessLevel: "read" }] },
    };
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    actor = await makeWorkspace("阿尔法", "alfa");
    other = await makeWorkspace("贝塔", "beta");
  });

  afterAll(async () => {
    for (const workspaceId of workspaces) {
      for (const table of ["work_items", "tasks", "account_access_grants", "accounts"]) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
      }
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r014-%'");
    await pool.end();
  });

  it("finds accounts, tasks and work items in the frozen type order", async () => {
    const outcome = await search.search(actor, "阿尔法");
    expect(() => searchResultSchema.parse({ items: outcome.items })).not.toThrow();
    expect(outcome.items.map((item) => item.type)).toEqual(["account", "task", "work_item"]);
    expect(outcome.items[0]).toMatchObject({
      id: "KUAISHOU:alfa-acc-1",
      title: "阿尔法拉新_快手_01",
      href: "/accounts/KUAISHOU/alfa-acc-1",
      workspaceKind: "personal",
      // v1.9 ⑦：后端只出机器字段，不出拼好的中文 subtitle。
      meta: { status: "stable", taskName: "AAC 拉新包" },
    });
    expect(outcome.items[0]).not.toHaveProperty("subtitle");
    expect(outcome.items[2]!.href).toBe(`/work-items/${outcome.items[2]!.id}`);
  });

  it("hides accounts the caller has no grant for", async () => {
    const outcome = await search.search(actor, "未授权", "account");
    expect(outcome.items).toEqual([]);
  });

  it("never crosses workspaces", async () => {
    expect((await search.search(other, "阿尔法")).items).toEqual([]);
    expect((await search.search(actor, "贝塔")).items).toEqual([]);
  });

  it("names material and document as unavailable instead of returning an empty result", async () => {
    const outcome = await search.search(actor, "阿尔法");
    expect(outcome.unavailable).toEqual(["material", "document"]);
    const scoped = await search.search(actor, "阿尔法", "material");
    expect(scoped.items).toEqual([]);
    expect(scoped.unavailable).toEqual(["material"]);
  });

  it("filters to a single type when asked and rejects an unknown one", async () => {
    const tasks = await search.search(actor, "阿尔法", "task");
    expect(tasks.items.map((item) => item.type)).toEqual(["task"]);
    expect(tasks.items[0]!.meta).toEqual({ stage: "preparing", accountCount: 0 });
    await expect(search.search(actor, "阿尔法", "campaign")).rejects.toThrow(/invalid_input/);
  });

  it("refuses an empty query and treats a literal percent as text", async () => {
    await expect(search.search(actor, "   ")).rejects.toThrow(/invalid_input/);
    expect((await search.search(actor, "%")).items).toEqual([]);
  });
});
