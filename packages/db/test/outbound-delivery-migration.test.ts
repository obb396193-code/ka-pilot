import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrate.js";
import { windowSize } from "./migration-window.js";
const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(target.pathname)) throw new Error("Isolated local test database required");
describe("P198 outbound durable state migration / synthetic real PG", { timeout: 30000 }, () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 }), a = randomUUID(), b = randomUUID();
  const key = `outbound:v1:${"a".repeat(64)}`;
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => {
    try { await pool.query("DELETE FROM outbound_messages WHERE workspace_id=ANY($1::uuid[])", [[a,b]]); await runMigrations({ databaseUrl }); }
    finally { await pool.end(); }
  });
  it("installs actual bounded durable state columns", async () => {
    const rows = (await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='outbound_messages'")).rows;
    expect(rows.map(r => r.column_name)).toEqual(expect.arrayContaining(["dedupe_key", "dedupe_of", "run_after", "claimed_at", "lease_token", "lease_until", "consecutive_unknown"]));
    expect(await runMigrations({ databaseUrl })).toEqual([]);
  });
  it("up/down/up preserves queued and sent history without inventing keys/times", async () => {
    const width = windowSize("030");
    expect(await runMigrations({ databaseUrl, direction: "down", count: width })).toHaveLength(width);
    const id = randomUUID(), sentId = randomUUID();
    await pool.query("INSERT INTO outbound_messages(id,workspace_id,channel,target,kind,payload,status,created_at) VALUES($1,$2,'dingtalk','synthetic','job_failed','{}','queued','2026-09-01T00:00Z')", [id,a]);
    await pool.query("INSERT INTO outbound_messages(id,workspace_id,channel,target,kind,payload,status,attempts,sent_at,created_at) VALUES($1,$2,'dingtalk','synthetic','job_failed','{}','sent',1,'2026-09-01T01:00Z','2026-09-01T00:00Z')", [sentId,a]);
    try {
      expect(await runMigrations({ databaseUrl })).toHaveLength(width);
      expect((await pool.query("SELECT status,dedupe_key,run_after,consecutive_unknown,created_at FROM outbound_messages WHERE id=$1", [id])).rows[0])
        .toEqual({ status: "queued", dedupe_key: null, run_after: null, consecutive_unknown: 0, created_at: new Date("2026-09-01T00:00Z") });
      expect(await runMigrations({ databaseUrl, direction: "down", count: width })).toHaveLength(width);
      expect(await runMigrations({ databaseUrl })).toHaveLength(width);
      expect((await pool.query("SELECT status,dedupe_key,sent_at,created_at FROM outbound_messages WHERE id=$1", [sentId])).rows[0])
        .toEqual({ status: "sent", dedupe_key: null, sent_at: new Date("2026-09-01T01:00Z"), created_at: new Date("2026-09-01T00:00Z") });
    } finally { await pool.query("DELETE FROM outbound_messages WHERE id=ANY($1::uuid[])", [[id,sentId]]); }
  });
  it.each([
    { status: "sent", attempts: 1, sent: null },
    { status: "sending", attempts: 1, sent: null },
    { status: "queued", attempts: 6, sent: null },
    { status: "deduplicated", attempts: 1, sent: null },
    { status: "other", attempts: 1, sent: null },
  ])("invalid managed state rejected by PostgreSQL %j", async ({ status, attempts, sent }) => {
    await expect(pool.query(`INSERT INTO outbound_messages(workspace_id,channel,target,kind,payload,status,attempts,sent_at,dedupe_key)
      VALUES($1,'dingtalk','synthetic','job_failed','{}',$2,$3,$4,$5)`, [a,status,attempts,sent,key])).rejects.toMatchObject({ code: "23514" });
  });
  it("dedupe_of cannot reference another workspace or itself; sent_at remains null", async () => {
    const first = randomUUID(), duplicate = randomUUID();
    await pool.query(`INSERT INTO outbound_messages(id,workspace_id,channel,target,kind,payload,status,attempts,sent_at,dedupe_key)
      VALUES($1,$2,'dingtalk','synthetic','job_failed','{}','sent',1,now(),$3)`, [first,a,key]);
    try {
      const insert = (ws: string, ref: string) => pool.query(`INSERT INTO outbound_messages(id,workspace_id,channel,target,kind,payload,status,attempts,dedupe_key,dedupe_of)
        VALUES($1,$2,'dingtalk','synthetic','job_failed','{}','deduplicated',1,$3,$4)`, [duplicate,ws,key,ref]);
      await expect(insert(b, first)).rejects.toMatchObject({ code: "23503" });
      await expect(insert(a, duplicate)).rejects.toMatchObject({ code: "23514" });
      await insert(a, first);
      expect((await pool.query("SELECT status,sent_at,dedupe_of FROM outbound_messages WHERE id=$1", [duplicate])).rows[0])
        .toEqual({ status: "deduplicated", sent_at: null, dedupe_of: first });
      await expect(runMigrations({ databaseUrl, direction: "down", count: windowSize("030") })).rejects.toThrow(/outbound.*cannot downgrade losslessly/);
      expect((await pool.query("SELECT dedupe_of FROM outbound_messages WHERE id=$1", [duplicate])).rows[0].dedupe_of).toBe(first);
    } finally {
      await pool.query("DELETE FROM outbound_messages WHERE id=$1", [duplicate]);
      await pool.query("DELETE FROM outbound_messages WHERE id=$1", [first]);
    }
  });
});
