import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { PersistentChangeSetFollowUps } from "../src/changeset-follow-up.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";
describe("T1 durable scheduling (synthetic PG)", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const scheduler = new PersistentChangeSetFollowUps(pool, { firstCheckDelayMs: 86_400_000 });
  let workspaceId: string, other: string, changeSetId: string, owner: string, initiator: string, ids: number[];
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => {
    const workspaces = await pool.query("INSERT INTO workspaces(name) VALUES($1),($2) RETURNING id", [randomUUID(), randomUUID()]);
    workspaceId = workspaces.rows[0].id; other = workspaces.rows[1].id;
    const users = await pool.query("INSERT INTO users(workspace_id,name) VALUES($1,'synthetic-owner'),($1,'synthetic-initiator') RETURNING id", [workspaceId]);
    owner = users.rows[0].id; initiator = users.rows[1].id;
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic')", [workspaceId]);
    // Explicit terminal evidence fixture; production create never synthesizes execution success.
    changeSetId = (await pool.query(`INSERT INTO changesets(workspace_id,media,account_id,status,initiator,credential_owner_user_id,executed_at)
      VALUES($1,'KUAISHOU','synthetic','partial',$2,$3,'2026-09-06T10:00:00Z') RETURNING id`, [workspaceId, initiator, owner])).rows[0].id;
    const items = await pool.query(`INSERT INTO changeset_items(changeset_id,workspace_id,media,account_id,target_type,target_id,field,from_value,to_value,item_status)
      SELECT $1,$2,'KUAISHOU','synthetic','unit',n::text,'bid','{"type":"number","value":1}'::jsonb,'{"type":"number","value":2}'::jsonb,
        CASE WHEN n=3 THEN 'failed' ELSE 'success' END FROM generate_series(1,3) n RETURNING id`, [changeSetId, workspaceId]);
    ids = items.rows.map((row) => Number(row.id));
  });
  const readJobs = () => pool.query("SELECT id,payload,credential_owner_user_id,status,run_after FROM jobs WHERE workspace_id=$1 AND job_type='t1_recycle' ORDER BY payload->>'itemId'", [workspaceId]);
  const input = () => ({ workspaceId, changeSetId, successfulItemIds: ids.slice(0, 2) });

  it("deduplicates concurrent/replayed requests and binds the original credential owner", async () => {
    await Promise.all([scheduler.scheduleT1(input()), scheduler.scheduleT1({ ...input(), successfulItemIds: ids.slice(0, 2).reverse() })]);
    const jobs = await readJobs();
    expect(jobs.rows).toHaveLength(2);
    expect(jobs.rows.map((row) => row.payload.itemId).sort((a, b) => a - b)).toEqual(ids.slice(0, 2));
    for (const row of jobs.rows) {
      expect(row.credential_owner_user_id).toBe(owner);
      expect(row.payload).toMatchObject({ workspaceId, changeSetId, initiatorUserId: initiator, credentialOwnerUserId: owner, media: "KUAISHOU", accountId: "synthetic" });
      expect(row.run_after.toISOString()).toBe("2026-09-07T10:00:00.000Z");
    }
  });
  it("never resets a done job or reschedules it under a changed first-check policy", async () => {
    await scheduler.scheduleT1(input());
    await pool.query("UPDATE jobs SET status='done' WHERE workspace_id=$1", [workspaceId]);
    const before = (await readJobs()).rows;
    await new PersistentChangeSetFollowUps(pool, { firstCheckDelayMs: 7 * 86_400_000 }).scheduleT1(input());
    expect((await readJobs()).rows).toEqual(before);
  });
  it("rejects failed items and another workspace before enqueueing anything", async () => {
    await expect(scheduler.scheduleT1({ ...input(), successfulItemIds: ids })).rejects.toThrow();
    await expect(scheduler.scheduleT1({ ...input(), workspaceId: other })).rejects.toThrow();
    expect((await readJobs()).rows).toHaveLength(0);
  });
  it("rejects an item whose same account id belongs to another media", async () => {
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'TENCENT','synthetic')", [workspaceId]);
    await pool.query("UPDATE changeset_items SET media='TENCENT' WHERE id=$1", [ids[0]]);
    await expect(scheduler.scheduleT1(input())).rejects.toThrow();
    expect((await readJobs()).rows).toHaveLength(0);
  });
  it("rejects a team source and keeps inactive users bound rather than falling back", async () => {
    await pool.query("UPDATE users SET is_active=false WHERE id=$1", [owner]);
    await scheduler.scheduleT1(input());
    expect((await readJobs()).rows.every((row) => row.credential_owner_user_id === owner)).toBe(true);
    await pool.query("UPDATE workspaces SET kind='team' WHERE id=$1", [workspaceId]);
    await expect(scheduler.scheduleT1(input())).rejects.toThrow();
  });
  it("rolls back earlier item inserts when a later deterministic job conflicts", async () => {
    await scheduler.scheduleT1(input());
    const secondId = (await readJobs()).rows.find((row) => row.payload.itemId === ids[1])!.id;
    await pool.query("DELETE FROM jobs WHERE workspace_id=$1", [workspaceId]);
    await pool.query("INSERT INTO jobs(id,workspace_id,job_type,payload,credential_owner_user_id) VALUES($1,$2,'t1_recycle','{}',$3)", [secondId, workspaceId, owner]);
    await expect(scheduler.scheduleT1(input())).rejects.toThrow("conflicts");
    const jobs = await readJobs();
    expect(jobs.rows).toHaveLength(1);
    expect(jobs.rows[0].payload).toEqual({});
  });
});
