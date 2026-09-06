import type { Fixture } from "@/lib/fixtures/contract"
import rulesList from "@contract/fixtures/rules/list.json"

// 自动化（F-007 §5）fixture 读取层，先给任务详情「SOP 与自动化」用；页 5 再扩
export type RuleItem = { ruleId: number; name: string; type: "monitor" | "auto"; nextEvalAt: string; enabled: boolean; autonomyLevel: number; availabilityPolicy: string; notTriggeredReason: string | null; last7d: { triggered: number; succeeded: number }; owner: { userId: string; name: string } | null }
export const rulesFixture = rulesList as unknown as Fixture<{ items: RuleItem[] }>
export const notTriggeredLabel: Record<string, string> = { CONDITION_FALSE: "条件未满足", METRIC_MISSING: "指标缺数", SOURCE_STALE: "数据源过期", COLD_START_RELAXED: "冷启动放宽", INITIAL_FULL_PENDING: "首次全量未完成", MUTED: "已静音", DEDUPED: "已去重", INSUFFICIENT_SAMPLE: "样本不足" }
