import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { JobRepository } from "../src/job-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit isolated TEST_DATABASE_URL required");
describe("bounded workspace job lease and recovery / real PG", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const spaces: string[] = [];
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterEach(async () => {
    await pool.query("DELETE FROM jobs WHERE workspace_id=ANY($1::uuid[])", [spaces]);
    await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [spaces.splice(0)]);
  });
  afterAll(async () => { await pool.end(); });
  async function space() { const id = randomUUID(); spaces.push(id); await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic lease scope')", [id]); return id; }
  async function enqueue(workspaceId: string, jobType: string, priority = 5) {
    return new JobRepository(pool).enqueue({ workspaceId, jobType, payload: {}, priority, credentialOwnerUserId: null, runAfter: new Date("2020-01-01T00:00:00Z") });
  }
  it("never claims another workspace or an unregistered job type, even at higher priority", async () => {
    const own = await space(), other = await space();
    const foreign = await enqueue(other, "etl_full", 1), write = await enqueue(own, "changeset_execute", 1);
    const expected = await enqueue(own, "etl_full");
    const jobs = new JobRepository(pool, { workspaceId: own, jobTypes: ["etl_full"] });
    const leased = await jobs.leaseNext(60); expect(leased?.id).toBe(expected);
    expect(await jobs.leaseNext(60)).toBeNull();
    expect((await pool.query("SELECT status FROM jobs WHERE id=ANY($1::uuid[])", [[foreign, write]])).rows).toEqual([{ status: "queued" }, { status: "queued" }]);
  });
  it("scoped concurrent consumers preserve single lease and immutable selector", async () => {
    const own = await space(), other = await space();
    const expected = await enqueue(own, "etl_full"); await enqueue(other, "etl_full", 1);
    const selector = { workspaceId: own, jobTypes: ["etl_full"] };
    const jobs = new JobRepository(pool, selector); selector.workspaceId = other; selector.jobTypes.push("changeset_execute");
    const results = await Promise.all([jobs.leaseNext(60), jobs.leaseNext(60)]);
    expect(results.filter(Boolean)).toHaveLength(1); expect(results.find(Boolean)?.id).toBe(expected);
  });
  it("expired recovery changes only its workspace/type and retains terminal max-attempt handling", async () => {
    const own = await space(), other = await space();
    const retry = await enqueue(own, "etl_full"), exhausted = await enqueue(own, "etl_full");
    const foreign = await enqueue(other, "etl_full"), write = await enqueue(own, "changeset_execute");
    await pool.query("UPDATE jobs SET status='running',attempts=1,lease_until=now()-interval '1 minute',lease_token=gen_random_uuid() WHERE id=ANY($1::uuid[])", [[retry, exhausted, foreign, write]]);
    await pool.query("UPDATE jobs SET attempts=max_attempts WHERE id=$1", [exhausted]);
    const result = await new JobRepository(pool, { workspaceId: own, jobTypes: ["etl_full"] }).recoverStaleLeases(1);
    expect(result.requeued).toBe(1); expect(result.failed.map((row) => row.id)).toEqual([exhausted]);
    expect((await pool.query("SELECT status FROM jobs WHERE id=ANY($1::uuid[])", [[foreign, write]])).rows).toEqual([{ status: "running" }, { status: "running" }]);
  });
  it("scope constructor rejects empty/invalid selectors before touching PG", () => {
    for (const scope of [null, {}, { workspaceId: "bad", jobTypes: ["etl_full"] }, { workspaceId: randomUUID(), jobTypes: [] }, { workspaceId: randomUUID(), jobTypes: ["etl_full", "etl_full"] }, { workspaceId: randomUUID(), jobTypes: ["a' OR 1=1"] }, { workspaceId: randomUUID(), jobTypes: ["etl_full"], extra: true }]) {
      // Deliberately malicious runtime input, not a widening of the typed production interface.
      expect(() => new JobRepository(pool, scope as never)).toThrow("Invalid job lease scope");
    }
  });
  it("one-shot scope cannot re-execute an exhausted lease in the recovery grace interval", async () => {
    const own = await space(); const id = await enqueue(own, "etl_full");
    await pool.query("UPDATE jobs SET status='running',attempts=max_attempts,lease_until=now()-interval '100 milliseconds',lease_token=gen_random_uuid() WHERE id=$1", [id]);
    const scoped = new JobRepository(pool, { workspaceId: own, jobTypes: ["etl_full"] });
    expect(await scoped.leaseNext(60)).toBeNull();
    expect((await pool.query("SELECT attempts,max_attempts,status FROM jobs WHERE id=$1", [id])).rows[0]).toMatchObject({ attempts: 3, max_attempts: 3, status: "running" });
  });
});
