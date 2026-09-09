import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "../src/migrate.js";
import { RuleEvidenceRepository } from "../src/rule-evidence-repository.js";

// Synthetic test data only. Never create/fall back to a shared or company database.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("A dedicated local TEST_DATABASE_URL is required");
const db = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(db.hostname) || db.port !== "55432" ||
  !/^\/ka_[a-z0-9_]*_test$/.test(db.pathname)) throw new Error("A dedicated local test database is required");

describe("rule evidence same-snapshot real PG", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
  const repository = new RuleEvidenceRepository(pool);
  const workspaceId = randomUUID(), other = randomUUID();
  const auth = { workspaceId, userId: randomUUID(), role: "optimizer", workspaceKind: "personal",
    scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
  const tree = { version: "v1", all: [{ metric: "cash_cpa", operator: ">", threshold: "assessment_price" }] };
  const window = { from: "2026-09-07", to: "2026-09-08", preset: "custom" };
  let target = { ruleId: "1", media: "KUAISHOU", accountId: "same", ds: window.to };
  let seeded = false;
  beforeAll(async () => {
    await runMigrations({ databaseUrl }); seeded = true;
    for (const ws of [workspaceId, other]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic rule evidence')", [ws]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'task','synthetic task','synthetic biz')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'same')", [ws, media]);
        await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,$2,'same','task','2026-09-01')", [ws, media]);
        await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cash_cost,real_conversion,computed_at)
          VALUES($1,$2,'same','2026-09-07',$3,1,'2026-09-07T01:00:00Z'),($1,$2,'same','2026-09-08',$4,3,'2026-09-08T01:00:00Z')`,
        [ws, media, ws === other ? 900 : media === "TENCENT" ? 700 : 10, ws === other ? 900 : media === "TENCENT" ? 700 : 100]);
      }
      await pool.query(`INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date)
        VALUES($1,'task',10,'2026-09-07'),($1,'task',30,'2026-09-08'),($1,'task',999,'2026-09-09')`, [ws]);
    }
    const rule = await pool.query(`INSERT INTO alert_rules(workspace_id,name,metric,operator,threshold,scope,condition_tree)
      VALUES($1,'synthetic','cash_cpa','>',20,'{}',$2::jsonb) RETURNING id::text`, [workspaceId, JSON.stringify(tree)]);
    target = { ...target, ruleId: rule.rows[0]!.id };
  }, 30000);
  afterAll(async () => {
    try {
      if (seeded) for (const table of ["alert_rules", "account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) {
        await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, other]]);
      }
    } finally { await pool.end(); }
  });
  it("joins actual effective prices, excludes future price and computes cash CPA", async () => {
    const result = await repository.read(auth, target, window);
    expect(result).toMatchObject({ evaluation: { pass: true, leaves: [{
      value: { value: 27.5, state: "finite" }, threshold: { value: 25, state: "finite" },
    }] }, evidence: { observation: { expectedAccountDays: 2, observedAccountDays: 2 } } });
    expect(result?.evidence?.members.map(row => row.assessment.price?.value)).toEqual([10, 30]);
  });
  it("same-ID across media/workspace cannot contaminate the target", async () => {
    const result = await repository.read(auth, target, window);
    expect(result?.evidence?.members.map(row => [row.workspaceId, row.media, row.accountId, row.metrics.cashCost.value]))
      .toEqual([[workspaceId, "KUAISHOU", "same", 10], [workspaceId, "KUAISHOU", "same", 100]]);
    await expect(repository.read(auth, { ...target, media: "TENCENT" }, window)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await repository.read({ ...auth, workspaceId: other }, target, window)).toBeNull();
    await expect(repository.read({ ...auth, scope: { kind: "explicit_accounts", accounts: [] } }, target, window)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("missing canonical day remains undeterminable, not dropped or zero filled", async () => {
    const missing = { from: "2026-09-06", to: window.to, preset: "custom" };
    const result = await repository.read(auth, target, missing);
    expect(result).toMatchObject({ evaluation: { pass: null, reason: "METRIC_MISSING" }, evidence: {
      observation: { expectedAccountDays: 3, observedAccountDays: 2 },
    } });
    expect(result?.evidence?.members[0]).toMatchObject({ observed: false, metrics: { cashCost: { value: null, availability: "missing" } } });
  });
  it("invalid numeric does not produce a false condition", async () => {
    await pool.query("UPDATE account_metrics_daily SET cash_cost='NaN' WHERE workspace_id=$1 AND media='KUAISHOU' AND ds='2026-09-07'", [workspaceId]);
    try { await expect(repository.read(auth, target, window)).rejects.toMatchObject({ code: "INVALID_EVIDENCE" }); }
    finally { await pool.query("UPDATE account_metrics_daily SET cash_cost=10 WHERE workspace_id=$1 AND media='KUAISHOU' AND ds='2026-09-07'", [workspaceId]); }
  });
  it("rule scope non-match is distinct from condition false and reads no metric data", async () => {
    await pool.query("UPDATE alert_rules SET scope=$2::jsonb WHERE workspace_id=$1 AND id=$3::bigint", [workspaceId, JSON.stringify({ taskIds: ["other-task"] }), target.ruleId]);
    try { expect(await repository.read(auth, target, window)).toMatchObject({ applicable: false, evaluation: null, evidence: null, unavailableReason: "OUTSIDE_RULE_SCOPE" }); }
    finally { await pool.query("UPDATE alert_rules SET scope='{}' WHERE workspace_id=$1 AND id=$2::bigint", [workspaceId, target.ruleId]); }
  });
  it("one read retains old rule/metrics/price while a concurrent transaction commits all three", async () => {
    let snapshots = 0;
    const concurrent = new RuleEvidenceRepository({ connect: async () => {
      const client = await pool.connect();
      return { on: client.on.bind(client), removeListener: client.removeListener.bind(client), release: client.release.bind(client),
        query: async (sql: string, values?: unknown[]) => {
          if (sql.includes("platform-pivot-members")) {
            snapshots++;
            const mode = await client.query("SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS readonly");
            expect(mode.rows[0]).toEqual({ isolation: "repeatable read", readonly: "on" });
            await pool.query(`WITH changed_metrics AS (
                UPDATE account_metrics_daily SET cash_cost=500 WHERE workspace_id=$1 AND media='KUAISHOU' RETURNING 1
              ), changed_prices AS (
                UPDATE assessment_price_history SET price=600 WHERE workspace_id=$1 RETURNING 1
              ) UPDATE alert_rules SET condition_tree=$2::jsonb WHERE workspace_id=$1 AND id=$3::bigint`,
            [workspaceId, JSON.stringify({ version: "v1", all: [{ metric: "cash_cost", operator: ">", threshold: 2000 }] }), target.ruleId]);
          }
          return client.query(sql, values);
        },
      };
    } } as never);
    try {
      const before = await concurrent.read(auth, target, window);
      expect(snapshots).toBe(1);
      expect(before?.evaluation).toMatchObject({ pass: true, leaves: [{ metric: "cash_cpa", value: { value: 27.5 }, threshold: { value: 25 } }] });
      const after = await repository.read(auth, target, window);
      expect(after?.evaluation).toMatchObject({ pass: false, leaves: [{ metric: "cash_cost", value: { value: 1000 }, threshold: 2000 }] });
      expect(after?.evidence?.members.map(row => row.assessment.price?.value)).toEqual([600, 600]);
    } finally {
      await pool.query("UPDATE alert_rules SET condition_tree=$2::jsonb WHERE workspace_id=$1 AND id=$3::bigint", [workspaceId, JSON.stringify(tree), target.ruleId]);
      await pool.query("UPDATE account_metrics_daily SET cash_cost=CASE WHEN ds='2026-09-07' THEN 10 ELSE 100 END WHERE workspace_id=$1 AND media='KUAISHOU'", [workspaceId]);
      await pool.query("UPDATE assessment_price_history SET price=CASE WHEN effective_date='2026-09-07' THEN 10 WHEN effective_date='2026-09-08' THEN 30 ELSE 999 END WHERE workspace_id=$1", [workspaceId]);
    }
  });
});
