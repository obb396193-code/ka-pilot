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
  if (Buffer.byteLength(input.data) >= 262_144) throw new Error("DingTalk payload exceeds limit");
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
    url.username === "" && url.password === "" && url.port === "" &&
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
        redirect: "error",
      });
      if (!response.ok) {
        throw new Error(`DingTalk session reply failed with HTTP ${response.status}`);
      }
      const body = z.object({ errcode: z.number().int() }).parse(await response.json());
      if (body.errcode !== 0) throw new Error("DingTalk reply rejected");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export interface DingTalkStreamConnection {
  disconnect(): void;
}

/** Resolve only after durable INSERT then ACK; persistence failure stays unacknowledged. */
export async function receiveRobotMessage(
  downstream: { headers: { messageId: string }; data: string },
  persist: (message: DingTalkInboundMessage) => Promise<void>,
  ack: (messageId: string, response: { status: string }) => void,
): Promise<void> {
  const parsed = parseRobotMessage(downstream);
  await persist(parsed.message);
  ack(parsed.streamMessageId, { status: "SUCCESS" });
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
    debug: false,
  });
  client.registerCallbackListener(TOPIC_ROBOT, (downstream: DWClientDownStream) => {
    void receiveRobotMessage(downstream, options.onMessage,
      (id, response) => { client.socketCallBackResponse(id, response); }).catch((error: unknown) => {
      options.onProcessingError?.(error);
    });
  });
  await client.connect();
  return { disconnect: () => client.disconnect() };
}
