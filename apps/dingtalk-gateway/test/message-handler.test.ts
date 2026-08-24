import { describe, expect, it, vi } from "vitest";

import { createMessageHandler } from "../src/message-handler.js";

const message = {
  eventId: "event-1",
  senderStaffId: "staff-1",
  conversationId: "cid-1",
  text: "分析为什么不跑量",
  sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=redacted",
};

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    inbound: {
      claimInbound: vi.fn().mockResolvedValue(true),
      markInboundProcessed: vi.fn().mockResolvedValue(undefined),
    },
    identities: {
      resolveIdentity: vi.fn().mockResolvedValue({
        userId: "22222222-2222-4222-8222-222222222222",
        qihangUserId: "qh-1",
        hasMulticaCredential: true,
      }),
    },
    jobs: { enqueue: vi.fn().mockResolvedValue("job-1") },
    commands: { execute: vi.fn().mockResolvedValue({ text: "本地结果" }) },
    replies: { sendText: vi.fn().mockResolvedValue(undefined) },
    ...overrides,
  };
}

describe("DingTalk message handler", () => {
  it("ignores a duplicate inbound event", async () => {
    const deps = dependencies({
      inbound: {
        claimInbound: vi.fn().mockResolvedValue(false),
        markInboundProcessed: vi.fn(),
      },
    });
    await createMessageHandler(deps)(message);
    expect(deps.jobs.enqueue).not.toHaveBeenCalled();
    expect(deps.replies.sendText).not.toHaveBeenCalled();
  });

  it("asks an unmapped user to bind identity instead of invoking an agent", async () => {
    const deps = dependencies({
      identities: { resolveIdentity: vi.fn().mockResolvedValue(null) },
    });
    await createMessageHandler(deps)(message);
    expect(deps.jobs.enqueue).not.toHaveBeenCalled();
    expect(deps.replies.sendText).toHaveBeenCalledWith(
      message.sessionWebhook,
      expect.stringContaining("绑定"),
    );
  });

  it("executes structured query commands inside the product", async () => {
    const deps = dependencies();
    await createMessageHandler(deps)({ ...message, text: "/查数 今日消耗" });
    expect(deps.commands.execute).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "query" }),
      expect.objectContaining({ conversationId: "cid-1" }),
    );
    expect(deps.jobs.enqueue).not.toHaveBeenCalled();
    expect(deps.replies.sendText).toHaveBeenCalledWith(message.sessionWebhook, "本地结果");
  });

  it("queues unstructured work for Multica without putting PAT or webhook in payload", async () => {
    const deps = dependencies();
    await createMessageHandler(deps)(message);
    expect(deps.jobs.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: "agent_task",
        credentialOwnerUserId: "22222222-2222-4222-8222-222222222222",
      }),
    );
    const queued = deps.jobs.enqueue.mock.calls[0]?.[0] as {
      payload: Record<string, unknown>;
    };
    expect(JSON.stringify(queued.payload)).not.toContain("sessionWebhook");
    expect(JSON.stringify(queued.payload)).not.toContain("mul_");
    expect(deps.replies.sendText).toHaveBeenCalledWith(
      message.sessionWebhook,
      expect.stringContaining("job-1"),
    );
  });

  it("does not queue agent work without a bound Multica credential", async () => {
    const deps = dependencies({
      identities: {
        resolveIdentity: vi.fn().mockResolvedValue({
          userId: "22222222-2222-4222-8222-222222222222",
          qihangUserId: "qh-1",
          hasMulticaCredential: false,
        }),
      },
    });
    await createMessageHandler(deps)(message);
    expect(deps.jobs.enqueue).not.toHaveBeenCalled();
    expect(deps.replies.sendText).toHaveBeenCalledWith(
      message.sessionWebhook,
      expect.stringContaining("Multica"),
    );
  });
});
