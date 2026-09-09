import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runMigrations } from "@ka/db";
import { QihangClient } from "../src/qihang/client.js";
import { executeWorkerOnceChild } from "../src/scheduling/worker-once-child.js";
import type { WorkerOnceConfig } from "../src/scheduling/worker-once.js";

describe("actual once tick before retry lease / real PG", () => {
  const workspaceId = randomUUID(), identityId = randomUUID(), userId = randomUUID();
  let pool: Pool, config: WorkerOnceConfig;
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    const url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated local test DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic once retry')", [workspaceId]);
    await pool.query("INSERT INTO users(id,workspace_id,name,qihang_user_id) VALUES($1,$2,'synthetic owner','synthetic-private-qihang')", [userId, workspaceId]);
    await pool.query("INSERT INTO auth_identities(id,provider,provider_subject,display_name) VALUES($1,'internal_test',$2,'synthetic retry identity')", [identityId, `retry-${identityId}`]);
    await pool.query("INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role) VALUES($1,$2,$3,'optimizer')", [workspaceId, identityId, userId]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-once-retry')", [workspaceId]);
    await pool.query("INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU','synthetic-once-retry','read')", [workspaceId, identityId]);
    config = { workspaceId, media: "KUAISHOU", mode: "full", databaseUrl,
      qihangBaseUrl: "https://synthetic.invalid/get_data", maxMs: 30_000, leaseSeconds: 60 };
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["outbound_messages", "etl_runs", "jobs", "account_metrics_daily", "metrics_raw", "account_access_grants", "workspace_memberships", "accounts", "users", "workspaces"]) {
      await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]); await pool.end();
  });
  it("after protocol failure, a second full once tick reuses the original owner/snapshot/job and reaches lease", async () => {
    const fetchFn = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("userId")).toBe("synthetic-private-qihang");
      expect(url.searchParams.get("accountIds")).toBe("synthetic-once-retry");
      return Response.json({ successful: true, data: url.searchParams.get("resource") === "account" ? { rows: [], totalNum: 0 } : [] });
    });
    for (let i = 0; i < 4; i++) fetchFn.mockImplementationOnce(async () => new Response("<html>temporary synthetic failure</html>"));
    const qihang = new QihangClient({ fetchFn, sleep: async () => undefined });
    const at = "2026-09-09T08:00:00Z";
    await executeWorkerOnceChild(config, at, { qihang });
    const prior = (await pool.query("SELECT id,status,attempts,credential_owner_user_id,payload,last_error FROM jobs WHERE workspace_id=$1 AND job_type='etl_full'", [workspaceId])).rows[0];
    expect(prior).toMatchObject({ status: "queued", attempts: 1, credential_owner_user_id: userId });
    expect(prior.last_error).toContain("invalid_json");
    await pool.query("UPDATE jobs SET run_after=now()-interval '1 second' WHERE id=$1", [prior.id]);
    await expect(executeWorkerOnceChild(config, at, { qihang })).resolves.toMatchObject({ status: "drained" });
    const after = (await pool.query("SELECT id,status,attempts,credential_owner_user_id,payload FROM jobs WHERE workspace_id=$1 AND job_type='etl_full'", [workspaceId])).rows;
    expect(after).toEqual([{ id: prior.id, status: "done", attempts: 2, credential_owner_user_id: userId, payload: prior.payload }]);
    expect(JSON.stringify(after)).not.toContain("synthetic-private-qihang");
    expect((await pool.query("SELECT status FROM etl_runs WHERE job_id=$1 ORDER BY id", [prior.id])).rows.map(row => row.status)).toEqual(["failed", "done"]);
  });
});
