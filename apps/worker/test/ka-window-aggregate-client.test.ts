import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { KaDataClient } from "../src/data/ka-data-client.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { DataQueryService, createDataQueryHttpHandler } from "../src/data/query-service.js";
import { teamAuth } from "./business-auth-fixtures.js";

describe("public team aggregate source path", () => {
  it("serves a 500-account month through client/service/HTTP handler in one source call", async () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`CREATE TABLE dwd_account_daily(ds INTEGER,media TEXT,account_id TEXT,cost_yuan REAL,
      cash_yuan REAL,show REAL,click REAL,conv REAL,cash_assessment REAL); BEGIN`);
    const insert = db.prepare("INSERT INTO dwd_account_daily VALUES(?,'KUAISHOU',?,12,8,100,10,1,10)");
    for (let day = 1; day <= 31; day++) for (let account = 0; account < 500; account++) insert.run(20260800 + day, `a-${account}`);
    db.exec("COMMIT");
    const auth = teamAuth({ workspaceId: "00000000-0000-4000-8000-000000000081", userId: "00000000-0000-4000-8000-000000000082" });
    const fetchFn = vi.fn<typeof fetch>(async (_url, init) => {
      const { sql } = JSON.parse(String(init?.body));
      const rows = db.prepare(sql).all();
      expect(rows).toHaveLength(32);
      return Response.json({ backend: "sqlite", rowCount: rows.length, rows });
    });
    const platform = { query: vi.fn() };
    const client = new KaDataClient({ baseUrl: "https://synthetic.invalid", token: "synthetic", teamWorkspaceId: auth.workspaceId, fetchFn });
    const handler = createDataQueryHttpHandler(new DataQueryService({ registry: createDataQueryRegistry(), kaData: client, platform,
      sourcePolicy: { kaDataEnabled: true, diagnosticEnabled: false, entitlements: [] } }));
    try {
      const result = await handler({ method: "POST", requestId: "monthly-window", auth,
        body: { queryId: "account.summary", params: { date_from: "2026-08-01", date_to: "2026-08-31", media: "KUAISHOU" } } });
      expect(result.status).toBe(200);
      expect(result.body).toMatchObject({ ok: true, data: { mode: "ka_data", source: { rowSchemaVersion: "account.summary/v3",
        rows: [{ rowCount: 15500, accountCount: 500, metrics: { cashCost: { value: 124000 }, costSpace: { value: 31000 } },
          assessment: { priceSource: "ka_daily", onTarget: true, costStatus: "green" } }],
        lineage: { queryTemplateVersion: "account-window-aggregate-v1", partial: true, truncated: false, coverage: { complete: false, returnedObjects: 500 } },
      } } });
      expect(fetchFn).toHaveBeenCalledTimes(1); expect(platform.query).not.toHaveBeenCalled();
    } finally { db.close(); }
  });
});
