import { routeIntent } from "./intent-router.js";
import type {
  DingTalkInboundMessage,
  IdentityPort,
  InboundEventPort,
  JobQueuePort,
  ProductCommandPort,
  ReplyPort,
} from "./types.js";

export interface MessageHandlerDependencies {
  workspaceId: string;
  inbound: InboundEventPort;
  identities: IdentityPort;
  jobs: JobQueuePort;
  commands: ProductCommandPort;
  replies: ReplyPort;
}

const helpText = [
  "可用命令：",
  "• /查数 <范围与问题>",
  "• /创建任务 <任务信息>",
  "• 直接描述复杂问题，由投放 Agent 异步处理",
].join("\n");

export function createMessageHandler(dependencies: MessageHandlerDependencies) {
  return async (message: DingTalkInboundMessage): Promise<void> => {
    const claimed = await dependencies.inbound.claimInbound(
      dependencies.workspaceId,
      "dingtalk",
      message.eventId,
      "robot_message",
      {
        senderStaffId: message.senderStaffId,
        conversationId: message.conversationId,
        eventId: message.eventId,
        text: message.text,
      },
    );
    if (!claimed) {
      return;
    }

    const identity = await dependencies.identities.resolveIdentity(
      dependencies.workspaceId,
      "dingtalk",
      message.senderStaffId,
    );
    if (!identity) {
      await dependencies.replies.sendText(
        message.sessionWebhook,
        "你的钉钉身份尚未绑定 KA 平台账号，请先在「集成与通知 → 接入管理」完成绑定。",
      );
      await dependencies.inbound.markInboundProcessed(message.eventId);
      return;
    }

    const intent = routeIntent(message.text);
    if (intent.kind === "help") {
      await dependencies.replies.sendText(message.sessionWebhook, helpText);
      await dependencies.inbound.markInboundProcessed(message.eventId);
      return;
    }

    if (intent.kind === "query" || intent.kind === "create_task") {
      const result = await dependencies.commands.execute(intent, {
        workspaceId: dependencies.workspaceId,
        userId: identity.userId,
        qihangUserId: identity.qihangUserId,
        conversationId: message.conversationId,
        eventId: message.eventId,
      });
      await dependencies.replies.sendText(message.sessionWebhook, result.text);
      await dependencies.inbound.markInboundProcessed(message.eventId);
      return;
    }

    if (!identity.hasMulticaCredential) {
      await dependencies.replies.sendText(
        message.sessionWebhook,
        "当前账号未绑定 Multica 凭证，复杂 Agent 任务暂不可用；查数和创建任务仍可使用结构化命令。",
      );
      await dependencies.inbound.markInboundProcessed(message.eventId);
      return;
    }

    const jobId = await dependencies.jobs.enqueue({
      workspaceId: dependencies.workspaceId,
      jobType: "agent_task",
      payload: {
        prompt: intent.input,
        provider: "dingtalk",
        conversationId: message.conversationId,
        sourceEventId: message.eventId,
      },
      priority: 5,
      credentialOwnerUserId: identity.userId,
      maxAttempts: 3,
    });
    await dependencies.replies.sendText(
      message.sessionWebhook,
      `已受理，任务号 ${jobId}。处理结果会回到当前会话。`,
    );
    await dependencies.inbound.markInboundProcessed(message.eventId);
  };
}
