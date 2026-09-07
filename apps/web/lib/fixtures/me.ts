import type { Fixture } from "@/lib/fixtures/contract"
import counts from "@contract/fixtures/me/counts.json"
import preferences from "@contract/fixtures/me/preferences.json"
import models from "@contract/fixtures/agent/models.json"

// v1.7.1：侧栏 badge 唯一计数源 GET /me/counts；用户偏好 GET/PATCH /me/preferences（identity 级）；Agent 模型清单 GET /agent/models
export type MeCounts = { workItems: { open: number; p0: number; p1: number; opportunity: number }; approvalsToApprove: number; dispatchesReceived: number; runsWaitingConfirmation: number; notificationsUnread: number; changesetsDraft: number }
export const countsFixture = counts as unknown as Fixture<MeCounts>
export type MePreferences = { theme: { mode: "bw" | "bwc" | "full"; hue: string }; locale?: string; updatedAt: string }
export const preferencesFixture = preferences as unknown as Fixture<MePreferences>
export type AgentModel = { id: string; label: string; provider: string; default: boolean; status: "verified" | "documented_unverified" | "disabled" }
export const agentModelsFixture = models as unknown as Fixture<{ items: AgentModel[] }>
