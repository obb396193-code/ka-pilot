import type { GatewayIdentity, NewJob } from "@ka/db";

import type { RoutedIntent } from "./intent-router.js";

export interface DingTalkInboundMessage {
  eventId: string;
  senderStaffId: string;
  conversationId: string;
  text: string;
  sessionWebhook: string;
}

export interface InboundEventPort {
  claimInbound(
    provider: string,
    eventId: string,
    kind: string,
    payload: Record<string, unknown>,
  ): Promise<boolean>;
  markInboundProcessed(eventId: string): Promise<void>;
}

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
