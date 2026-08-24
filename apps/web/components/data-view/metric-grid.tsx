import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { DisplayMetric } from "@/lib/data/contracts"
import { cn } from "@/lib/utils"

const toneClass: Record<DisplayMetric["tone"], string> = {
  neutral: "text-muted-foreground",
  positive: "text-[var(--kp-status-success)]",
  warning: "text-[var(--kp-status-warning)]",
  critical: "text-[var(--kp-status-critical)]",
}

export function MetricGrid({ metrics }: { metrics: DisplayMetric[] }) {
  return (
    <section aria-label="关键经营指标" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((metric) => (
        <Card key={metric.key} className="gap-3 py-5 shadow-xs">
          <CardHeader className="px-5">
            <CardTitle className="text-xs font-medium text-muted-foreground">{metric.label}</CardTitle>
          </CardHeader>
          <CardContent className="px-5">
            <div className="font-mono text-2xl font-semibold tabular-nums tracking-tight">{metric.value}</div>
            {metric.delta ? <p className={cn("mt-2 text-xs", toneClass[metric.tone])}>{metric.delta}</p> : null}
          </CardContent>
        </Card>
      ))}
    </section>
  )
}
