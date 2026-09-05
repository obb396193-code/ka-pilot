import { routeIntent } from "./intent-router.js";
import type { DingTalkInboundMessage, IdentityPort, ProductCommandPort } from "./types.js";

export interface MessageHandlerDependencies {
  workspaceId: string;
  identities: IdentityPort;
  commands: ProductCommandPort;
}

/** Business stage only. Durable delivery/checkpoints belong to inbox-worker. */
export function createMessageHandler(deps: MessageHandlerDependencies) {
  return async (message: DingTalkInboundMessage): Promise<string> => {
    const identity = await deps.identities.resolveIdentity(deps.workspaceId, "dingtalk", message.senderStaffId);
    if (!identity) return "你的钉钉身份尚未绑定 KA 平台账号，请先完成绑定。";
    const intent = routeIntent(message.text);
    if (intent.kind === "help") return "可用命令：/查数 <范围与问题>。任务创建、Agent 执行尚未开放。";
    // Existing client methods describe future endpoints, not authorized write routes.
    if (intent.kind !== "query") return "任务创建和 Agent 执行尚未开放，请在平台查看当前可用能力。";
    const result = await deps.commands.execute(intent, {
      workspaceId: deps.workspaceId, userId: identity.userId, qihangUserId: identity.qihangUserId,
      conversationId: message.conversationId, eventId: message.eventId,
    });
    return result.text;
  };
}
