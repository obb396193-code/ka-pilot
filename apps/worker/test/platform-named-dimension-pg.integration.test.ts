import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations, SemanticQueryRepository, WindowAssessmentRepository, AccountDimensionEvidenceRepository,
  AccountDimensionRuleRepository, withSemanticReadSnapshot } from "@ka/db";
import { createPlatformDimensionQuery, PlatformDimensionQuery } from "../src/data/platform-dimension-query.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { createDataApiServer } from "../src/data/http-server.js";
import { approvedSessionAuth, businessHeaders, personalAuth } from "./business-auth-fixtures.js";

// Only synthetic data in a dedicated local database. No OS/KA/credential calls.
describe("P211 personal named dimensions / real PG + HTTP", () => {
  const ws = randomUUID(), foreign = randomUUID(), userId = randomUUID(); let pool: Pool;
  const accounts = ["a", "b", "c"].map(accountId => ({ media: "KUAISHOU", accountId }));
  const input = { workspaceId: ws, accounts, window: { from: "2026-09-01", to: "2026-09-02" } };
  const rule = ["optimizer", "goal", "placement"].map(key => ({ key, mapsTo: key, pending: false }));
  const segments = Object.fromEntries(["optimizer", "goal", "placement"].map((key, index) => [key,
    { key, value: ["synthetic-owner", "synthetic-goal", "synthetic-placement"][index], mapsTo: key, taskIds: [] }]));
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl, max: 4 });
    for (const workspaceId of [ws, foreign]) {
      await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic named dimensions')", [workspaceId]);
      await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name,biz_name) VALUES($1,'t','synthetic-task','synthetic-biz')", [workspaceId]);
      await pool.query("INSERT INTO assessment_price_history(workspace_id,task_id,price,effective_date) VALUES($1,'t',20,'2026-09-01'),($1,'t',10,'2026-09-02'),($1,'t',999,'2026-09-03')", [workspaceId]);
      for (const media of ["KUAISHOU", "TENCENT"]) {
        await pool.query("INSERT INTO naming_rules(workspace_id,media,version,segments,effective_from) VALUES($1,$2,1,$3,'2026-09-01'),($1,$2,2,'[]','2026-09-02')", [workspaceId, media, JSON.stringify(rule)]);
        for (const { accountId } of accounts) {
          await pool.query("INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,$2,$3,'synthetic')", [workspaceId, media, accountId]);
          await pool.query("INSERT INTO task_accounts(workspace_id,media,account_id,task_id,valid_from) VALUES($1,$2,$3,'t','2026-08-01')", [workspaceId, media, accountId]);
          if (accountId !== "c") await pool.query(`INSERT INTO account_name_parses(workspace_id,media,account_id,account_name,rule_version,status,segments,override)
            VALUES($1,$2,$3,'synthetic',1,'parsed',$4,$5)`, [workspaceId, media, accountId, JSON.stringify(segments),
            accountId === "b" ? JSON.stringify(Object.fromEntries(Object.entries(segments).map(([key, value]) => [key, value.value]))) : null]);
          for (const [ds, cash] of [["2026-09-01", 22], ["2026-09-02", 3]] as const) await pool.query(`INSERT INTO account_metrics_daily
            (workspace_id,media,account_id,ds,cost,cash_cost,real_conversion,conversion,exposure,click,cost_space,computed_at)
            VALUES($1,$2,$3,$4,40,$5,1,2,100,10,999,'2026-09-02T10:00:00Z')`, [workspaceId, media, accountId, ds,
            workspaceId === ws && media === "KUAISHOU" ? cash : 900]);
        }
      }
    }
  }, 30000);
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["account_name_parses", "naming_rules", "account_metrics_daily", "assessment_price_history", "task_accounts", "accounts", "tasks", "workspaces"]) await pool.query(
      `DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[ws, foreign]]);
    await pool.end();
  });
  it.each(["optimizer", "goal", "placement"])("groups real %s evidence and daily money without scope bleed", async dimensionType => {
    const result = await createPlatformDimensionQuery(pool).named({ ...input, dimensionType });
    expect(result.rows).toMatchObject([
      { key: null, label: "未标注", source: null, sources: {}, metrics: { cashCost: { value: 25 } } },
      { source: "mixed", sources: { nickname: 1, manual: 1 }, metrics: { cashCost: { value: 50 }, costSpace: { value: 10 } },
        assessment: { price: null, priceVersions: 2, onTarget: true } },
    ]);
    expect(result.lineage).toMatchObject({ returnedAccounts: 3, canonicalRows: 6 });
    const otherMedia = await createPlatformDimensionQuery(pool).named({ ...input, accounts: [{ media: "TENCENT", accountId: "a" }], dimensionType });
    expect(otherMedia.rows[0]?.metrics.cashCost.value).toBe(1800);
    const otherWorkspace = await createPlatformDimensionQuery(pool).named({ ...input, workspaceId: foreign, dimensionType });
    expect(otherWorkspace.rows[1]?.metrics.cashCost.value).toBe(3600);
  });
  it("stale names and missing historical rules are warnings, not current-version reparsing", async () => {
    await pool.query("UPDATE accounts SET account_name='renamed' WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id='a'", [ws]);
    await pool.query("UPDATE account_name_parses SET rule_version=9 WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id='b'", [ws]);
    try {
      const result = await createPlatformDimensionQuery(pool).named({ ...input, dimensionType: "optimizer" });
      expect(result.warnings).toEqual(expect.arrayContaining(["NAMING_PARSE_STALE", "NAMING_RULE_MISSING"]));
      expect(result.rows).toMatchObject([{ key: null, metrics: { cashCost: { value: 50 } } },
        { key: "synthetic-owner", source: "manual", sources: { manual: 1 }, metrics: { cashCost: { value: 25 } } }]);
    } finally {
      await pool.query("UPDATE accounts SET account_name='synthetic' WHERE workspace_id=$1", [ws]);
      await pool.query("UPDATE account_name_parses SET rule_version=1 WHERE workspace_id=$1", [ws]);
    }
  });
  it("one RR snapshot cannot mix metrics and names across a concurrent edit", async () => {
    const query = new PlatformDimensionQuery(read => withSemanticReadSnapshot(pool, connection => {
      const semantic = new SemanticQueryRepository(connection), assessment = new WindowAssessmentRepository(connection);
      const evidence = new AccountDimensionEvidenceRepository(connection), rules = new AccountDimensionRuleRepository(connection);
      return read({ queryDimension: semantic.queryDimension.bind(semantic), queryLineage: semantic.queryLineage.bind(semantic),
        loadByAccount: assessment.loadByAccount.bind(assessment), loadRules: rules.load.bind(rules),
        loadEvidence: async scope => {
          await pool.query("UPDATE account_name_parses SET override=$2 WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id='a'", [ws, JSON.stringify({ optimizer: "changed" })]);
          return evidence.load(scope);
        } });
    }));
    try {
      const result = await query.named({ ...input, dimensionType: "optimizer" });
      expect(result.rows[1]).toMatchObject({ key: "synthetic-owner", source: "mixed", metrics: { cashCost: { value: 50 } } });
      expect((await createPlatformDimensionQuery(pool).named({ ...input, dimensionType: "optimizer" })).rows.map(row => row.key))
        .toContain("changed");
    } finally { await pool.query("UPDATE account_name_parses SET override=NULL WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id='a'", [ws]); }
  });
  it("empty grants, missing day and pending segments remain explicit", async () => {
    const query = createPlatformDimensionQuery(pool);
    expect((await query.named({ ...input, accounts: [], dimensionType: "optimizer" })).rows).toEqual([]);
    const missing = await query.named({ ...input, dimensionType: "optimizer", window: { from: "2026-09-01", to: "2026-09-03" } });
    // v1.9.35：缺账户日的行给**部分合计**（带 partial 标），判定挂起——不是整行「−」，也不是 0。
    expect(missing.rows.every(row => row.metrics.cashCost.availability === "partial"
      && row.assessment.onTarget === null && row.assessment.costStatusReason === "partial_data")).toBe(true);
    await pool.query("UPDATE naming_rules SET segments=$2 WHERE workspace_id=$1 AND media='KUAISHOU' AND version=1", [ws, JSON.stringify(rule.map(row => ({ ...row, pending: true })))]);
    try {
      const result = await query.named({ ...input, dimensionType: "optimizer" });
      expect(result.rows).toMatchObject([{ key: null, source: null, sources: {}, metrics: { cashCost: { value: 75 } } }]);
    } finally { await pool.query("UPDATE naming_rules SET segments=$2 WHERE workspace_id=$1 AND media='KUAISHOU' AND version=1", [ws, JSON.stringify(rule)]); }
  });
  it("real HTTP returns three canonical envelopes, rejects invalid evidence as 502 and never calls KA", async () => {
    const platform = new PlatformDataSource(new SemanticQueryRepository(pool), undefined, undefined, createPlatformDimensionQuery(pool));
    const service = new DataQueryService({ registry: createDataQueryRegistry(), platform,
      kaData: { query: async () => { throw new Error("No KA fallback allowed"); } } });
    const internalToken = "synthetic-named-dimension-internal-token-00001";
    const server = createDataApiServer({ service, internalToken,
      sessionAuthService: approvedSessionAuth(personalAuth({ workspaceId: ws, userId, accounts })),
      detailService: {} as never, taskListService: {} as never, accountListService: {} as never, workItemListService: {} as never });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/query`;
    const send = (dimensionType: string, headers = businessHeaders(internalToken)) => fetch(url, { method: "POST", headers: {
      ...headers, "content-type": "application/json", "x-request-id": "named-dimension-pg", "x-ka-workspace-id": foreign, "x-ka-account-scope": "*" },
      body: JSON.stringify({ queryId: "account.dimension", params: { dateFrom: "2026-09-01", dateTo: "2026-09-02", dimensionType } }) });
    try {
      for (const dimension of ["optimizer", "goal", "placement"]) {
        const response = await send(dimension); expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toMatchObject({ ok: true, data: { mode: "platform", source: { dimension, rowSchemaVersion: "account.dimension/v3", returnedRowCount: 2,
          rows: [{ key: null }, { source: "mixed", sources: { manual: 1, nickname: 1 }, metrics: { cashCost: { value: 50 } } }],
          lineage: { dataAsOf: "2026-09-02T10:00:00.000Z", metadataAvailability: "partial", timezone: null, datasetVersion: null, dayCut: null } } } });
        expect(response.headers.get("x-request-id")).toBe("named-dimension-pg");
        if (process.env.EXPORT_SYNTHETIC_NAMED_FIXTURES === "1") {
          const directory = new URL("../../../docs/plans/fixtures/selfcheck10/", import.meta.url);
          await mkdir(directory, { recursive: true });
          await writeFile(new URL(`dimension-${dimension}.json`, directory), `${JSON.stringify(body, null, 2)}\n`);
        }
      }
      expect((await send("optimizer", { authorization: `Bearer ${internalToken}` })).status).toBe(401);
      await pool.query("UPDATE naming_rules SET segments=$2 WHERE workspace_id=$1 AND media='KUAISHOU' AND version=1", [ws, JSON.stringify([{ key: "optimizer", mapsTo: "optimizer", pending: "false" }])]);
      const failed = await send("optimizer"); expect(failed.status).toBe(502);
      expect(await failed.json()).toMatchObject({ ok: false, error: { code: "UPSTREAM_INVALID_RESPONSE", requestId: "named-dimension-pg" } });
    } finally {
      await pool.query("UPDATE naming_rules SET segments=$2 WHERE workspace_id=$1 AND media='KUAISHOU' AND version=1", [ws, JSON.stringify(rule)]);
      server.close(); await once(server, "close");
    }
  });
});
