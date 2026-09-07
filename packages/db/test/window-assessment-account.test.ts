import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { WindowAssessmentRepository } from "../src/window-assessment-repository.js";

const workspaceId = randomUUID(), foreignWorkspaceId = randomUUID();
const accounts = [{ media: "KUAISHOU", accountId: "synthetic-shared" }, { media: "TENCENT", accountId: "synthetic-shared" }];
const scope = { workspaceId, dateFrom: "2026-09-01", dateTo: "2026-09-02", filters: { accountScopes: accounts } };
const raw = () => ({ workspace_id: workspaceId, media: "KUAISHOU", account_id: "synthetic-shared",
  ds: "2026-09-01", cash_cost: "10", real_conversion: "1", version_id: "1", price: "20", effective_date: "2026-09-01" });

describe("account assessment bulk boundary", () => {
  const read = (rows: unknown[]) => new WindowAssessmentRepository({ query: vi.fn().mockResolvedValue({ rows }) }).loadByAccount(scope);
  it("uses one parameterized SQL for all approved pairs", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [raw()] });
    expect(await new WindowAssessmentRepository({ query }).loadByAccount(scope)).toMatchObject([
      { workspaceId, media: "KUAISHOU", accountId: "synthetic-shared", input: { cashCost: { value: 10 } } },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("LIMIT 10001");
    expect(query.mock.calls[0]?.[1]).toContain(workspaceId);
  });
  it.each([
    { workspace_id: foreignWorkspaceId }, { media: "BAIDU" }, { account_id: "outside" },
    { ds: "2026-02-31" }, { ds: "2026-09-03" }, { cash_cost: "NaN" }, { price: "Infinity" },
    { effective_date: "2026-09-02" }, { workspace_id: null }, { real_conversion: false },
  ])("rejects untrusted or invalid row %j", async (change) => {
    await expect(read([{ ...raw(), ...change }])).rejects.toThrow();
  });
  it("rejects duplicate account-days and overflow instead of concealing ambiguous task history", async () => {
    await expect(read([raw(), { ...raw(), version_id: "2" }])).rejects.toThrow();
    await expect(read(Array.from({ length: 10001 }, raw))).rejects.toThrow();
  });
  it("preserves null history and missing metrics without guessing zero", async () => {
    expect(await read([{ ...raw(), version_id: null, price: null, effective_date: null, cash_cost: null }])).toMatchObject([
      { input: { price: null, cashCost: { value: null, availability: "missing" } } },
    ]);
  });
});

describe("account assessment bulk / synthetic real PG", () => {
  let pool: Pool;
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl });
    for (const ws of [workspaceId, foreignWorkspaceId]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic bulk')", [ws]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,'synthetic-task','synthetic')", [ws]);
      await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'synthetic-task',20,'2026-09-01'),($1,'synthetic-task',30,'2026-09-02'),($1,'synthetic-task',999,'2026-09-03')", [ws]);
      for (const [index, account] of accounts.entries()) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,$3)", [ws, account.media, account.accountId]);
        await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,$2,$3,'synthetic-task','2026-09-01')", [ws, account.media, account.accountId]);
        await pool.query("INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cash_cost,real_conversion) VALUES($1,$2,$3,'2026-09-01',$4,1)", [ws, account.media, account.accountId, ws === workspaceId ? 10 + index : 900]);
      }
    }
  });
  afterAll(async () => {
    if (!pool) return;
    try {
      for (const table of ["account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) {
        await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, foreignWorkspaceId]]);
      }
    } finally { await pool.end(); }
  });
  it("keeps same ID across media separate, excludes foreign workspace and future versions, retains missing days", async () => {
    const rows = await new WindowAssessmentRepository(pool).loadByAccount(scope);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.workspaceId === workspaceId)).toBe(true);
    for (const [index, { media }] of accounts.entries()) {
      const selected = rows.filter((row) => row.media === media);
      expect(selected.map((row) => row.input.cashCost.value)).toEqual([10 + index, null]);
      expect(selected.map((row) => row.input.price?.value)).toEqual([20, 30]);
    }
  });
  it("empty explicit scope never discovers workspace accounts", async () => {
    expect(await new WindowAssessmentRepository(pool).loadByAccount({ ...scope, filters: { accountScopes: [] } })).toEqual([]);
    const rows = await new WindowAssessmentRepository(pool).loadByAccount({ ...scope, filters: { accountScopes: [accounts[0]!] } });
    expect(rows).toHaveLength(2); expect(rows.every((row) => row.media === "KUAISHOU")).toBe(true);
  });
});
