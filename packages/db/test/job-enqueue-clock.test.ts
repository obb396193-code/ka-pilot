import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { JobRepository } from "../src/job-repository.js";

describe("immediate enqueue uses the lease clock / synthetic real PG", () => {
  let pool: Pool;
  const workspaceId = randomUUID();
  beforeAll(async () => {
    const databaseUrl = process.env.TEST_DATABASE_URL;
    if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
    await runMigrations({ databaseUrl }); pool = new Pool({ connectionString: databaseUrl });
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic clock')", [workspaceId]);
  });
  afterAll(async () => {
    vi.useRealTimers();
    if (!pool) return;
    await pool.query("DELETE FROM jobs WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]); await pool.end();
  });
  it.each(["ordinary", "scheduled"])("%s enqueue is immediately due even if the application clock is ahead", async (kind) => {
    const repository = new JobRepository(pool, { workspaceId, jobTypes: ["etl_full"] });
    const id = randomUUID();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2099-01-01T00:00:00Z"));
    try {
      const job = { id, workspaceId, jobType: "etl_full", payload: {}, credentialOwnerUserId: null };
      if (kind === "ordinary") await repository.enqueue(job);
      else await repository.enqueueScheduled(job, { status: "queued" });
    } finally { vi.useRealTimers(); }
    expect((await pool.query("SELECT run_after=created_at AS same_clock FROM jobs WHERE id=$1", [id])).rows[0]?.same_clock).toBe(true);
    const leased = await repository.leaseNext(60); expect(leased?.id).toBe(id);
    await repository.markRunning(leased!);
    await repository.markDone(leased!);
  });
  it("an explicit future runAfter is preserved and never claimed early", async () => {
    const repository = new JobRepository(pool, { workspaceId, jobTypes: ["etl_full"] });
    const runAfter = new Date("2099-01-01T00:00:00Z");
    const id = await repository.enqueue({ workspaceId, jobType: "etl_full", payload: {}, credentialOwnerUserId: null, runAfter });
    expect((await pool.query("SELECT run_after FROM jobs WHERE id=$1", [id])).rows[0]?.run_after).toEqual(runAfter);
    expect(await repository.leaseNext(60)).toBeNull();
  });
});
