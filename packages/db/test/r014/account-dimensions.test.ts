import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { AccountNameParseRepository } from "../../src/r014/account-name-parse-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

/** R-017 T5：账户列表的十个归属维度，人工 > 昵称 > 平台。 */
describe("T5 account dimensions from the parse table (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new AccountNameParseRepository(pool);
  let workspaceId = "";
  let auth: { workspaceId: string; userId: string; role: "admin"; workspaceKind: "personal";
    scope: { kind: "explicit_accounts"; accounts: never[] } };

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`t5-${randomUUID()}`],
    )).rows[0].id;
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`t5-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'合成管理员','admin') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'admin',true)",
      [workspaceId, identityId, userId],
    );
    auth = { workspaceId, userId, role: "admin", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [] } };

    for (const accountId of ["t5-a1", "t5-a2"]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,$3)",
        [workspaceId, accountId, `快手-${accountId}`]);
    }
    await repository.putRule(auth, "KUAISHOU", {
      segments: [
        { key: "placement", label: "流量版位", order: 1, source: "free", required: false, multi: false, mapsTo: "placement" },
        { key: "bid", label: "出价模式", order: 2, source: "free", required: false, multi: false, mapsTo: "bid_mode" },
        { key: "opt", label: "优化师", order: 3, source: "free", required: false, multi: false, mapsTo: "optimizer" },
      ],
      separators: ["-"],
      effectiveFrom: "2026-09-01",
      note: null,
    });
    await pool.query(
      `INSERT INTO account_name_parses(workspace_id,media,account_id,account_name,rule_version,status,segments,task_ids)
       VALUES($1,'KUAISHOU','t5-a1','快手-t5-a1',1,'parsed',$2::jsonb,ARRAY[]::text[])`,
      [workspaceId, JSON.stringify({
        placement: { key: "placement", value: "优选", mapsTo: "placement", taskIds: [] },
        bid: { key: "bid", value: "单出价", mapsTo: "bid_mode", taskIds: [] },
        opt: { key: "opt", value: "李四", mapsTo: "optimizer", taskIds: [] },
      })],
    );
  });

  afterAll(async () => {
    for (const table of ["account_name_parses", "naming_rules", "accounts",
      "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.end();
  });

  const tuples = [{ media: "KUAISHOU", accountId: "t5-a1" }, { media: "KUAISHOU", accountId: "t5-a2" }];

  it("resolves parsed segments into the ten camelCase dimensions", async () => {
    const found = await repository.dimensionsFor(auth, tuples);
    const first = found.get("KUAISHOU:t5-a1");
    expect(first?.placement).toEqual({ value: "优选", source: "nickname" });
    expect(first?.bidMode).toEqual({ value: "单出价", source: "nickname" });
    expect(first?.optimizer).toEqual({ value: "李四", source: "nickname" });
    // 规范里没有的维度：两个字段都 null。平台侧现在**没有源**（accounts 表无维度列），
    // 所以不会出现 source:"platform"——不编来源。
    expect(first?.device).toEqual({ value: null, source: null });
    expect(first?.rebate.source).toBeNull();
  });

  it("leaves an account without a parse row out of the map entirely", async () => {
    const found = await repository.dimensionsFor(auth, tuples);
    // 没有解析行 ≠ 十个 null 的行：调用方拿不到键，自己填空 DTO，语义是「还没解析过」。
    expect(found.has("KUAISHOU:t5-a2")).toBe(false);
  });

  it("lets a manual override win over the nickname and marks it manual", async () => {
    await pool.query(
      "UPDATE account_name_parses SET override=$2::jsonb WHERE workspace_id=$1 AND account_id='t5-a1'",
      [workspaceId, JSON.stringify({ opt: "张三" })],
    );
    const first = (await repository.dimensionsFor(auth, tuples)).get("KUAISHOU:t5-a1");
    expect(first?.optimizer).toEqual({ value: "张三", source: "manual" });
    // 人工只改这一段，其余维度不受影响。
    expect(first?.placement).toEqual({ value: "优选", source: "nickname" });
  });

  it("returns all-null rather than half a shape when the stored segments are malformed", async () => {
    await pool.query(
      `INSERT INTO account_name_parses(workspace_id,media,account_id,account_name,rule_version,status,segments,task_ids)
       VALUES($1,'KUAISHOU','t5-a2','快手-t5-a2',1,'parsed',$2::jsonb,ARRAY[]::text[])`,
      [workspaceId, JSON.stringify({ placement: { value: "优选" } })],
    );
    // 库里的 JSONB 不是天生可信的：形状不对就当没解析过，不把半个对象塞进解析器。
    expect((await repository.dimensionsFor(auth, tuples)).has("KUAISHOU:t5-a2")).toBe(false);
  });
});
