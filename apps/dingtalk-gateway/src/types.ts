import type { GatewayIdentity, InboundEventRepository, NewJob } from "@ka/db";

import type { RoutedIntent } from "./intent-router.js";

export interface DingTalkInboundMessage {
  eventId: string;
  senderStaffId: string;
  conversationId: string;
  text: string;
  sessionWebhook: string;
}

export type InboundEventPort = Pick<InboundEventRepository,
  "receiveInbound" | "leaseInbound" | "renewInbound" | "checkpointInbound" | "completeInbound" | "failInbound">;

export interface IdentityPort {
  resolveIdentity(
    workspaceId: string,
    provider: string,
    externalId: string,
  ): Promise<GatewayIdentity | null>;
}

export interface JobQueuePort {
  enqueue(job: NewJob): Promise<string>;
}

export interface ProductCommandContext {
  workspaceId: string;
  userId: string;
  qihangUserId: string | null;
  conversationId: string;
  eventId: string;
}

export interface ProductCommandPort {
  execute(
    intent: Extract<RoutedIntent, { kind: "query" | "create_task" }>,
    context: ProductCommandContext,
  ): Promise<{ text: string }>;
}

export interface ReplyPort {
  sendText(sessionWebhook: string, text: string): Promise<void>;
}
