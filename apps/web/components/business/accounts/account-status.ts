import type { StatusTone } from "@/components/business/data-grid/data-grid"
import type { AnalysisRow } from "@/lib/data/contracts"

// 账户达标状态 → 母版状态 chip（绿勾 / 黄叹号 / 红叉 / 虚线圈），全站同一份
export const accountStatus: Record<AnalysisRow["status"], { label: string; tone: StatusTone }> = {
  healthy: { label: "达标", tone: "success" },
  watch: { label: "观察", tone: "warning" },
  critical: { label: "超考核", tone: "critical" },
  unavailable: { label: "不可判断", tone: "muted" },
}

// 媒体代码 → 中文（表格里当母版的「类型 chip」用；未知代码原样显示）
const mediaLabels: Record<string, string> = { KUAISHOU: "快手", DOUYIN: "抖音", OCEANENGINE: "巨量", TENCENT: "腾讯", BAIDU: "百度" }
export function mediaLabel(media: string) {
  return mediaLabels[media.toUpperCase()] ?? media
}
