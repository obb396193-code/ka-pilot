import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type SeverityLevel = "P0" | "P1" | "P2" | "opportunity"
const label: Record<SeverityLevel, string> = { P0: "P0", P1: "P1", P2: "P2", opportunity: "机会" }
const dot: Record<SeverityLevel, string> = { P0: "bg-status-critical", P1: "bg-status-warning", P2: "bg-muted-foreground", opportunity: "bg-status-success" }

// 黑白·点彩风格的严重度 chip：描边 + 一粒色点（红=坏 / 黄=预警 / 绿=机会），任何主题模式不变
export function SeverityBadge({ level, className }: { level: SeverityLevel; className?: string }) {
  return (
    <Badge variant="outline" className={cn("kp-tint gap-1.5 pl-2 text-foreground/80", className)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", dot[level])} />
      {label[level]}
    </Badge>
  )
}
