import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { runMigrations } from "../src/migrate.js";
import { RuleDefinitionRepository } from "../src/rule-definition-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit dedicated TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "55432" ||
  !/^\/ka_[a-z0-9_]*_test$/.test(url.pathname)) throw new Error("Dedicated local ka_*_test database required");

describe("rule definition real PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  const repository = new RuleDefinitionRepository(pool);
  const owned: string[] = [], ds = "2026-09-08";
  let auth: ApprovedWorkspaceAuthContext, other: string, ruleId: string;
  const ruleTree = { version: "v1", all: [{ metric: "cash_cost", operator: ">", threshold: 20 }] };
  const target = () => ({ ruleId, media: "KUAISHOU", accountId: "same", ds });
  beforeAll(async () => { await runMigrations({ databaseUrl }); }, 30000);
  beforeEach(async () => {
    const rows = (await pool.query("INSERT INTO workspaces(name) VALUES($1),($2) RETURNING id", [
      `synthetic-rule-${randomUUID()}`, `synthetic-rule-other-${randomUUID()}`,
    ])).rows;
    const workspaceId = rows[0]!.id; other = rows[1]!.id; owned.push(workspaceId, other);
    auth = { workspaceId, userId: randomUUID(), role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
    await pool.query(`INSERT INTO accounts(workspace_id,media,account_id) VALUES
      ($1,'KUAISHOU','same'),($1,'TENCENT','same'),($1,'KUAISHOU','other'),($2,'KUAISHOU','same')`, [workspaceId, other]);
    await pool.query(`INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES
      ($1,'task','synthetic','biz'),($1,'foreign-task','synthetic','other-biz'),($2,'task','synthetic','private-biz')`, [workspaceId, other]);
    await pool.query(`INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from,valid_to) VALUES
      ($1,'task','KUAISHOU','same','2026-09-08','2026-09-10'),
      ($1,'foreign-task','TENCENT','same','2026-09-08','2026-09-10'),
      ($2,'task','KUAISHOU','same','2026-09-08','2026-09-10')`, [workspaceId, other]);
    // Explicit synthetic large ID; never move a public sequence to an extreme.
    ruleId = (9007199254740993n + BigInt(randomInt(1000000000))).toString();
    await pool.query(`INSERT INTO alert_rules(id,workspace_id,name,scope,condition_tree)
      VALUES($1,$2,'synthetic',$3,$4)`, [ruleId, workspaceId, {}, ruleTree]);
  });
  afterAll(async () => {
    // Only this file's newly created synthetic workspaces, never shared tables wholesale.
    try {
      for (const table of ["alert_rules", "task_accounts", "tasks", "accounts"]) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=ANY($1::uuid[])`, [owned]);
      }
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [owned]);
    } finally { await pool.end(); }
  });
  const scope = async (value: unknown) => { await pool.query("UPDATE alert_rules SET scope=$1 WHERE id=$2 AND workspace_id=$3", [value, ruleId, auth.workspaceId]); };

  it("reads a global rule with exact int64 and no guessed freshness", async () => {
    expect(await repository.read(auth, target())).toMatchObject({ applicable: true,
      definition: { id: ruleId, workspace_id: auth.workspaceId, condition_tree: ruleTree, data_freshness_max_hours: null } });
  });
  it("scope account tuples do not match another medium's same ID", async () => {
    await scope({ accountScopes: [{ media: "TENCENT", accountId: "same" }] });
    expect((await repository.read(auth, target()))!.applicable).toBe(false);
    const both = { ...auth, scope: { kind: "explicit_accounts", accounts: [
      { media: "KUAISHOU", accountId: "same", accessLevel: "read" }, { media: "TENCENT", accountId: "same", accessLevel: "read" },
    ] } };
    expect((await repository.read(both, { ...target(), media: "TENCENT" }))!.applicable).toBe(true);
  });
  it("task binding uses an inclusive business-date interval", async () => {
    await scope({ taskIds: ["task"] });
    for (const [date, applies] of [["2026-09-07", false], [ds, true], ["2026-09-10", true], ["2026-09-11", false]] as const) {
      expect((await repository.read(auth, { ...target(), ds: date }))!.applicable).toBe(applies);
    }
  });
  it("unions task/biz/account selectors without borrowing foreign task facts", async () => {
    await scope({ taskIds: ["foreign-task"], bizNames: ["private-biz"], accountScopes: [{ media: "TENCENT", accountId: "same" }] });
    expect((await repository.read(auth, target()))!.applicable).toBe(false);
    await scope({ taskIds: ["not-bound"], bizNames: ["biz"] });
    expect((await repository.read(auth, target()))!.applicable).toBe(true);
  });
  it("empty scope and ungranted tuples cannot read the rule", async () => {
    await expect(repository.read({ ...auth, scope: { kind: "explicit_accounts", accounts: [] } }, target())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repository.read(auth, { ...target(), media: "TENCENT" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("another workspace cannot read a known rule ID even with the same account tuple", async () => {
    expect(await repository.read({ ...auth, workspaceId: other }, target())).toBeNull();
  });
  it("team uses workspace scope without account grants", async () => {
    await pool.query("UPDATE workspaces SET kind='team' WHERE id=$1", [auth.workspaceId]);
    const team = { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } };
    expect((await repository.read(team, { ...target(), media: "TENCENT" }))!.applicable).toBe(true);
    expect(await repository.read({ ...team, workspaceId: other }, target())).toBeNull();
  });
  it("a missing granted account is not falsely made applicable", async () => {
    const granted = { ...auth, scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "absent", accessLevel: "read" }] } };
    await expect(repository.read(granted, { ...target(), accountId: "absent" })).rejects.toMatchObject({ code: "ACCOUNT_NOT_FOUND" });
  });
  it("null legacy AST is preserved but invalid AST/scope are rejected", async () => {
    await pool.query("UPDATE alert_rules SET condition_tree=NULL, enabled=false WHERE id=$1", [ruleId]);
    expect(await repository.read(auth, target())).toMatchObject({ definition: { condition_tree: null, enabled: false } });
    await scope(null);
    await expect(repository.read(auth, target())).rejects.toMatchObject({ code: "INVALID_DEFINITION" });
    await scope({}); await pool.query("UPDATE alert_rules SET condition_tree=$1 WHERE id=$2", [{ version: "v1", all: [] }, ruleId]);
    await expect(repository.read(auth, target())).rejects.toMatchObject({ code: "INVALID_DEFINITION" });
  });
  it("does not transmit an oversized definition body from PG", async () => {
    await pool.query("UPDATE alert_rules SET fallback_copy=repeat('x',16777216) WHERE id=$1", [ruleId]);
    let observed = false;
    const hooked = { async connect() {
      const client = await pool.connect();
      return { release: () => client.release(), async query(sql: string, values?: unknown[]) {
        const result = await client.query(sql, values);
        if (sql.includes("rule-definition-row")) {
          expect(result.rows[0]!.payload).toBeNull();
          expect(result.rows[0]!.payload_bytes).toBeGreaterThanOrEqual(16777216);
          observed = true;
        }
        return result;
      } };
    } };
    await expect(new RuleDefinitionRepository(hooked as unknown as Pool).read(auth, target())).rejects.toMatchObject({ code: "INVALID_DEFINITION" });
    expect(observed).toBe(true);
  });
  it("rule and binding reads share an actual RR/RO snapshot under concurrent changes", async () => {
    await scope({ bizNames: ["biz"] });
    let settings: unknown;
    const hooked = { async connect() {
      const client = await pool.connect();
      return { release: () => client.release(), async query(sql: string, values?: unknown[]) {
        const result = await client.query(sql, values);
        if (sql.includes("rule-definition-row")) {
          settings = (await client.query("SELECT current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS ro")).rows[0];
          await pool.query("UPDATE tasks SET biz_name='changed' WHERE workspace_id=$1 AND task_id='task'", [auth.workspaceId]);
        }
        return result;
      } };
    } };
    expect((await new RuleDefinitionRepository(hooked as unknown as Pool).read(auth, target()))!.applicable).toBe(true);
    expect(settings).toEqual({ isolation: "repeatable read", ro: "on" });
    expect((await repository.read(auth, target()))!.applicable).toBe(false);
  });
});
