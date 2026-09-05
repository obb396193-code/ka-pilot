import { describe, expect, it, vi } from "vitest";
import { createMessageHandler } from "../src/message-handler.js";

const message = {
  eventId: "event-1", senderStaffId: "staff-1", conversationId: "cid-1",
  text: "/查数 今日消耗", sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=synthetic",
};
function dependencies() {
  return {
    workspaceId: "11111111-1111-4111-8111-111111111111",
    identities: { resolveIdentity: vi.fn().mockResolvedValue({
      userId: "22222222-2222-4222-8222-222222222222", qihangUserId: "qh-synthetic", hasMulticaCredential: true,
    }) },
    commands: { execute: vi.fn().mockResolvedValue({ text: "result" }) },
  };
}
describe("DingTalk business stage", () => {
  it("rejects unmapped identity before product calls", async () => {
    const deps = dependencies();
    deps.identities.resolveIdentity.mockResolvedValue(null);
    expect(await createMessageHandler(deps)(message)).toContain("绑定");
    expect(deps.commands.execute).not.toHaveBeenCalled();
  });
  it("returns query result for durable reply checkpoint", async () => {
    const deps = dependencies();
    expect(await createMessageHandler(deps)(message)).toBe("result");
    expect(deps.commands.execute).toHaveBeenCalledWith(
      { kind: "query", input: "今日消耗" },
      expect.objectContaining({ workspaceId: deps.workspaceId, conversationId: "cid-1", eventId: "event-1" }),
    );
  });
  it.each(["/帮助", "/创建任务 新任务", "自动改价并基建"])("does not enable writes or agent job for %s", async (text) => {
    const deps = dependencies();
    expect(await createMessageHandler(deps)({ ...message, text })).toContain("尚未开放");
    expect(deps.commands.execute).not.toHaveBeenCalled();
  });
});
