import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { AccountListRepository } from "../../src/account-list-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

describe("v1.5.1 ① account list additions (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new AccountListRepository(pool);
  let workspaceId = "";
  let userId = "";
  let workItemId = "";

  const query = (extra: Record<string, unknown> = {}) => ({
    workspaceId,
    requestingUserId: userId,
    businessDate: "2026-09-05",
    scopeKind: "explicit_accounts" as const,
    allowedAccounts: [
      { media: "KUAISHOU", accountId: "s6-a1" },
      { media: "KUAISHOU", accountId: "s6-a2" },
    ],
    page: 1,
    pageSize: 20,
    ...extra,
  });

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`r014-${randomUUID()}`],
    )).rows[0].id;
    userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      `INSERT INTO accounts(workspace_id,media,account_id,account_name,pool_status,pool_status_source,product_name,product_ref)
       VALUES ($1,'KUAISHOU','s6-a1','投放中的户','in_delivery','system','AAC 拉新包','prod-1'),
              ($1,'KUAISHOU','s6-a2','备用户','available','manual',NULL,NULL)`,
      [workspaceId],
    );
    await pool.query("UPDATE accounts SET pool_status_changed_at=now() WHERE workspace_id=$1 AND account_id='s6-a2'", [workspaceId]);
    workItemId = (await pool.query(
      `INSERT INTO work_items(workspace_id,type,severity,title,status,media,account_id)
       VALUES($1,'diagnosis','P1','成本超考核，建议降价 5%','open','KUAISHOU','s6-a1') RETURNING id`,
      [workspaceId],
    )).rows[0].id;
    // 已关闭的工作项不该成为「下一步建议」。
    await pool.query(
      `INSERT INTO work_items(workspace_id,type,severity,title,status,media,account_id)
       VALUES($1,'diagnosis','P2','早就处理完了','done','KUAISHOU','s6-a2')`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO external_changes(workspace_id,media,account_id,target_type,target_id,field,to_value)
       VALUES($1,'KUAISHOU','s6-a1','campaign','c-1','budget','10000'::jsonb)`,
      [workspaceId],
    );
  });

  afterAll(async () => {
    for (const table of ["external_changes", "work_items", "accounts", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.end();
  });

  it("carries the pool state, its source and the product binding", async () => {
    const rows = (await repository.list(query())).rows;
    const byId = Object.fromEntries(rows.map((row) => [row.accountId, row]));
    expect(byId["s6-a1"]).toMatchObject({
      poolStatus: "in_delivery", poolStatusSource: "system", productName: "AAC 拉新包", productRef: "prod-1",
    });
    expect(byId["s6-a2"]).toMatchObject({ poolStatus: "available", poolStatusSource: "manual", productName: null });
  });

  it("filters by multiple pool states and by product", async () => {
    expect((await repository.list(query({ poolStatus: ["available"] }))).rows.map((row) => row.accountId)).toEqual(["s6-a2"]);
    expect(new Set((await repository.list(query({ poolStatus: ["available", "in_delivery"] }))).rows.map((row) => row.accountId)))
      .toEqual(new Set(["s6-a1", "s6-a2"]));
    expect((await repository.list(query({ product: "AAC 拉新包" }))).rows.map((row) => row.accountId)).toEqual(["s6-a1"]);
    expect((await repository.list(query({ poolStatus: ["closed"] }))).rows).toEqual([]);
  });

  it("keeps the filtered count consistent with the returned page", async () => {
    const filtered = await repository.list(query({ poolStatus: ["available"] }));
    // count 与 page 走同一个 CTE：筛选只在 page 生效会让分页器显示错误的总数。
    expect(filtered.total).toBe(1);
    expect(filtered.rows).toHaveLength(1);
  });

  it("reports the latest real action and never invents one", async () => {
    const rows = (await repository.list(query())).rows;
    const byId = Object.fromEntries(rows.map((row) => [row.accountId, row]));
    expect(byId["s6-a1"]!.lastAction).toMatchObject({ kind: "external_change", summary: "campaign budget" });
    // s6-a2 只有人工置态，那也是一条真实动作。
    expect(byId["s6-a2"]!.lastAction).toMatchObject({ kind: "pool_status", summary: "available" });
  });

  it("suggests only an open work item, and nothing at all when there is none", async () => {
    const rows = (await repository.list(query())).rows;
    const byId = Object.fromEntries(rows.map((row) => [row.accountId, row]));
    expect(byId["s6-a1"]!.nextSuggestion).toEqual({ workItemId, title: "成本超考核，建议降价 5%" });
    // 只有一条 done 工作项的户，建议必须是 null——不拿已完成的事冒充下一步。
    expect(byId["s6-a2"]!.nextSuggestion).toBeNull();
  });
});
