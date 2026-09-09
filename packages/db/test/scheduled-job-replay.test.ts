import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { JobRepository, type NewJob } from "../src/job-repository.js";

describe("scheduled immutable identity / real PG replay", () => {
  let pool: Pool;
  const workspaceId = randomUUID(), otherWorkspace = randomUUID(), owner = randomUUID(), otherOwner = randomUUID();
  const job = (): NewJob => ({ id: randomUUID(), workspaceId, jobType: "etl_full", payload: { workspaceId, media: "KUAISHOU", accountIds: ["synthetic-id"] }, credentialOwnerUserId: owner, priority: 5, maxAttempts: 3 });
  const repo = () => new JobRepository(pool, { workspaceId, jobTypes: ["etl_full"] });
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    const url = new URL(databaseUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_be_[a-z0-9_]+_test$/.test(url.pathname)) throw new Error("Dedicated local be test DB required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl });
    for (const id of [workspaceId, otherWorkspace]) await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic job replay')", [id]);
    for (const id of [owner, otherOwner]) await pool.query("INSERT INTO users(id,workspace_id,name) VALUES($1,$2,'synthetic owner')", [id, workspaceId]);
  });
  afterAll(async () => {
    if (!pool) return;
    for (const table of ["jobs", "users", "workspaces"]) await pool.query(`DELETE FROM ${table} WHERE ${table === "workspaces" ? "id" : "workspace_id"}=ANY($1::uuid[])`, [[workspaceId, otherWorkspace]]);
    await pool.end();
  });
  it("replay after protocol failure preserves backoff/error/attempts, then re-leases the original job", async () => {
    const input = job(), repository = repo();
    await repository.enqueueScheduled(input, { status: "queued" });
    const leased = await repository.leaseNext(60); expect(leased?.id).toBe(input.id);
    await repository.markRunning(leased!);
    await repository.markFailure(leased!, "synthetic protocol diagnostic", new Date(Date.now() + 60_000));
    const before = (await pool.query("SELECT * FROM jobs WHERE id=$1", [input.id])).rows[0];
    await expect(repository.enqueueScheduled(input, { status: "queued" })).resolves.toEqual({ id: input.id, inserted: false });
    expect((await pool.query("SELECT * FROM jobs WHERE id=$1", [input.id])).rows[0]).toEqual(before);
    expect(await repository.leaseNext(60)).toBeNull();
    await pool.query("UPDATE jobs SET run_after=now()-interval '1 second' WHERE id=$1", [input.id]);
    const retry = await repository.leaseNext(60);
    expect(retry).toMatchObject({ id: input.id, attempts: 2, credentialOwnerUserId: owner });
    expect(retry?.leaseToken).not.toBe(leased?.leaseToken);
    await repository.markRunning(retry!);
    await repository.markDone(retry!);
  });
  it.each(["leased", "running", "done", "failed", "blocked_auth"])("replay never mutates or revives existing %s job", async status => {
    const input = job(), repository = repo();
    await repository.enqueueScheduled(input, { status: "queued" });
    await pool.query(`UPDATE jobs SET status=$2,last_error='synthetic old error',attempts=1,
      lease_token=CASE WHEN $2 IN ('leased','running') THEN gen_random_uuid() ELSE NULL END,
      lease_until=CASE WHEN $2 IN ('leased','running') THEN now()+interval '1 minute' ELSE NULL END
      WHERE id=$1`, [input.id, status]);
    const before = (await pool.query("SELECT * FROM jobs WHERE id=$1", [input.id])).rows[0];
    await expect(repository.enqueueScheduled(input, { status: "queued" })).resolves.toEqual({ id: input.id, inserted: false });
    expect((await pool.query("SELECT * FROM jobs WHERE id=$1", [input.id])).rows[0]).toEqual(before);
    await pool.query("DELETE FROM jobs WHERE id=$1", [input.id]);
  });
  it("immutable payload/owner/workspace/type/priority/attempt budget mismatch still fails", async () => {
    const input = job(), repository = repo();
    await repository.enqueueScheduled(input, { status: "queued" });
    const variants: Partial<NewJob>[] = [{ payload: { different: true } }, { credentialOwnerUserId: otherOwner },
      { workspaceId: otherWorkspace }, { jobType: "etl_incr" }, { priority: 3 }, { maxAttempts: 4 }];
    for (const change of variants) await expect(repository.enqueueScheduled({ ...input, ...change }, { status: "queued" })).rejects.toThrow("conflicts");
    expect((await pool.query("SELECT attempts,status FROM jobs WHERE id=$1", [input.id])).rows[0]).toEqual({ attempts: 0, status: "queued" });
    await pool.query("DELETE FROM jobs WHERE id=$1", [input.id]);
  });
  it("concurrent identical replay inserts only one job", async () => {
    const input = job(), repository = repo();
    const results = await Promise.all(Array.from({ length: 8 }, () => repository.enqueueScheduled(input, { status: "queued" })));
    expect(results.filter(value => value.inserted)).toHaveLength(1);
    expect(results.every(value => value.id === input.id)).toBe(true);
    expect((await pool.query("SELECT count(*)::int n FROM jobs WHERE id=$1", [input.id])).rows[0].n).toBe(1);
  });
});
