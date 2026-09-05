import { describe, expect, it, vi } from "vitest";
import { InboxCodec } from "../src/inbox-codec.js";
import { createInboxReceiver, createInboxWorker } from "../src/inbox-worker.js";
import { receiveRobotMessage } from "../src/dingtalk-adapter.js";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const message = { eventId: "event", senderStaffId: "staff", conversationId: "group", text: "/查数 今日", sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=synthetic" };
const codec = new InboxCodec("11".repeat(32));
const downstream = { headers: { messageId: "stream" }, data: JSON.stringify({ msgId: message.eventId, senderStaffId: message.senderStaffId, conversationId: message.conversationId, msgtype: "text", text: { content: message.text }, sessionWebhook: message.sessionWebhook }) };

function fixture() {
  const lease = { id: "00000000-0000-4000-8000-000000000002", workspaceId, provider: "dingtalk", externalEventId: message.eventId, attempts: 1, payload: {} as Record<string, unknown> };
  const inbound = {
    receiveInbound: vi.fn(async (_w, _p, _e, _k, payload) => { lease.payload = payload; return true; }),
    leaseInbound: vi.fn(async () => lease),
    renewInbound: vi.fn(async () => {}),
    checkpointInbound: vi.fn(async (_l, value) => { lease.payload.checkpoint = value; }),
    completeInbound: vi.fn(async () => {}),
    failInbound: vi.fn(async () => {}),
  };
  return { workspaceId, codec, inbound, lease, processMessage: vi.fn(async () => "reply"), replies: { sendText: vi.fn(async () => {}) } };
}

describe("durable inbox boundary", () => {
  it("does not ACK until committed; insert failure is never ACKed", async () => {
    const ack = vi.fn();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const receive = vi.fn(() => pending);
    const execution = receiveRobotMessage(downstream, receive, ack);
    await Promise.resolve();
    expect(ack).not.toHaveBeenCalled();
    finish(); await execution;
    expect(ack).toHaveBeenCalledTimes(1);
    ack.mockClear();
    await expect(receiveRobotMessage(downstream, async () => { throw Error("db"); }, ack)).rejects.toThrow();
    expect(ack).not.toHaveBeenCalled();
  });
  it("persists encrypted replayable message and restarts without original callback", async () => {
    const deps = fixture();
    await createInboxReceiver(deps)(message);
    expect(JSON.stringify(deps.lease.payload)).not.toContain("session=synthetic");
    expect(JSON.stringify(deps.lease.payload)).not.toContain("今日");
    await createInboxWorker(deps).tick();
    expect(deps.processMessage).toHaveBeenCalledWith(message);
    expect(deps.replies.sendText).toHaveBeenCalledWith(message.sessionWebhook, "reply");
    expect(deps.inbound.completeInbound).toHaveBeenCalledTimes(1);
  });
  it("keeps failed work for retry with safe error only", async () => {
    const deps = fixture();
    await createInboxReceiver(deps)(message);
    deps.processMessage.mockRejectedValueOnce(Error("secret://private"));
    await createInboxWorker(deps).tick();
    expect(deps.inbound.failInbound).toHaveBeenCalledWith(deps.lease, "PROCESSING_FAILED", 2);
    expect(deps.inbound.completeInbound).not.toHaveBeenCalled();
    await createInboxWorker(deps).tick();
    expect(deps.inbound.completeInbound).toHaveBeenCalledTimes(1);
  });
  it("checkpoint recovery retries reply without repeating successful command", async () => {
    const deps = fixture();
    await createInboxReceiver(deps)(message);
    deps.replies.sendText.mockRejectedValueOnce(Error("timeout"));
    await createInboxWorker(deps).tick();
    await createInboxWorker(deps).tick();
    expect(deps.processMessage).toHaveBeenCalledTimes(1);
    expect(deps.replies.sendText).toHaveBeenCalledTimes(2);
  });
  it("lost lease prevents reply and completion; malformed legacy payload is bounded failure", async () => {
    const deps = fixture();
    await createInboxReceiver(deps)(message);
    deps.inbound.renewInbound.mockRejectedValue(Error("lost"));
    await createInboxWorker(deps).tick();
    expect(deps.replies.sendText).not.toHaveBeenCalled();
    expect(deps.processMessage).not.toHaveBeenCalled();
    deps.inbound.renewInbound.mockResolvedValue();
    deps.lease.payload = { text: "legacy" };
    await createInboxWorker(deps).tick();
    expect(deps.inbound.failInbound).toHaveBeenLastCalledWith(deps.lease, "INVALID_PAYLOAD", 2);
  });
  it("binds encryption to workspace/event/purpose; rejects malformed/key/size", () => {
    const encrypted = codec.seal(message, workspaceId, "event", "message");
    expect(() => codec.open(encrypted, workspaceId, "other", "message")).toThrow();
    expect(() => codec.open(encrypted, "other", "event", "message")).toThrow();
    expect(() => codec.open(encrypted, workspaceId, "event", "reply")).toThrow();
    expect(() => new InboxCodec("invalid")).toThrow();
    expect(() => codec.seal("a".repeat(131072), workspaceId, "event", "message")).toThrow();
  });
  it("empty queue and stop signal end polling without work", async () => {
    const deps = fixture();
    const inbound = { ...deps.inbound, leaseInbound: vi.fn(async () => null) };
    const controller = new AbortController();
    const worker = createInboxWorker({ ...deps, inbound });
    expect(await worker.tick()).toBe(false);
    const running = worker.run(controller.signal, vi.fn());
    await Promise.resolve(); controller.abort(); await running;
    expect(deps.processMessage).not.toHaveBeenCalled();
  });
  it("reports poll failure safely and stops", async () => {
    const deps = fixture();
    deps.inbound.leaseInbound.mockRejectedValue(Error("secret db connection"));
    const controller = new AbortController();
    const onError = vi.fn(() => controller.abort());
    await createInboxWorker(deps).run(controller.signal, onError);
    expect(onError).toHaveBeenCalledWith();
  });
});
