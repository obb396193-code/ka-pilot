import type { StatusTone } from "@/components/business/data-grid/data-grid"
import type { AssessmentV3 } from "@/lib/fixtures/data-analysis"

// 达标状态只从 DTO 的 assessment 拿（onTarget + costStatus），前端不算
export function accountStatusTone(assessment: AssessmentV3 | null | undefined): { label: string; tone: StatusTone } {
  if (!assessment || assessment.onTarget === null || !assessment.costStatus) return { label: "不可判断", tone: "muted" }
  if (assessment.costStatus === "green") return { label: "达标", tone: "success" }
  if (assessment.costStatus === "yellow") return { label: "累计达标", tone: "warning" }
  return { label: "超线", tone: "critical" }
}

// 媒体代码 → 中文（表格里当母版的「类型 chip」用；未知代码原样显示）
const mediaLabels: Record<string, string> = { KUAISHOU: "快手", DOUYIN: "抖音", OCEANENGINE: "巨量", TENCENT: "腾讯", BAIDU: "百度", TOUTIAO: "头条" }
export function mediaLabel(media: string) {
  return mediaLabels[media.toUpperCase()] ?? media
}
