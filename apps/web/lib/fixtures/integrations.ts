import type { Fixture } from "@/lib/fixtures/contract"
import connections from "@contract/fixtures/integrations/connections.json"
import identityMappings from "@contract/fixtures/integrations/identity-mappings.json"
import cards from "@contract/fixtures/integrations/cards.json"
import cardCallbacks from "@contract/fixtures/integrations/card-callbacks.json"
import messages from "@contract/fixtures/integrations/messages.json"
import policies from "@contract/fixtures/alerts/policies.json"

// 集成与通知（F-007 §7，契约 v1.4 9.4/9.5 · v1.5 9.1/9.6）fixture 读取层。不算数。
export type Connection = { id: string; provider: "dingtalk" | "feishu" | "wecom"; status: "connected" | "disconnected" | "pending"; health: "ok" | "degraded" | "down"; lastCheckedAt: string; config: { clientIdMasked: string; robots: { robot_id: string; name: string }[]; groups: { conversation_id: string; name: string }[] } }
export const connectionsFixture = connections as unknown as Fixture<{ items: Connection[] }>
export const providerLabel: Record<Connection["provider"], string> = { dingtalk: "钉钉", feishu: "飞书", wecom: "企业微信" }
export type IdentityMapping = { externalUserId: string; provider: string; userId: string; displayName: string; verifiedAt: string | null }
export const identityMappingsFixture = identityMappings as unknown as Fixture<{ items: IdentityMapping[] }>

export type CardTemplate = { id: string; level: "L0" | "L1" | "L2" | "L3"; name: string; actions: string[]; hashCheck?: boolean }
export type CardInstance = { id: string; templateId: string; status: "awaiting" | "acted" | "expired"; changesetId?: string; hash?: string; expiresAt?: string; sentTo: string }
export const cardsFixture = cards as unknown as Fixture<{ templates: CardTemplate[]; instances: CardInstance[] }>
export const cardLevelHint: Record<CardTemplate["level"], string> = { L0: "只读简报", L1: "动态 / 可取消", L2: "需确认执行（带校验指纹）", L3: "结果 / 重试" }
export const cardLevelLabel: Record<CardTemplate["level"], string> = { L0: "只读卡", L1: "可取消卡", L2: "确认执行卡", L3: "结果卡" }
export type CardCallback = { id: number; cardInstanceId: string; action: string; actorExternalId: string; actorUserId: string | null; idempotencyKey: string; hashVerified: boolean; result: string; at: string }
export const cardCallbacksFixture = cardCallbacks as unknown as Fixture<{ items: CardCallback[] }>

export type MessageItem = { id: string; direction: "out" | "in"; channel: string; target: string; kind: string; status: "sent" | "failed" | "queued" | "processed" | "dead"; attempts: number; failReason: string | null; createdAt: string; sentAt?: string | null; processedAt?: string | null; ref: { type: string; id: string } | null }
export const messagesFixture = messages as unknown as Fixture<{ items: MessageItem[]; next_cursor: string | null }>
export const messageStatusMeta: Record<MessageItem["status"], { label: string; tone: "success" | "critical" | "pending" | "muted" }> = { sent: { label: "已发送", tone: "success" }, failed: { label: "失败", tone: "critical" }, queued: { label: "排队", tone: "pending" }, processed: { label: "已处理", tone: "success" }, dead: { label: "dead", tone: "muted" } }
export const messageKindLabel: Record<string, string> = { daily_report: "日报", alert: "警报", robot_message: "机器人消息", settlement: "结算单", card: "卡片" }

export type AlertPolicy = { severity: "P0" | "P1" | "P2"; breakMute?: boolean; ackWithinMin?: number; escalateTo?: string; then?: string; thenAfterMin?: number; batchDigest?: boolean }
export const policiesFixture = policies as unknown as Fixture<{ items: AlertPolicy[]; quietHours: { from: string; to: string; suppress: string[] } }>
export const escalateLabel: Record<string, string> = { backup: "备班", lead: "负责人", admin: "管理员" }
