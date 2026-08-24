import { describe, expect, it, vi } from "vitest";

import { DingTalkSessionReply, parseRobotMessage } from "../src/dingtalk-adapter.js";

describe("DingTalk adapter", () => {
  it("parses the official Stream robot text payload", () => {
    expect(
      parseRobotMessage({
        headers: { messageId: "stream-message-1" },
        data: JSON.stringify({
          msgId: "robot-message-1",
          senderStaffId: "staff-1",
          conversationId: "cid-1",
          msgtype: "text",
          text: { content: "  /查数 今日消耗  " },
          sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=redacted",
        }),
      }),
    ).toEqual({
      streamMessageId: "stream-message-1",
      message: {
        eventId: "robot-message-1",
        senderStaffId: "staff-1",
        conversationId: "cid-1",
        text: "/查数 今日消耗",
        sessionWebhook: "https://oapi.dingtalk.com/robot/sendBySession?session=redacted",
      },
    });
  });

  it("rejects non-DingTalk reply URLs to prevent SSRF", async () => {
    const reply = new DingTalkSessionReply({ fetchFn: vi.fn() });
    await expect(reply.sendText("https://attacker.example/collect", "secret")).rejects.toThrow(
      "untrusted",
    );
  });

  it("sends the documented text message shape", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response("ok", { status: 200 }));
    const reply = new DingTalkSessionReply({ fetchFn });
    const url = "https://oapi.dingtalk.com/robot/sendBySession?session=redacted";
    await reply.sendText(url, "处理完成");

    expect(fetchFn).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ msgtype: "text", text: { content: "处理完成" } }),
      }),
    );
  });
});
