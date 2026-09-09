import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { Pool } from "pg";
import { runMigrations, SemanticQueryRepository } from "@ka/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDataApiServer, type DataApiServerOptions } from "../src/data/http-server.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { createPlatformPivotQuery } from "../src/data/platform-pivot-query.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { DisabledKaDataSource } from "../src/data/disabled-ka-data-source.js";
import { approvedSessionAuth, personalAuth, businessHeaders } from "./business-auth-fixtures.js";

// Only this explicitly selected local isolated test DB; no shared /ka fallback.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.port !== "55432" ||
  !/^\/ka_[a-z0-9_]*_test$/.test(target.pathname)) throw new Error("Dedicated local test database required");

describe("pivot HTTP factory to real PG / synthetic data only", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 3000 });
  const workspaceId = randomUUID(), other = randomUUID(), token = "synthetic-pivot-test-token-000000000000";
  const auth = personalAuth({ workspaceId, userId: randomUUID(), accounts: [{ media: "KUAISHOU", accountId: "same" }] });
  const service = new DataQueryService({ registry: createDataQueryRegistry(), kaData: new DisabledKaDataSource(),
    platform: new PlatformDataSource(new SemanticQueryRepository(pool), undefined, undefined, undefined, createPlatformPivotQuery(pool)) });
  const unrelated = new Proxy({}, { get: () => () => { throw new Error("Unrelated route invoked"); } });
  const server = createDataApiServer({ service, internalToken: token, sessionAuthService: approvedSessionAuth(auth),
    detailService: unrelated as DataApiServerOptions["detailService"], taskListService: unrelated as DataApiServerOptions["taskListService"],
    accountListService: unrelated as DataApiServerOptions["accountListService"], workItemListService: unrelated as DataApiServerOptions["workItemListService"] });
  let base = "";
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    for (const ws of [workspaceId, other]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic pivot http')", [ws]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'t','synthetic','b')", [ws]);
      await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'t',20,'2026-09-01')", [ws]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,'same')", [ws, media]);
        await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,$2,'same','t','2026-09-01')", [ws, media]);
        await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cash_cost,real_conversion,computed_at)
          VALUES($1,$2,'same','2026-09-01',$3,1,'2026-09-01T01:00:00Z')`, [ws, media, ws === workspaceId && media === "KUAISHOU" ? 10 : 900]);
      }
    }
    server.listen(0, "127.0.0.1"); await once(server, "listening"); base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 30000);
  afterAll(async () => {
    try {
      if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      for (const table of ["account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) {
        await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, other]]);
      }
    } finally { await pool.end(); }
  });
  async function query(day = "2026-09-01", headers: Record<string, string> = businessHeaders(token), extra: Record<string, unknown> = {}) {
    const response = await fetch(`${base}/api/v1/query`, { method: "POST", headers: { ...headers, "x-request-id": "pivot-pg", "content-type": "application/json" },
      body: JSON.stringify({ queryId: "account.pivot2", params: { dimA: "task", dimB: "account", window_from: day, window_to: day, media: "KUAISHOU", ...extra } }) });
    return { status: response.status, id: response.headers.get("x-request-id"), body: await response.json() };
  }
  it("scope keeps same-ID media/workspaces separate through actual factory, SQL and HTTP", async () => {
    expect(await query("2026-09-01", { ...businessHeaders(token), "x-ka-workspace-id": other, "x-ka-account-scope": "all" }))
      .toMatchObject({ status: 200, id: "pivot-pg", body: { ok: true, data: { source: { rows: [{ a: { key: "t" }, b: { key: "KUAISHOU:same" },
        metrics: { cashCost: { value: 10 }, costSpace: { value: 10 } }, assessment: { priceSource: "history", onTarget: true } }] } },
        meta: { cellCoverage: { cells: 1, withData: 1, undeterminable: 0 } } } });
    expect((await query("2026-09-01", { authorization: `Bearer ${token}` })).status).toBe(401);
  });
  it("no canonical day stays partial/null, not a zero or fabricated successful total", async () => {
    expect(await query("2026-09-02")).toMatchObject({ status: 200, body: { ok: true, data: { source: {
      lineage: { coverage: { complete: false, returnedObjects: 0 }, dataAsOf: null, partial: true, truncated: false },
      rows: [{ metrics: { cashCost: { value: null, availability: "missing" } } }], wholeResultTotal: { value: null, availability: "partial" } } },
      meta: { cellCoverage: { cells: 1, withData: 0, undeterminable: 1 } } } });
  });
  it("task filter applies to each actual business day before aggregating a cross-day account", async () => {
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'second','synthetic second','b')", [workspaceId]);
    await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'second',30,'2026-09-02')", [workspaceId]);
    await pool.query("UPDATE task_accounts SET valid_to='2026-09-01' WHERE workspace_id=$1 AND media='KUAISHOU'", [workspaceId]);
    await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,'KUAISHOU','same','second','2026-09-02')", [workspaceId]);
    await pool.query("INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,cash_cost,real_conversion,computed_at) VALUES($1,'KUAISHOU','same','2026-09-02',90,3,'2026-09-02T01:00:00Z')", [workspaceId]);
    const extra = { window_to: "2026-09-02", dimA: "biz", dimB: "account" };
    const first = await query("2026-09-01", businessHeaders(token), { ...extra, taskIds: ["t"] });
    expect(first).toMatchObject({ status: 200, body: { ok: true, data: { source: { rows: [{ metrics: { cashCost: { value: 10 }, realConversion: { value: 1 }, ratios: { cashCpa: { value: 10 } }, costSpace: { value: 10 } } }] } } } });
    const second = await query("2026-09-01", businessHeaders(token), { ...extra, taskIds: ["second"] });
    expect(second).toMatchObject({ status: 200, body: { data: { source: { rows: [{ metrics: { cashCost: { value: 90 }, realConversion: { value: 3 }, costSpace: { value: 0 } } }] } } } });
    const empty = await query("2026-09-01", businessHeaders(token), { ...extra, taskIds: ["foreign"] });
    expect(empty).toMatchObject({ status: 200, body: { data: { source: { rows: [] } }, meta: { cellCoverage: { cells: 0 } } } });
  });
});
