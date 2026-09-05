import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { InboxCodec } from "./inbox-codec.js";
import type { DingTalkInboundMessage, InboundEventPort, ReplyPort } from "./types.js";

const messageSchema = z.object({
  eventId: z.string().min(1).max(512), senderStaffId: z.string().min(1).max(512),
  conversationId: z.string().min(1).max(512), text: z.string().max(32_768),
  sessionWebhook: z.string().url().max(8192),
}).strict();

interface InboxDependencies {
  workspaceId: string;
  inbound: InboundEventPort;
  codec: InboxCodec;
}
export function createInboxReceiver(deps: InboxDependencies) {
  return async (input: DingTalkInboundMessage): Promise<void> => {
    const message = messageSchema.parse(input);
    await deps.inbound.receiveInbound(deps.workspaceId, "dingtalk", message.eventId,
      "robot_message", { sealed: deps.codec.seal(message, deps.workspaceId, message.eventId, "message") });
  };
}

export function createInboxWorker(deps: InboxDependencies & {
  processMessage: (message: DingTalkInboundMessage) => Promise<string>;
  replies: ReplyPort;
}) {
  const leaseSeconds = 120;
  async function tick(): Promise<boolean> {
    const lease = await deps.inbound.leaseInbound(deps.workspaceId, "dingtalk", leaseSeconds);
    if (!lease) return false;
    let validated = false;
    try {
      const message = messageSchema.parse(deps.codec.open(lease.payload.sealed, deps.workspaceId, lease.externalEventId, "message"));
      if (message.eventId !== lease.externalEventId || lease.workspaceId !== deps.workspaceId || lease.provider !== "dingtalk") {
        throw new Error("Invalid inbox identity");
      }
      let text: string | undefined;
      if (lease.payload.checkpoint !== undefined) {
        text = z.string().max(5000).parse(deps.codec.open(lease.payload.checkpoint, deps.workspaceId, lease.externalEventId, "reply"));
      }
      validated = true;
      await deps.inbound.renewInbound(lease, leaseSeconds);
      if (text === undefined) {
        text = z.string().max(5000).parse(await deps.processMessage(message));
        await deps.inbound.checkpointInbound(lease, deps.codec.seal(text, deps.workspaceId, lease.externalEventId, "reply"));
      }
      await deps.inbound.renewInbound(lease, leaseSeconds);
      await deps.replies.sendText(message.sessionWebhook, text);
      await deps.inbound.completeInbound(lease);
    } catch {
      await deps.inbound.failInbound(lease, validated ? "PROCESSING_FAILED" : "INVALID_PAYLOAD",
        Math.min(300, 2 ** Math.min(lease.attempts, 8))).catch(() => undefined);
    }
    return true;
  }
  async function run(signal: AbortSignal, onError: () => void): Promise<void> {
    while (!signal.aborted) {
      try { if (await tick()) continue; } catch { onError(); }
      await delay(1000, undefined, { signal }).catch(() => undefined);
    }
  }
  return { tick, run };
}
