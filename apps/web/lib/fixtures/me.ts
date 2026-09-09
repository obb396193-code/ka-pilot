import type { Fixture } from "@/lib/fixtures/contract"
import counts from "@contract/fixtures/me/counts.json"
import notifications from "@contract/fixtures/me/notifications.json"
import notificationsEmpty from "@contract/fixtures/me/notifications-empty.json"
import preferences from "@contract/fixtures/me/preferences.json"
import models from "@contract/fixtures/agent/models.json"

// v1.7.1：侧栏 badge 唯一计数源 GET /me/counts；用户偏好 GET/PATCH /me/preferences（identity 级）；Agent 模型清单 GET /agent/models
export type MeCounts = { workItems: { open: number; p0: number; p1: number; opportunity: number }; approvalsToApprove: number; dispatchesReceived: number; runsWaitingConfirmation: number; notificationsUnread: number; changesetsDraft: number }
export const countsFixture = counts as unknown as Fixture<MeCounts>
export type MePreferences = { theme: { mode: "bw" | "bwc" | "full"; hue: string }; locale?: string; updatedAt: string }
export const preferencesFixture = preferences as unknown as Fixture<MePreferences>
export type AgentModel = { id: string; label: string; provider: string; default: boolean; status: "verified" | "documented_unverified" | "disabled" }
export const agentModelsFixture = models as unknown as Fixture<{ items: AgentModel[] }>

// G10 统一通知流（契约 v1.7.8）：五类 kind，未读数与 me/counts 同源
export type NotificationItem = { id: string; kind: "alert" | "approval" | "dispatch" | "run" | "system"; severity: "p0" | "p1" | "warning" | "info"; title: string; body: string | null; at: string; read: boolean; ref: { type: string; id: string } | null; href: string }
export const notificationsFixture = notifications as unknown as Fixture<{ items: NotificationItem[]; unread: number; nextCursor: string | null }>
export const notificationsEmptyFixture = notificationsEmpty as unknown as Fixture<{ items: NotificationItem[]; unread: number; nextCursor: string | null }>
export const notificationKindLabel: Record<NotificationItem["kind"], string> = { alert: "告警", approval: "待审批", dispatch: "派给我", run: "运行", system: "系统" }
export const notificationTone: Record<NotificationItem["severity"], "critical" | "warning" | "muted" | "pending"> = { p0: "critical", p1: "warning", warning: "warning", info: "pending" }
