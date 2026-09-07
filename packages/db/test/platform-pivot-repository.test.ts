import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { computeWindowAssessment } from "@ka/domain";
import { runMigrations } from "../src/migrate.js";
import { PlatformPivotContractError, PlatformPivotRepository } from "../src/platform-pivot-repository.js";

// Synthetic fixtures, explicit isolated local database only. Never create/fall back to shared ka.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("A dedicated local TEST_DATABASE_URL is required");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.port !== "55432" ||
  !/^\/ka_[a-z0-9_]*_test$/.test(target.pathname)) throw new Error("A dedicated local test database is required");

describe("PlatformPivotRepository real PG", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
  const repository = new PlatformPivotRepository(pool);
  const workspaceId = randomUUID(), other = randomUUID();
  const auth = { workspaceId, userId: randomUUID(), role: "optimizer", workspaceKind: "personal",
    scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
  const window = { from: "2026-09-01", to: "2026-09-02", preset: "custom" };
  let seeded = false;
  beforeAll(async () => {
    await runMigrations({ databaseUrl }); seeded = true;
    for (const ws of [workspaceId, other]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic pivot')", [ws]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'a','task a','biz a'),($1,'b','task b','biz b')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,$2,'same','synthetic')", [ws, media]);
        await pool.query(`INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from,valid_to)
          VALUES($1,$2,'same','a','2026-09-01','2026-09-01'),($1,$2,'same','b','2026-09-02',NULL)`, [ws, media]);
        const cash = ws === other ? 900 : media === "TENCENT" ? 700 : 10;
        await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cash_cost,real_conversion,computed_at)
          VALUES($1,$2,'same','2026-09-01',$3,1,'2026-09-01T01:00:00Z'),
          ($1,$2,'same','2026-09-02',$3,2,'2026-09-02T02:00:00Z')`, [ws, media, cash]);
      }
      await pool.query(`INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES
        ($1,'a',20,'2026-09-01'),($1,'a',30,'2026-09-01'),($1,'b',40,'2026-09-02'),($1,'b',999,'2026-09-03')`, [ws]);
    }
  }, 30000);
  afterAll(async () => {
    try {
      if (seeded) for (const table of ["account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) {
        await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, other]]);
      }
    } finally { await pool.end(); }
  });
  it("reads each day's effective task and price; newest same-day ID wins, future price excluded", async () => {
    const result = await repository.read(auth, window);
    expect(result.members.map(m => [m.taskId, m.bizName, m.assessment.price?.value])).toEqual([["a", "biz a", 30], ["b", "biz b", 40]]);
    expect(computeWindowAssessment(result.members.map(m => m.assessment)).costSpace.value).toBe(90);
    expect(result.observation).toMatchObject({ expectedAccountDays: 2, observedAccountDays: 2, observedAccounts: 1 });
  });
  it("same accountId in other media/workspaces is excluded, not summed", async () => {
    expect((await repository.read(auth, window)).members.map(m => m.metrics.cashCost.value)).toEqual([10, 10]);
    expect((await repository.read({ ...auth, workspaceId: other }, window)).members.map(m => m.metrics.cashCost.value)).toEqual([900, 900]);
    const both = { ...auth, scope: { kind: "explicit_accounts", accounts: [...auth.scope.accounts,
      { media: "TENCENT", accountId: "same", accessLevel: "read" }] } };
    expect((await repository.read(both, window)).members.map(m => m.metrics.cashCost.value)).toEqual([10, 10, 700, 700]);
  });
  it("does not discard missing authorized account masters or missing days", async () => {
    const result = await repository.read({ ...auth, scope: { kind: "explicit_accounts", accounts: [
      ...auth.scope.accounts, { media: "KUAISHOU", accountId: "not-synced", accessLevel: "read" },
    ] } }, { ...window, to: "2026-09-03" });
    expect(result.members).toHaveLength(6);
    expect(result.members.filter(m => !m.observed)).toHaveLength(4);
    expect(result.observation).toMatchObject({ expectedAccountDays: 6, observedAccountDays: 2, observedAccounts: 1 });
  });
  it("empty grants return no metadata or source timestamps", async () => {
    const result = await repository.read({ ...auth, scope: { kind: "explicit_accounts", accounts: [] } }, window);
    expect(result.members).toEqual([]); expect(result.observation.latestComputedAt).toBeNull();
  });
  it("orphan task relation retains its ID and null labels instead of disappearing", async () => {
    await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from,valid_to) VALUES($1,'KUAISHOU','same','orphan','2026-08-31','2026-08-31')", [workspaceId]);
    const result = await repository.read(auth, { ...window, from: "2026-08-31", to: "2026-08-31" });
    expect(result.members[0]).toMatchObject({ taskId: "orphan", taskName: null, bizName: null, assessment: { price: null }, observed: false });
  });
  it("present-invalid PG NUMERIC NaN is rejected as a fixed contract error", async () => {
    await pool.query("UPDATE account_metrics_daily SET cash_cost='NaN' WHERE workspace_id=$1 AND media='KUAISHOU' AND ds='2026-09-01'", [workspaceId]);
    try { await expect(repository.read(auth, window)).rejects.toBeInstanceOf(PlatformPivotContractError); }
    finally { await pool.query("UPDATE account_metrics_daily SET cash_cost=10 WHERE workspace_id=$1 AND media='KUAISHOU' AND ds='2026-09-01'", [workspaceId]); }
  });
  it("retains one RR snapshot when another transaction changes metrics and prices", async () => {
    const snapshotRepository = new PlatformPivotRepository({ connect: async () => {
      const client = await pool.connect();
      return { on: client.on.bind(client), removeListener: client.removeListener.bind(client), release: client.release.bind(client),
        query: async (sql: string, values?: unknown[]) => {
          if (sql.includes("platform-pivot-members")) {
            await client.query("SELECT 1"); // Pin RR snapshot before the other transaction commits.
            await pool.query(`WITH changed AS (
              UPDATE account_metrics_daily SET cash_cost=500 WHERE workspace_id=$1 AND media='KUAISHOU' RETURNING 1
            ) UPDATE assessment_price_history SET price=600 WHERE workspace_id=$1`, [workspaceId]);
          }
          return client.query(sql, values);
        },
      };
    } } as never);
    try {
      const frozen = await snapshotRepository.read(auth, window);
      expect(frozen.members.map(m => [m.metrics.cashCost.value, m.assessment.price?.value])).toEqual([[10, 30], [10, 40]]);
      const current = await repository.read(auth, window);
      expect(current.members.map(m => [m.metrics.cashCost.value, m.assessment.price?.value])).toEqual([[500, 600], [500, 600]]);
    } finally {
      await pool.query("UPDATE account_metrics_daily SET cash_cost=10 WHERE workspace_id=$1 AND media='KUAISHOU'", [workspaceId]);
      // Preserve same-day tie behavior; these are only this test's synthetic versions.
      await pool.query("UPDATE assessment_price_history SET price=CASE WHEN task_id='a' THEN 30 WHEN effective_date='2026-09-02' THEN 40 ELSE 999 END WHERE workspace_id=$1", [workspaceId]);
    }
  });
});
