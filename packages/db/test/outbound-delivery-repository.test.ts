import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextOutboundDeliveryState, prepareOutboundBusinessIdentity } from "@ka/domain";
import { runMigrations } from "../src/migrate.js";
import { OutboundDeliveryRepository } from "../src/outbound-delivery-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "";
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1"].includes(target.hostname) || target.port !== "55432" || !/^\/ka_[a-z0-9_]+_test$/.test(target.pathname)) throw new Error("Isolated local test database required");
describe("P198 durable delivery / synthetic real PG", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5 }), ws = randomUUID(), foreign = randomUUID();
  const repo = new OutboundDeliveryRepository(pool);
  const payload = { jobId: randomUUID() };
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  const cleanup = async () => {
    await pool.query("DELETE FROM outbound_messages WHERE workspace_id=ANY($1::uuid[])", [[ws,foreign]]);
    await pool.query("DELETE FROM etl_runs WHERE workspace_id=ANY($1::uuid[])", [[ws,foreign]]);
    await pool.query("DELETE FROM jobs WHERE workspace_id=ANY($1::uuid[])", [[ws,foreign]]);
  };
  beforeEach(cleanup);
  afterAll(async () => { await cleanup(); await pool.end(); });
  const enqueue = async (workspace = ws, channel = "dingtalk", data: unknown = payload) => {
    const id = randomUUID();
    await pool.query("INSERT INTO outbound_messages(id,workspace_id,channel,target,kind,payload) VALUES($1,$2,$3,$4,'job_failed',$5)", [id, workspace, channel, `workspace:${workspace}:admins`, data]);
    return id;
  };
  const row = async (id: string) => (await pool.query("SELECT * FROM outbound_messages WHERE id=$1", [id])).rows[0];
  const claimed = async () => { const value = await repo.claim(ws); if(value === null || "maintenanceLimit" in value) throw new Error("Expected one real claim"); return value; };
  const expire = async (id: string) => { await pool.query("UPDATE outbound_messages SET claimed_at=now()-interval '2 minutes',lease_until=now()-interval '1 minute' WHERE id=$1", [id]); };
  const due = async (id: string) => { await pool.query("UPDATE outbound_messages SET run_after=now()-interval '1 second' WHERE id=$1", [id]); };
  const attempt = (c: Awaited<ReturnType<typeof claimed>>) => ({ attempts: c.attempts, consecutiveUnknown: c.consecutiveUnknown, observedAt: new Date().toISOString() });
  const success = (c: Awaited<ReturnType<typeof claimed>>) => nextOutboundDeliveryState(attempt(c), { kind: "acknowledged" });

  it("concurrent claims take one row once; workspace and inbox remain untouched", async () => {
    const id = await enqueue(), f = await enqueue(foreign), inbox = await enqueue(ws, "inbox");
    const results = await Promise.all([repo.claim(ws), repo.claim(ws)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.find(Boolean)).toMatchObject({ id, workspaceId: ws, attempts: 1, channel: "dingtalk", sentAt: null });
    expect((await row(id)).dedupe_key).toMatch(/^outbound:v1:/);
    expect((await row(f)).status).toBe("queued"); expect((await row(inbox)).status).toBe("queued");
  });
  it("persists successful acknowledgement with fencing and rejects stale or foreign writers", async () => {
    const id = await enqueue(), c = await claimed();
    await expect(repo.finish({ ...c, leaseToken: randomUUID() }, success(c))).rejects.toThrow("OUTBOUND_STORE_FAILED");
    await expect(repo.finish({ ...c, workspaceId: foreign }, success(c))).rejects.toThrow("OUTBOUND_STORE_FAILED");
    expect((await row(id)).status).toBe("sending");
    await repo.finish(c, success(c));
    expect(await row(id)).toMatchObject({ status: "sent", attempts: 1, lease_token: null, fail_reason: null });
    expect((await row(id)).sent_at).toBeInstanceOf(Date);
    await expect(repo.finish(c, success(c))).rejects.toThrow("OUTBOUND_STORE_FAILED");
    expect(await repo.claim(ws)).toBeNull();
  });
  it("expired sending becomes unknown without immediate resend; a second lost result is terminal", async () => {
    const id = await enqueue(), first = await claimed(); await expire(id);
    await expect(repo.finish(first, success(first))).rejects.toThrow("OUTBOUND_STORE_FAILED");
    expect(await repo.claim(ws)).toBeNull();
    expect(await row(id)).toMatchObject({ status: "queued", attempts: 1, consecutive_unknown: 1, fail_reason: "UNKNOWN_OUTCOME" });
    await due(id); const second = await claimed(); expect(second.attempts).toBe(2); expect(second.leaseToken).not.toBe(first.leaseToken);
    await expire(id); expect(await repo.claim(ws)).toBeNull();
    expect(await row(id)).toMatchObject({ status: "failed", attempts: 2, consecutive_unknown: 2, sent_at: null, fail_reason: "UNKNOWN_OUTCOME" });
  });
  it("fences again at the final write when the lease expires after initial ownership check", async () => {
    await enqueue(); const c = await claimed();
    const client = await pool.connect(), original = client.query.bind(client);
    const query = vi.spyOn(client,"query").mockImplementation((async (sql: string, params?: unknown[]) => {
      if(sql === "SELECT clock_timestamp() AS at") await original("UPDATE outbound_messages SET claimed_at=now()-interval '2 minutes',lease_until=now()-interval '1 minute' WHERE id=$1", [c.id]);
      return original(sql,params);
    }) as typeof client.query);
    const connect = vi.spyOn(pool,"connect").mockImplementation((async () => client) as typeof pool.connect);
    try { await expect(repo.finish(c,success(c))).rejects.toThrow("OUTBOUND_STORE_FAILED"); }
    finally { query.mockRestore(); connect.mockRestore(); }
    expect((await row(c.id)).status).toBe("sending");
  });
  it("five known failed attempts exhaust; future run_after is not claimed", async () => {
    const id = await enqueue();
    for (let n = 1; n <= 5; n++) {
      const c = await claimed(); expect(c.attempts).toBe(n);
      await repo.finish(c, nextOutboundDeliveryState(attempt(c), { kind: "retryable_failure", reason: "REMOTE_UNAVAILABLE" }));
      expect(await repo.claim(ws)).toBeNull(); if(n < 5) await due(id);
    }
    expect(await row(id)).toMatchObject({ status: "failed", attempts: 5, fail_reason: "ATTEMPTS_EXHAUSTED", sent_at: null });
  });
  it("real sent-only evidence yields deduplicated with the original id and no fake sent_at", async () => {
    const original = await enqueue(), first = await claimed(); await repo.finish(first, success(first));
    const id = await enqueue(), c = await claimed();
    expect(await repo.findRecentSent(c, new Date().toISOString())).toMatchObject({ workspaceId: ws, dedupeKey: c.dedupeKey });
    await repo.markDeduplicated(c);
    expect(await row(id)).toMatchObject({ status: "deduplicated", dedupe_of: original, sent_at: null, fail_reason: null });
  });
  it("does not dedupe failed rows or old sent rows and rechecks evidence before marking", async () => {
    const id = await enqueue(), first = await claimed(); await repo.finish(first, success(first));
    await pool.query("UPDATE outbound_messages SET sent_at=now()-interval '25 hours' WHERE id=$1", [id]);
    await enqueue(); const c = await claimed();
    expect(await repo.findRecentSent(c, new Date().toISOString())).toBeNull();
    await expect(repo.markDeduplicated(c)).rejects.toThrow("OUTBOUND_STORE_FAILED");
    expect((await row(c.id)).status).toBe("sending");
  });
  it("legacy sent history is compared without rewriting it, malformed queued rows fail but do not starve the next row", async () => {
    const original = await enqueue();
    await pool.query("UPDATE outbound_messages SET status='sent',sent_at=now(),attempts=1 WHERE id=$1", [original]);
    const bad = await enqueue(ws, "dingtalk", {}), id = await enqueue(); const c = await claimed();
    expect(c.id).toBe(id); expect((await row(bad)).fail_reason).toBe("UNSUPPORTED_MESSAGE");
    await repo.markDeduplicated(c);
    expect((await row(id)).dedupe_of).toBe(original); expect((await row(original)).dedupe_key).toBeNull();
  });
  it("rejects invalid scope, invalid claimed state, and forged success shape without leaking driver data", async () => {
    await expect(repo.claim("not-uuid")).rejects.toThrow("OUTBOUND_STORE_FAILED");
    await enqueue(); const c = await claimed();
    await expect(repo.finish(c, { ...success(c), consecutiveUnknown: 1 })).rejects.toThrow("OUTBOUND_STORE_FAILED");
    expect((await row(c.id)).status).toBe("sending");
  });
  it("uses same-workspace job date then actual run-kind date, ignores foreign and future run hints", async () => {
    await pool.query("INSERT INTO jobs(id,workspace_id,job_type,payload) VALUES($1,$2,'etl_full',$3)", [payload.jobId,ws,{businessDate:"2026-09-01"}]);
    await pool.query("INSERT INTO etl_runs(workspace_id,job_id,run_kind,scope,started_at) VALUES($1,$2,'full',$3,now()-interval '1 hour')", [ws,payload.jobId,{asOfDate:"2026-09-02"}]);
    const id = await enqueue(), c = await claimed(), stored = await row(id);
    const expected = (jobBusinessDate: string | null, runBusinessDate: string | null) => prepareOutboundBusinessIdentity({workspaceId:ws,kind:c.kind,target:c.target,payload,createdAt:stored.created_at.toISOString(),jobBusinessDate,runBusinessDate}).dedupeKey;
    expect(c.dedupeKey).toBe(expected("2026-09-01","2026-09-02"));
    await pool.query("DELETE FROM outbound_messages WHERE id=$1", [id]);
    await pool.query("DELETE FROM jobs WHERE id=$1", [payload.jobId]);
    await pool.query("INSERT INTO etl_runs(workspace_id,job_id,run_kind,scope,started_at) VALUES($1,$2,'full',$3,now()+interval '1 hour'),($4,$2,'full',$3,now()-interval '1 minute')", [ws,payload.jobId,{asOfDate:"2026-09-03"},foreign]);
    await enqueue(); expect((await claimed()).dedupeKey).toBe(expected(null,"2026-09-02"));
  });
  it("invalid stored job date fails the row rather than silently substituting enqueue date", async () => {
    await pool.query("INSERT INTO jobs(id,workspace_id,job_type,payload) VALUES($1,$2,'etl_full',$3)", [payload.jobId,ws,{businessDate:"2026-02-31"}]);
    const id = await enqueue(); expect(await repo.claim(ws)).toBeNull();
    expect(await row(id)).toMatchObject({status:"failed",fail_reason:"UNSUPPORTED_MESSAGE",sent_at:null});
  });
  it("evidence cap does not silently skip history and send duplicates", async () => {
    await pool.query(`INSERT INTO outbound_messages(workspace_id,channel,target,kind,payload,status,attempts,sent_at)
      SELECT $1,'dingtalk',$2,'job_failed',$3,'sent',1,now() FROM generate_series(1,1001)`, [ws,`workspace:${ws}:admins`,payload]);
    await enqueue(); const c = await claimed();
    await expect(repo.findRecentSent(c,new Date().toISOString())).rejects.toThrow("OUTBOUND_STORE_FAILED");
    expect((await row(c.id)).status).toBe("sending");
  });
  it("bounds housekeeping and preserves remaining queued rows for a later pass", async () => {
    await pool.query(`INSERT INTO outbound_messages(workspace_id,channel,target,kind,payload)
      SELECT $1,'dingtalk',$2,'job_failed','{}' FROM generate_series(1,101)`, [ws,`workspace:${ws}:admins`]);
    expect(await repo.claim(ws)).toEqual({maintenanceLimit:true});
    expect((await pool.query("SELECT count(*)::int AS n FROM outbound_messages WHERE workspace_id=$1 AND status='queued'", [ws])).rows[0].n).toBe(1);
    expect(await repo.claim(ws)).toBeNull();
  });
  it("counts metadata overhead as well as payload before returning near-16MiB sent evidence", async () => {
    await pool.query(`INSERT INTO outbound_messages(workspace_id,channel,target,kind,payload,status,attempts,sent_at)
      VALUES($1,'dingtalk',$2,'job_failed',jsonb_build_object('jobId',$3::text,'padding',repeat('x',16777000)),'sent',1,now())`,[ws,`workspace:${ws}:admins`,payload.jobId]);
    await enqueue(); const c=await claimed();
    await expect(repo.findRecentSent(c,new Date().toISOString())).rejects.toThrow("OUTBOUND_STORE_FAILED");
    expect((await row(c.id)).status).toBe("sending");
  });
});
