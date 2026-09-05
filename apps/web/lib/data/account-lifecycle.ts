import lifecycleFixture from "./fixtures/account-lifecycle.mock.json"

// 账户生命周期分层（PRD 4.1「全户状态总览」+ 功能全景「待开户→冷启动→起量→稳定→衰退→关闭」+ 老板口述「基建/等待/起量/跑量/掉量/待关」）。
// 契约现状：account.table 行没有 stage / productName / tags 字段（缺口 F-006-Q4），真实模式一律「未接入」，只有 mock 用 fixture 覆盖层演示。
export type LifecycleStage = "infra" | "idle" | "cold_start" | "ramping" | "stable" | "declining" | "closing" | "closed"

export const lifecycleStages: { value: LifecycleStage; label: string; hint: string; dot: string }[] = [
  { value: "infra", label: "基建中", hint: "开户完成、计划 / 素材没搭完，还不能投", dot: "bg-border" },
  { value: "idle", label: "等待", hint: "基建好了没挂任务，空闲可用", dot: "bg-muted-foreground/60" },
  { value: "cold_start", label: "冷启动", hint: "刚开投，阈值放宽观察", dot: "bg-status-info" },
  { value: "ramping", label: "起量", hint: "消耗爬坡中", dot: "bg-status-success" },
  { value: "stable", label: "稳定跑量", hint: "消耗稳定、达标", dot: "bg-foreground" },
  { value: "declining", label: "掉量", hint: "消耗连续下滑，衰退预警", dot: "bg-status-warning" },
  { value: "closing", label: "待关", hint: "不跑了，等关停 / 清余额", dot: "bg-status-critical" },
  { value: "closed", label: "已关", hint: "已关停，只留历史", dot: "border border-muted-foreground bg-transparent" },
]
export const lifecycleStageMap = Object.fromEntries(lifecycleStages.map((stage) => [stage.value, stage])) as Record<LifecycleStage, (typeof lifecycleStages)[number]>

export type AccountLifecycle = { stage: LifecycleStage; since: string; productName: string }

const fixture = lifecycleFixture as Record<string, AccountLifecycle>

/** 真实模式返回 null（字段未接入）；mock 模式用 fixture 覆盖层 */
export function getAccountLifecycle(accountId: string, isMock: boolean): AccountLifecycle | null {
  if (!isMock) return null
  return fixture[accountId] ?? null
}
