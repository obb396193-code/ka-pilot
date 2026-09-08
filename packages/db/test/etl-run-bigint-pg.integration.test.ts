import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";
import { EtlRunRepository } from "../src/etl-run-repository.js";

// Synthetic private transaction/temp table only. No public sequence advancement,
// cleanup of shared tables, credentials or live ETL/media execution.
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Dedicated local TEST_DATABASE_URL required");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.port !== "55432" ||
  !/^\/ka_[a-z0-9_]*_test$/.test(target.pathname)) throw new Error("Dedicated local test database required");

describe("ETL int64 lifecycle real PG", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  let client: PoolClient, repository: EtlRunRepository;
  beforeAll(async () => {
    client = await pool.connect();
    repository = new EtlRunRepository(client as unknown as Pool);
  });
  beforeEach(async () => {
    await client.query("BEGIN");
    await client.query("CREATE TEMP SEQUENCE etl_bigint_test_seq START WITH 9007199254740993");
    await client.query("CREATE TEMP TABLE etl_runs (LIKE public.etl_runs INCLUDING ALL) ON COMMIT DROP");
    await client.query("ALTER TABLE pg_temp.etl_runs ALTER COLUMN id SET DEFAULT nextval('pg_temp.etl_bigint_test_seq')");
  });
  afterEach(async () => { await client.query("ROLLBACK"); });
  afterAll(async () => { client?.release(); await pool.end(); });

  it("start, observations and terminal transitions preserve adjacent IDs beyond2^53", async () => {
    const job = randomUUID(), scope = { workspaceId: randomUUID() };
    const first = await repository.startRun(job, "full", scope), second = await repository.startRun(job, "full", scope);
    expect(first).toBe("9007199254740993"); expect(second).toBe("9007199254740994");
    await repository.recordObservation(first, { rowCount: 7, resource: "account_realtime" });
    await repository.finishRun(first, 7);
    expect((await client.query("SELECT id,status,rows_ingested,scope->'observations' AS observations FROM pg_temp.etl_runs ORDER BY id")).rows)
      .toEqual([{ id: first, status: "done", rows_ingested: 7, observations: [{ rowCount: 7, resource: "account_realtime" }] },
        { id: second, status: "running", rows_ingested: 0, observations: null }]);
    await repository.failRun(second, "raw", "synthetic failure");
    expect((await client.query("SELECT status FROM pg_temp.etl_runs WHERE id=$1", [second])).rows[0]).toEqual({ status: "failed" });
  });
  it("accepts the maximum PG int64 without converting it to a JS number", async () => {
    await client.query("SELECT setval('pg_temp.etl_bigint_test_seq',9223372036854775807,false)");
    const id = await repository.startRun(randomUUID(), "quality", { workspaceId: randomUUID() });
    expect(id).toBe("9223372036854775807");
    await repository.recordObservation(id, { rowCount: 0 }); await repository.finishRun(id, 0);
    expect((await client.query("SELECT id,status FROM pg_temp.etl_runs")).rows).toEqual([{ id, status: "done" }]);
    await expect(repository.recordObservation(id, {})).rejects.toThrow("is not running");
  });
  it("an earlier attempt stays immutable when the same job retries and appends observations", async () => {
    const workspaceId = randomUUID(), jobId = randomUUID();
    const scope = { workspaceId, execution: { version: "etl-attempt/v1", jobId, workspaceId, jobType: "etl_full", attempt: 1 } };
    const first = await repository.startRun(jobId, "full", scope);
    await repository.failRun(first, "raw", "synthetic retry");
    scope.execution.attempt = 2;
    const second = await repository.startRun(jobId, "full", scope);
    await repository.recordObservation(second, { rowCount: 1, execution: { attempt: 99 }, token: "synthetic-not-stored" });
    const rows = (await client.query("SELECT id,scope FROM pg_temp.etl_runs ORDER BY id")).rows;
    expect(rows.map(row => [row.id, row.scope.execution.attempt])).toEqual([[first, 1], [second, 2]]);
    expect(rows[1]!.scope.observations).toEqual([{ rowCount: 1 }]);
    expect(JSON.stringify(rows)).not.toContain("synthetic-not-stored");
  });
});
