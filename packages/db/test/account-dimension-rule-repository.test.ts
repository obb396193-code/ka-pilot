import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { withSemanticReadSnapshot } from "../src/semantic-read-snapshot.js";
import { AccountDimensionRuleRepository } from "../src/account-dimension-rule-repository.js";

describe("scoped historical naming rules / synthetic PG", () => {
  const ws = randomUUID(), other = randomUUID(); let pool: Pool;
  const scope = { workspaceId: ws, accounts: [{ media: "KUAISHOU", accountId: "a" }] };
  const load = (value: unknown = scope) => withSemanticReadSnapshot(pool, c => new AccountDimensionRuleRepository(c).load(value));
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl });
    for (const workspaceId of [ws, other]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic rules')", [workspaceId]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,$2,'a','synthetic')", [workspaceId, media]);
        await pool.query("INSERT INTO account_name_parses(workspace_id,media,account_id,account_name,rule_version,status) VALUES($1,$2,'a','synthetic',1,'parsed')", [workspaceId, media]);
        for (const version of [1, 2]) await pool.query(`INSERT INTO naming_rules(workspace_id,media,version,segments,effective_from)
          VALUES($1,$2,$3,$4::jsonb,'2026-09-01')`, [workspaceId, media, version, JSON.stringify([
          { key: "owner", mapsTo: version === 1 && workspaceId === ws && media === "KUAISHOU" ? "optimizer" : "goal", pending: false },
          { key: "unknown_1", mapsTo: null, pending: true },
        ])]);
      }
    }
  }, 30000);
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_name_parses", "naming_rules", "accounts", "workspaces"]) await pool.query(
      `DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[ws, other]]);
    await pool.end();
  });
  it("uses exact parse version and all three account keys, never newest rule", async () => {
    expect(await load()).toEqual([{ workspaceId: ws, media: "KUAISHOU", accountId: "a", ruleVersion: 1, mappings: [
      { key: "owner", mapsTo: "optimizer", pending: false }, { key: "unknown_1", mapsTo: null, pending: true },
    ] }]);
    expect((await load({ ...scope, accounts: [{ media: "TENCENT", accountId: "a" }] }))[0]?.mappings?.[0]?.mapsTo).toBe("goal");
    expect((await load({ ...scope, workspaceId: other }))[0]?.mappings?.[0]?.mapsTo).toBe("goal");
  });
  it("empty scope no IO; nonexistent accounts absent, missing historical rule explicit null", async () => {
    expect(await new AccountDimensionRuleRepository({ query: async () => { throw new Error("must not query"); } }).load({ ...scope, accounts: [] })).toEqual([]);
    expect(await load({ ...scope, accounts: [{ media: "KUAISHOU", accountId: "missing" }] })).toEqual([]);
    await pool.query("UPDATE account_name_parses SET rule_version=9 WHERE workspace_id=$1 AND media='KUAISHOU'", [ws]);
    try { expect((await load())[0]).toMatchObject({ ruleVersion: 9, mappings: null }); }
    finally { await pool.query("UPDATE account_name_parses SET rule_version=1 WHERE workspace_id=$1 AND media='KUAISHOU'", [ws]); }
  });
  it("same RR snapshot remains stable through concurrent rule changes", async () => {
    await withSemanticReadSnapshot(pool, async connection => {
      const reader = new AccountDimensionRuleRepository(connection), before = await reader.load(scope);
      await pool.query("UPDATE naming_rules SET segments='[{\"key\":\"new\",\"mapsTo\":\"goal\"}]'::jsonb WHERE workspace_id=$1 AND media='KUAISHOU' AND version=1", [ws]);
      expect(await reader.load(scope)).toEqual(before);
    });
    expect((await load())[0]?.mappings?.[0]?.key).toBe("new");
  });
  it("bounds rule bytes in SQL before transport, including combined rows", async () => {
    await pool.query("UPDATE naming_rules SET segments=jsonb_build_array(jsonb_build_object('key',repeat('x',16777216))) WHERE workspace_id=$1 AND media='KUAISHOU' AND version=1", [ws]);
    await expect(load()).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU','b','synthetic')", [ws]);
    await pool.query("INSERT INTO account_name_parses(workspace_id,media,account_id,account_name,rule_version,status) VALUES($1,'KUAISHOU','b','synthetic',1,'parsed')", [ws]);
    try {
      await pool.query("UPDATE naming_rules SET segments=jsonb_build_array(jsonb_build_object('key',repeat('x',9000000))) WHERE workspace_id=$1 AND media='KUAISHOU' AND version=1", [ws]);
      await expect(load({ ...scope, accounts: [...scope.accounts, { media: "KUAISHOU", accountId: "b" }] })).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    } finally {
      await pool.query("DELETE FROM account_name_parses WHERE workspace_id=$1 AND account_id='b'", [ws]);
      await pool.query("DELETE FROM accounts WHERE workspace_id=$1 AND account_id='b'", [ws]);
      await pool.query("UPDATE naming_rules SET segments='[]' WHERE workspace_id=$1 AND media='KUAISHOU' AND version=1", [ws]);
    }
  }, 30000);
  it.each([{}, [{ key: "bad", pending: "false" }], [{ key: "a", mapsTo: "goal" }, { key: "a", mapsTo: "goal" }]])("present-invalid rules fail closed: %j", async segments => {
    await pool.query("UPDATE naming_rules SET segments=$2::jsonb WHERE workspace_id=$1 AND media='KUAISHOU' AND version=1", [ws, JSON.stringify(segments)]);
    await expect(load()).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
});
