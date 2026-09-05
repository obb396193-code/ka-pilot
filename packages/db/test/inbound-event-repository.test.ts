import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { GatewayRepository } from "../src/gateway-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";
describe("durable inbound repository (real PG)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repo = new GatewayRepository(pool);
  let workspace: string;
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => {
    workspace = (await pool.query("INSERT INTO workspaces(name) VALUES ('inbox-synthetic') RETURNING id")).rows[0].id;
  });
  const receive = () => repo.receiveInbound(workspace, "dingtalk", `event:${workspace}`, "robot_message", { encrypted: "synthetic" });
  const claim = () => repo.leaseInbound(workspace, "dingtalk", 30);
  async function expire(id: string) {
    await pool.query("UPDATE inbound_events SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1", [id]);
  }

  it("persists before handling, dedupes replay, rejects cross-scope collisions", async () => {
    expect(await receive()).toBe(true);
    expect(await receive()).toBe(false);
    await expect(repo.receiveInbound("00000000-0000-4000-8000-000000000001", "dingtalk", `event:${workspace}`, "robot_message", {})).rejects.toThrow("collision");
    await expect(repo.receiveInbound(workspace, "other", `event:${workspace}`, "robot_message", {})).rejects.toThrow("collision");
    const [a, b] = await Promise.all([claim(), claim()]);
    expect([a,b].filter(Boolean)).toHaveLength(1);
    expect((a ?? b)!.attempts).toBe(1);
  });
  it("fences expired and replaced attempts, scopes checkpoint/completion", async () => {
    await receive();
    const first = (await claim())!;
    await repo.renewInbound(first, 60);
    await expect(repo.renewInbound(first, 0)).rejects.toThrow();
    await expect(repo.checkpointInbound({ ...first, workspaceId: "00000000-0000-4000-8000-000000000001" }, { reply: "x" })).rejects.toThrow("lease");
    await expire(first.id);
    await expect(repo.completeInbound(first)).rejects.toThrow("lease");
    await expect(repo.renewInbound(first, 60)).rejects.toThrow("lease");
    const second = (await claim())!;
    expect(second.attempts).toBe(2);
    await expect(repo.failInbound(first, "PROCESSING_FAILED", 0)).rejects.toThrow("lease");
    await expect(repo.checkpointInbound(first, { reply: "old" })).rejects.toThrow("lease");
    await repo.checkpointInbound(second, { reply: "saved" });
    await repo.completeInbound(second);
    expect(await claim()).toBeNull();
    const row = (await pool.query("SELECT * FROM inbound_events WHERE id=$1", [first.id])).rows[0];
    expect(row.processed).toBe(true);
    expect(row.processed_at).toBeInstanceOf(Date);
    expect(row.payload.checkpoint).toEqual({ reply: "saved" });
  });
  it("retries failure, preserves checkpoint, then dead without deleting row", async () => {
    await receive();
    await pool.query("UPDATE inbound_events SET max_attempts=2 WHERE workspace_id=$1", [workspace]);
    const first = (await claim())!;
    await repo.checkpointInbound(first, { reply: "done" });
    await repo.failInbound(first, "PROCESSING_FAILED", 0);
    const second = (await claim())!;
    expect(second.payload.checkpoint).toEqual({ reply: "done" });
    await repo.failInbound(second, "PROCESSING_FAILED", 0);
    expect(await claim()).toBeNull();
    const row = (await pool.query("SELECT * FROM inbound_events WHERE id=$1", [first.id])).rows[0];
    expect(row).toMatchObject({ processed: false, attempts: 2, last_error: "PROCESSING_FAILED" });
  });
  it("counts crash claims toward max and quarantines exhausted leases", async () => {
    await receive();
    await pool.query("UPDATE inbound_events SET max_attempts=1 WHERE workspace_id=$1", [workspace]);
    const first = (await claim())!;
    await expire(first.id);
    expect(await claim()).toBeNull();
    const row = (await pool.query("SELECT last_error FROM inbound_events WHERE id=$1", [first.id])).rows[0];
    expect(row.last_error).toBe("ATTEMPTS_EXHAUSTED");
  });
  it("rejects invalid lease/oversized payload/raw errors and respects retry delay", async () => {
    await expect(repo.leaseInbound(workspace, "dingtalk", 0)).rejects.toThrow();
    await expect(repo.receiveInbound(workspace, "dingtalk", "large", "robot_message", { text: "x".repeat(262144) })).rejects.toThrow();
    await receive();
    const first = (await claim())!;
    await expect(repo.failInbound(first, "https://secret" as "PROCESSING_FAILED", 0)).rejects.toThrow();
    await repo.failInbound(first, "PROCESSING_FAILED", 60);
    expect(await claim()).toBeNull();
  });
  it("does not consume other event kinds or workspaces", async () => {
    await repo.receiveInbound(workspace, "dingtalk", `card:${workspace}`, "card_callback", {});
    expect(await claim()).toBeNull();
    await receive();
    expect(await repo.leaseInbound("00000000-0000-4000-8000-000000000001", "dingtalk", 30)).toBeNull();
    const leased = (await claim())!;
    expect(leased.externalEventId).toBe(`event:${workspace}`);
  });
});
