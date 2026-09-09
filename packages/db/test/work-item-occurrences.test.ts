import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { WorkItemRepository } from "../src/work-item-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("Explicit dedicated TEST_DATABASE_URL required");
const url = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.port !== "55432" || !/^\/ka_[a-z0-9_]*_test$/.test(url.pathname))
  throw new Error("Dedicated local ka_*_test database required");

describe("work-item occurrence persistence real PostgreSQL", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, connectionTimeoutMillis: 3000 });
  const repository = new WorkItemRepository(pool), owned: string[] = [];
  let workspaceId: string, otherWorkspace: string;
  const input = () => ({ workspaceId, media: "KUAISHOU", accountId: "synthetic-account", ruleId: 17,
    type: "diagnosis" as const, severity: "P1" as const, title: "synthetic alert", evidenceSnapshot: { synthetic: true } });
  const stored = async (id: string) => (await pool.query(
    "SELECT occurrence_count,last_triggered_at,status,title FROM work_items WHERE workspace_id=$1 AND id=$2", [workspaceId, id])).rows[0];
  beforeAll(async () => { await runMigrations({ databaseUrl }); }, 30000);
  beforeEach(async () => {
    workspaceId = randomUUID(); otherWorkspace = randomUUID(); owned.push(workspaceId, otherWorkspace);
    await pool.query("INSERT INTO workspaces(id,name) VALUES($1,'synthetic occurrences'),($2,'synthetic isolated')", [workspaceId, otherWorkspace]);
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU','synthetic-account'),($1,'TENCENT','synthetic-account'),($2,'KUAISHOU','synthetic-account')", [workspaceId, otherWorkspace]);
  });
  afterAll(async () => {
    try {
      await pool.query("DELETE FROM work_items WHERE workspace_id=ANY($1::uuid[])", [owned]);
      await pool.query("DELETE FROM accounts WHERE workspace_id=ANY($1::uuid[])", [owned]);
      await pool.query("DELETE FROM workspaces WHERE id=ANY($1::uuid[])", [owned]);
    } finally { await pool.end(); }
  });
  it("records the first observed trigger in storage", async () => {
    const { workItem } = await repository.createOrMergeAlert(input());
    const row = await stored(workItem.id);
    expect(row).toMatchObject({ occurrence_count: 1, last_triggered_at: expect.any(Date), status: "open" });
    expect(row.last_triggered_at.getTime()).toBe(workItem.createdAt.getTime());
  });
  it("increments equal/lower signals without downgrading or reopening a processing item", async () => {
    const { workItem } = await repository.createOrMergeAlert(input());
    await repository.transition({ workspaceId, workItemId: workItem.id, action: "start_processing" });
    await pool.query("UPDATE work_items SET last_triggered_at='2001-01-01' WHERE id=$1", [workItem.id]);
    for (const severity of ["P1", "P2"] as const) {
      const result = await repository.createOrMergeAlert({ ...input(), severity });
      expect(result).toMatchObject({ disposition: "merged", workItem: { id: workItem.id, severity: "P1", status: "processing" } });
    }
    expect(await stored(workItem.id)).toMatchObject({ occurrence_count: 3, last_triggered_at: expect.any(Date) });
    expect((await stored(workItem.id)).last_triggered_at.getUTCFullYear()).toBeGreaterThan(2001);
  });
  it("does not lose increments when ten signals race on a dispatched item", async () => {
    const { workItem } = await repository.createOrMergeAlert(input());
    await pool.query("UPDATE work_items SET status='dispatched' WHERE id=$1", [workItem.id]);
    const results = await Promise.all(Array.from({ length: 10 }, () => repository.createOrMergeAlert(input())));
    expect(results.every(r => r.disposition === "merged" && r.workItem.id === workItem.id)).toBe(true);
    expect(await stored(workItem.id)).toMatchObject({ occurrence_count: 11, status: "dispatched" });
    expect((await pool.query("SELECT count(*)::int AS count FROM work_items WHERE workspace_id=$1", [workspaceId])).rows[0].count).toBe(1);
  });
  it("does not count another medium or workspace as a repeat", async () => {
    const original = await repository.createOrMergeAlert(input());
    const otherMedia = await repository.createOrMergeAlert({ ...input(), media: "TENCENT" });
    await repository.createOrMergeAlert({ ...input(), workspaceId: otherWorkspace });
    await repository.createOrMergeAlert({ ...input(), media: "TENCENT" });
    expect(await stored(original.workItem.id)).toMatchObject({ occurrence_count: 1 });
    expect(await stored(otherMedia.workItem.id)).toMatchObject({ occurrence_count: 2 });
    expect((await pool.query("SELECT occurrence_count FROM work_items WHERE workspace_id=$1", [otherWorkspace])).rows).toEqual([{ occurrence_count: 1 }]);
  });
  it.each([null, 0, -1, 2147483647])("rejects invalid/overflow existing counter %s atomically", async count => {
    const { workItem } = await repository.createOrMergeAlert(input());
    await pool.query("UPDATE work_items SET occurrence_count=$2,last_triggered_at='2001-01-01' WHERE id=$1", [workItem.id, count]);
    const before = await stored(workItem.id);
    await expect(repository.createOrMergeAlert({ ...input(), title: "must not persist" })).rejects.toThrow();
    expect(await stored(workItem.id)).toEqual(before);
  });
  it("allows the last representable count but never wraps or saturates it", async () => {
    const { workItem } = await repository.createOrMergeAlert(input());
    await pool.query("UPDATE work_items SET occurrence_count=2147483646 WHERE id=$1", [workItem.id]);
    await repository.createOrMergeAlert(input());
    expect(await stored(workItem.id)).toMatchObject({ occurrence_count: 2147483647 });
    const before = await stored(workItem.id);
    await expect(repository.createOrMergeAlert(input())).rejects.toThrow();
    expect(await stored(workItem.id)).toEqual(before);
  });
  it("starts a new occurrence series after a terminal item", async () => {
    const original = await repository.createOrMergeAlert(input());
    await repository.createOrMergeAlert(input());
    await repository.transition({ workspaceId, workItemId: original.workItem.id, action: "ignore" });
    const fresh = await repository.createOrMergeAlert(input());
    expect(fresh.workItem.id).not.toBe(original.workItem.id);
    expect(await stored(original.workItem.id)).toMatchObject({ occurrence_count: 2, status: "ignored" });
    expect(await stored(fresh.workItem.id)).toMatchObject({ occurrence_count: 1, status: "open", last_triggered_at: expect.any(Date) });
  });
});
