import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, GatewayRepository, runMigrations } from "@ka/db";
import { InboxCodec } from "../src/inbox-codec.js";
import { createInboxReceiver, createInboxWorker } from "../src/inbox-worker.js";
import { receiveRobotMessage } from "../src/dingtalk-adapter.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)("inbox receive/restart real PG integration", () => {
  const pool = createPool(databaseUrl ?? "postgres://unused/skip");
  const inbound = new GatewayRepository(pool);
  const codec = new InboxCodec("22".repeat(32));
  beforeAll(async () => { await runMigrations({ databaseUrl: databaseUrl! }); });
  afterAll(async () => { await pool.end(); });
  async function setup() {
    const workspaceId = (await pool.query("INSERT INTO workspaces(name) VALUES ('gateway-integration-synthetic') RETURNING id")).rows[0].id as string;
    const message = { eventId: randomUUID(), senderStaffId: "staff", conversationId: "group", text: "/查数 今日", sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=synthetic" };
    const downstream = { headers: { messageId: "stream" }, data: JSON.stringify({ msgId: message.eventId, senderStaffId: message.senderStaffId, conversationId: message.conversationId, msgtype: "text", text: { content: message.text }, sessionWebhook: message.sessionWebhook }) };
    const deps = { workspaceId, inbound, codec, processMessage: vi.fn(async () => "synthetic response"), replies: { sendText: vi.fn(async () => {}) } };
    return { ...deps, message, downstream };
  }
  it("crash after commit before ACK is deduped; fresh worker consumes exactly one row", async () => {
    const deps = await setup();
    await expect(receiveRobotMessage(deps.downstream, createInboxReceiver(deps), () => { throw Error("process crash"); })).rejects.toThrow("process crash");
    const ack = vi.fn();
    await receiveRobotMessage(deps.downstream, createInboxReceiver(deps), ack);
    expect(ack).toHaveBeenCalledOnce();
    const [one,two] = await Promise.all([createInboxWorker(deps).tick(), createInboxWorker(deps).tick()]);
    expect([one,two].filter(Boolean)).toHaveLength(1);
    expect(deps.processMessage).toHaveBeenCalledOnce();
    expect(deps.replies.sendText).toHaveBeenCalledOnce();
    const rows = (await pool.query("SELECT * FROM inbound_events WHERE workspace_id=$1", [deps.workspaceId])).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ processed: true, attempts: 1 });
    expect(JSON.stringify(rows)).not.toContain("session=synthetic");
    expect(await createInboxWorker(deps).tick()).toBe(false);
  });
  it("claim failure retries in new worker, reply failure resumes checkpoint, exhaustion is dead", async () => {
    const deps = await setup();
    await createInboxReceiver(deps)(deps.message);
    deps.processMessage.mockRejectedValueOnce(Error("private error"));
    await createInboxWorker(deps).tick();
    const resetDelay = async () => { await pool.query("UPDATE inbound_events SET lease_until=clock_timestamp()-interval '1 second' WHERE workspace_id=$1", [deps.workspaceId]); };
    await resetDelay();
    deps.replies.sendText.mockRejectedValue(Error("session expired"));
    await createInboxWorker(deps).tick();
    for (let i=0; i<3; i++) { await resetDelay(); await createInboxWorker(deps).tick(); }
    await resetDelay();
    expect(await createInboxWorker(deps).tick()).toBe(false);
    expect(deps.processMessage).toHaveBeenCalledTimes(2); // failed read + successful read; never repeated after checkpoint
    const row = (await pool.query("SELECT * FROM inbound_events WHERE workspace_id=$1", [deps.workspaceId])).rows[0];
    expect(row).toMatchObject({ processed: false, attempts: 5, last_error: "PROCESSING_FAILED" });
    expect(JSON.stringify(row)).not.toContain("private error");
  });
});
