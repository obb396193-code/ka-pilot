import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AccountListRepository, ChangeSetRepository, JobRepository, SemanticQueryRepository,
  TaskListRepository, WorkItemListRepository, WorkItemRepository, runMigrations, withSemanticReadSnapshot } from "@ka/db";
import { loadWorkspaceSyncReadiness } from "../../../packages/db/src/workspace-sync-readiness.js";
import { createWorkerConsumer } from "../src/runtime.js";
import { QihangClient } from "../src/qihang/client.js";
import { createDataApiServer } from "../src/data/http-server.js";
import { DataQueryService } from "../src/data/query-service.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";
import { DisabledKaDataSource } from "../src/data/disabled-ka-data-source.js";
import { ReadDetailService } from "../src/data/read-detail-service.js";
import { TaskListService } from "../src/tasks/task-list-service.js";
import { AccountListService } from "../src/accounts/account-list-service.js";
import { WorkItemListService } from "../src/work-items/work-item-list-service.js";
import { approvedSessionAuth, businessHeaders, personalAuth } from "./business-auth-fixtures.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "", url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated synthetic test DB required");
describe("formal runtime → fake-fetch → PG canonical → real data HTTP", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const token = "synthetic-runtime-internal-token-at-least-32-chars";
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => { await pool.end(); });
  it.each(["etl_full", "etl_incr"] as const)("%s isolates exhausted batch then restores only after canonical merge", async kind => {
    const workspaceId = randomUUID(), userId = randomUUID(), day = "2026-09-10";
    const accounts = Array.from({ length: 51 }, (_, i) => `synthetic-${i}`);
    let fail = true, failedRequests = 0;
    const qihang = new QihangClient({ sleep: async () => {}, fetchFn: async target => {
      const p = new URL(String(target)).searchParams, resource = p.get("resource"), ids = (p.get("accountIds") ?? "").split(",");
      if (resource === "account_realtime" && ids[0] === accounts[0] && fail) {
        failedRequests++; return new Response("synthetic-private-upstream-body");
      }
      const data = resource === "account" ? { rows: accounts.slice((Number(p.get("pageNum")) - 1) * 50, Number(p.get("pageNum")) * 50).map(account_id => ({ account_id, account_name: "synthetic" })), totalNum: 51 }
        : resource === "account_offline" ? [] : ids.map(account_id => ({ account_id, ds: "20260910", account_cost: 10, account_real_conversion: 1, last_sync_time: "2026-09-10 12:00:00" }));
      return Response.json({ successful: true, data });
    } });
    const jobs = new JobRepository(pool, { workspaceId, jobTypes: [kind, "canonical_merge"] });
    const consumer = createWorkerConsumer({ pool, qihang, serviceQihangUserId: null, leaseSeconds: 60,
      leaseScope: { workspaceId, jobTypes: [kind, "canonical_merge"] } });
    const scope = { workspaceId, requestingUserId: userId, dateFrom: day, dateTo: day,
      allowedAccounts: accounts.map(accountId => ({ media: "KUAISHOU", accountId })) };
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic runtime')", [workspaceId]);
    await pool.query("INSERT INTO users(id,workspace_id,name,qihang_user_id) VALUES($1,$2,'synthetic actor','synthetic-private-qid')", [userId, workspaceId]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) SELECT $1,'KUAISHOU',unnest($2::text[])", [workspaceId, accounts]);
    const server = createDataApiServer({
      internalToken: token, sessionAuthService: approvedSessionAuth(personalAuth({ workspaceId, userId, accounts: scope.allowedAccounts })),
      service: new DataQueryService({ registry: createDataQueryRegistry(), kaData: new DisabledKaDataSource(),
        platform: new PlatformDataSource(new SemanticQueryRepository(pool), read => withSemanticReadSnapshot(pool, connection => read(new SemanticQueryRepository(connection)))),
        sourcePolicy: { kaDataEnabled: false, diagnosticEnabled: false, entitlements: [] } }),
      accountListService: new AccountListService({ repository: new AccountListRepository(pool) }),
      taskListService: new TaskListService({ repository: new TaskListRepository(pool) }),
      workItemListService: new WorkItemListService({ repository: new WorkItemListRepository(pool) }),
      detailService: new ReadDetailService({ workItems: new WorkItemRepository(pool), changeSets: new ChangeSetRepository(pool) }),
    });
    try {
      await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
      const address = server.address(); if (!address || typeof address === "string") throw new Error("No HTTP listener");
      const read = async () => {
        const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/data/query`, {
          method: "POST", headers: { ...businessHeaders(token), "content-type": "application/json", "x-request-id": "runtime-data-proof" },
          body: JSON.stringify({ queryId: "account.table", params: { date: day, pageSize: 100 } }),
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("x-request-id")).toBe("runtime-data-proof");
        return response.json();
      };
      const id = await jobs.enqueue({ workspaceId, jobType: kind, credentialOwnerUserId: userId,
        payload: { workspaceId, media: "KUAISHOU", accountIds: accounts,
          ...(kind === "etl_full" ? { asOfDate: day, realtimeDays: 1 } : { ds: day, offlineReconcileDays: 0 }) } });
      expect(await consumer.processOnce()).toBe(true);
      expect((await pool.query("SELECT status FROM jobs WHERE id=$1", [id])).rows[0].status).toBe("done");
      expect(failedRequests).toBe(4);
      const evidence = (await pool.query("SELECT scope,status FROM etl_runs WHERE job_id=$1", [id])).rows[0];
      expect(evidence.scope.batchFailures).toHaveLength(1);
      expect(evidence.scope.batchFailures[0].accountIds).toHaveLength(50);
      expect(JSON.stringify(evidence)).not.toMatch(/synthetic-private-upstream-body|synthetic-private-qid/);
      expect(await consumer.processOnce()).toBe(true); // canonical_merge, never quality/media work
      expect(await loadWorkspaceSyncReadiness(pool, scope)).toBe(false);
      expect(await read()).toMatchObject({ ok: true, data: { source: { lineage: { partial: true, coverage: { complete: false } } } } });
      fail = false;
      const recovery = createWorkerConsumer({ pool, qihang, serviceQihangUserId: null, leaseSeconds: 60,
        leaseScope: { workspaceId, jobTypes: ["etl_incr", "canonical_merge"] } });
      await jobs.enqueue({ workspaceId, jobType: "etl_incr", credentialOwnerUserId: userId,
        payload: { workspaceId, media: "KUAISHOU", accountIds: accounts, ds: day, offlineReconcileDays: 0 } });
      expect(await recovery.processOnce()).toBe(true);
      expect(await loadWorkspaceSyncReadiness(pool, scope)).toBe(false); // raw alone is not ready
      expect(await recovery.processOnce()).toBe(true);
      expect(await loadWorkspaceSyncReadiness(pool, scope)).toBe(true);
      const result = await read();
      expect(result).toMatchObject({ ok: true, data: { source: { returnedRowCount: 51,
        lineage: { partial: false, coverage: { complete: true } } } } });
      expect((await pool.query("SELECT count(*)::int n FROM account_metrics_daily WHERE workspace_id=$1 AND ds=$2 AND cost=10", [workspaceId, day])).rows[0].n).toBe(51);
      expect(await recovery.processOnce()).toBe(false);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      for (const table of ["account_metrics_daily", "metrics_raw", "etl_runs", "outbound_messages", "jobs", "accounts", "users", "workspaces"]) {
        await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=$1`, [workspaceId]);
      }
    }
  }, 30000);
  it.each(["discovery-protocol", "out-of-scope"])("still fail-stops %s in the formal runtime", async failure => {
    const workspaceId = randomUUID(), userId = randomUUID();
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic fail-stop')", [workspaceId]);
    await pool.query("INSERT INTO users(id,workspace_id,name,qihang_user_id) VALUES($1,$2,'synthetic actor','synthetic-private-qid')", [userId, workspaceId]);
    try {
      const jobs = new JobRepository(pool, { workspaceId, jobTypes: ["etl_full"] });
      const consumer = createWorkerConsumer({ pool, leaseSeconds: 60, serviceQihangUserId: null,
        leaseScope: { workspaceId, jobTypes: ["etl_full"] }, qihang: new QihangClient({ sleep: async () => {},
          fetchFn: async () => failure === "discovery-protocol" ? new Response("synthetic-private-upstream-body")
            : Response.json({ successful: true, data: { rows: [{ account_id: "not-authorized" }], totalNum: 1 } }),
        }) });
      const id = await jobs.enqueue({ workspaceId, jobType: "etl_full", credentialOwnerUserId: userId, maxAttempts: 1,
        payload: { workspaceId, media: "KUAISHOU", accountIds: ["synthetic-valid"], asOfDate: "2026-09-10", realtimeDays: 1 } });
      expect(await consumer.processOnce()).toBe(true);
      const job = (await pool.query("SELECT status,last_error FROM jobs WHERE id=$1", [id])).rows[0];
      expect(job.status).toBe("failed"); expect(job.last_error).not.toMatch(/synthetic-private/);
      const run = (await pool.query("SELECT status,scope FROM etl_runs WHERE job_id=$1", [id])).rows[0];
      expect(run.status).toBe("failed"); expect(run.scope.batchFailures).toBeUndefined();
      expect((await pool.query("SELECT count(*)::int n FROM metrics_raw WHERE workspace_id=$1", [workspaceId])).rows[0].n).toBe(0);
      expect((await pool.query("SELECT count(*)::int n FROM jobs WHERE workspace_id=$1 AND job_type='canonical_merge'", [workspaceId])).rows[0].n).toBe(0);
    } finally {
      for (const table of ["metrics_raw", "etl_runs", "outbound_messages", "jobs", "accounts", "users", "workspaces"]) {
        await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=$1`, [workspaceId]);
      }
    }
  });
});
