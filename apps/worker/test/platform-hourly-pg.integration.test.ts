import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountListRepository, TaskListRepository, WorkItemListRepository, WorkItemRepository,
  ChangeSetRepository, SemanticQueryRepository, runMigrations } from "@ka/db";
import { createPlatformHourlyQuery } from "../src/data/platform-hourly-query.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { createDataApiServer } from "../src/data/http-server.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { DisabledKaDataSource } from "../src/data/disabled-ka-data-source.js";
import { AccountListService } from "../src/accounts/account-list-service.js";
import { TaskListService } from "../src/tasks/task-list-service.js";
import { WorkItemListService } from "../src/work-items/work-item-list-service.js";
import { ReadDetailService } from "../src/data/read-detail-service.js";
import { approvedSessionAuth, businessHeaders, personalAuth, teamAuth } from "./business-auth-fixtures.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
describe("025 account hourly → approved query service → real HTTP", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  beforeAll(async () => { await runMigrations({ databaseUrl }); }, 30000);
  afterAll(async () => { await pool.end(); });
  it("never joins same IDs across workspace/media; keeps missing hours and real coefficient", async () => {
    const ws = randomUUID(), other = randomUUID(), userId = randomUUID(), date = "2026-09-09";
    const token = "synthetic-hourly-token-at-least-thirty-two-characters";
    const auth = personalAuth({ workspaceId: ws, userId, accounts: [{ media: "KUAISHOU", accountId: "a" }] });
    const service = new DataQueryService({ registry: createDataQueryRegistry(), platform: new PlatformDataSource(new SemanticQueryRepository(pool)),
      kaData: new DisabledKaDataSource(), hourly: createPlatformHourlyQuery(pool) });
    const server = createDataApiServer({ internalToken: token, sessionAuthService: approvedSessionAuth(auth), service,
      accountListService: new AccountListService({ repository: new AccountListRepository(pool) }),
      taskListService: new TaskListService({ repository: new TaskListRepository(pool) }),
      workItemListService: new WorkItemListService({ repository: new WorkItemListRepository(pool) }),
      detailService: new ReadDetailService({ workItems: new WorkItemRepository(pool), changeSets: new ChangeSetRepository(pool) }),
    });
    try {
      for (const workspaceId of [ws, other]) {
        await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic hourly HTTP')", [workspaceId]);
        for (const media of ["KUAISHOU", "TENCENT"]) for (const id of ["a", "not-granted"]) {
          await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,$2,$3)", [workspaceId, media, id]);
          await pool.query(`INSERT INTO account_metrics_hourly(workspace_id,media,account_id,ds,hh,cost,conversion,real_conversion,budget,last_sync_time,sampled_at,complete)
            SELECT $1,$2,$3,$4,h,CASE WHEN $1::uuid=$5::uuid AND $2='KUAISHOU' AND $3='a' THEN (h+1)*10 ELSE 999 END,2,1,100,
              '2026-09-08T18:01:00Z','2026-09-08T18:05:00Z',true FROM generate_series(0,1) h`, [workspaceId, media, id, date, ws]);
        }
      }
      await pool.query("INSERT INTO channel_coefficients(workspace_id,media,coefficient,op,effective_date) VALUES($1,'KUAISHOU',2,'divide',$2)", [ws, date]);
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address(); if (!address || typeof address === "string") throw new Error("No HTTP listener");
      const endpoint = `http://127.0.0.1:${address.port}/api/v1/data/query`;
      const request = { queryId: "account.hourly", params: { date, media: "KUAISHOU", hhFrom: 1, hhTo: 2 } };
      const response = await fetch(endpoint, { method: "POST", headers: { ...businessHeaders(token), "content-type": "application/json",
        "x-request-id": "hourly-pg-http", "x-ka-workspace-id": other, "x-ka-account-scope": "*" }, body: JSON.stringify(request) });
      expect(response.status).toBe(200); expect(response.headers.get("x-request-id")).toBe("hourly-pg-http");
      const body = await response.json();
      expect(body.data.source.rows).toHaveLength(2);
      expect(body.data.source.rows[0]).toMatchObject({ accountId: "a", media: "KUAISHOU", hh: 1,
        cumulative: { cost: { value: 20 }, cashCost: { value: 10 } }, delta: { cost: { value: 10 } } });
      expect(body.data.source.rows[1]).toMatchObject({ hh: 2, cumulative: { cost: { value: null, availability: "missing" } } });
      expect(body.data.source.lineage).toMatchObject({ partial: true, truncated: false, dataAsOf: "2026-09-08T18:01:00.000Z", timezone: null, datasetVersion: null });
      expect(JSON.stringify(body)).not.toMatch(/999|not-granted/);
      expect((await fetch(endpoint, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(request) })).status).toBe(401);
      const forbidden = await fetch(endpoint, { method: "POST", headers: { ...businessHeaders(token), "content-type": "application/json" },
        body: JSON.stringify({ ...request, params: { ...request.params, accountIds: ["not-granted"] } }) });
      expect(forbidden.status).toBe(403);
      expect(await service.execute(request, teamAuth({ workspaceId: ws, userId }), "team-hourly"))
        .toMatchObject({ ok: false, error: { code: "SOURCE_UNAVAILABLE" } });
    } finally {
      if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      for (const table of ["account_metrics_hourly", "channel_coefficients", "accounts", "workspaces"]) {
        await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[ws, other]]);
      }
    }
  }, 30000);
});
