import { DWClient, TOPIC_ROBOT, type DWClientDownStream } from "dingtalk-stream";
import { z } from "zod";

import type { DingTalkInboundMessage, ReplyPort } from "./types.js";

const robotTextSchema = z.object({
  msgId: z.string().min(1),
  senderStaffId: z.string().min(1),
  conversationId: z.string().min(1),
  msgtype: z.literal("text"),
  text: z.object({ content: z.string() }),
  sessionWebhook: z.string().url(),
});

export interface ParsedRobotMessage {
  streamMessageId: string;
  message: DingTalkInboundMessage;
}

export function parseRobotMessage(input: {
  headers: { messageId: string };
  data: string;
}): ParsedRobotMessage {
  let data: unknown;
  try {
    data = JSON.parse(input.data);
  } catch (error) {
    throw new Error("DingTalk Stream payload is not valid JSON", { cause: error });
  }
  const robot = robotTextSchema.parse(data);
  return {
    streamMessageId: input.headers.messageId,
    message: {
      eventId: robot.msgId,
      senderStaffId: robot.senderStaffId,
      conversationId: robot.conversationId,
      text: robot.text.content.trim(),
      sessionWebhook: robot.sessionWebhook,
    },
  };
}

function assertTrustedWebhook(rawUrl: string): URL {
  const url = new URL(rawUrl);
  const trusted =
    url.protocol === "https:" &&
    (url.hostname === "dingtalk.com" || url.hostname.endsWith(".dingtalk.com"));
  if (!trusted) {
    throw new Error("DingTalk session webhook has an untrusted destination");
  }
  return url;
}

export class DingTalkSessionReply implements ReplyPort {
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: { fetchFn?: typeof fetch; timeoutMs?: number } = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async sendText(sessionWebhook: string, text: string): Promise<void> {
    const url = assertTrustedWebhook(sessionWebhook);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchFn(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          msgtype: "text",
          text: { content: text.slice(0, 5_000) },
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`DingTalk session reply failed with HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}

export interface DingTalkStreamConnection {
  disconnect(): void;
}

export async function connectDingTalkStream(options: {
  clientId: string;
  clientSecret: string;
  onMessage: (message: DingTalkInboundMessage) => Promise<void>;
  onProcessingError?: (error: unknown) => void;
}): Promise<DingTalkStreamConnection> {
  const client = new DWClient({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    keepAlive: true,
  });
  client.registerCallbackListener(TOPIC_ROBOT, (downstream: DWClientDownStream) => {
    try {
      const parsed = parseRobotMessage(downstream);
      client.socketCallBackResponse(parsed.streamMessageId, { status: "SUCCESS" });
      void options.onMessage(parsed.message).catch((error: unknown) => {
        options.onProcessingError?.(error);
      });
    } catch (error) {
      client.socketCallBackResponse(downstream.headers.messageId, {
        status: "SUCCESS",
        message: "unsupported message",
      });
      options.onProcessingError?.(error);
    }
  });
  await client.connect();
  return { disconnect: () => client.disconnect() };
}
