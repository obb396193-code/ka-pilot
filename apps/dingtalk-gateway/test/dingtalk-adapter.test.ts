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
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ errcode: 0 }));
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
  it.each(["https://user:pass@oapi.dingtalk.com/path", "https://oapi.dingtalk.com:8443/path", "http://oapi.dingtalk.com/path"])("rejects unsafe webhook %s", async (url) => {
    const fetchFn = vi.fn();
    await expect(new DingTalkSessionReply({ fetchFn }).sendText(url, "text")).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it.each([Response.json({ errcode: 123 }), Response.json({}), new Response("fail", { status: 503 })])("rejects failed/invalid replies including HTTP 200 business failure", async (response) => {
    const fetchFn = vi.fn(async () => response);
    await expect(new DingTalkSessionReply({ fetchFn }).sendText("https://oapi.dingtalk.com/path", "text")).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: "error" }));
  });
});
