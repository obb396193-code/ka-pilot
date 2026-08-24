import { IconAlertTriangle, IconClock, IconDatabase } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import type { LineageBundle, SourceLineage } from "@/lib/data/data-view"

function formatAsOf(value: string | null) {
  if (value === null) return "未知"
  const [date, rest] = value.split("T")
  return `${date} ${rest.slice(0, 5)} ${value.slice(-6)}`
}

function SourceCard({ lineage }: { lineage: SourceLineage }) {
  return (
    <div className="min-w-0 rounded-md border bg-background/60 px-3 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <IconDatabase className="size-4 text-muted-foreground" />
          {lineage.sourceLabel}
        </span>
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <IconClock className="size-4" />
          截止 {formatAsOf(lineage.dataAsOf)}
        </span>
        <span className="font-mono text-muted-foreground">版本 {lineage.datasetVersion ?? "未知"}</span>
        <span className="font-mono text-muted-foreground">查询 {lineage.queryTemplateVersion}</span>
        <span className="font-mono text-muted-foreground">口径 {lineage.metricVersion}</span>
        <span className="text-muted-foreground">{lineage.timezone ?? "时区未知"} · 日切 {lineage.dayCut ?? "未知"}</span>
        {lineage.metadataAvailability === "known" ? null : <Badge variant="secondary">{lineage.metadataAvailability === "partial" ? "来源元数据部分可用" : "来源元数据未知"}</Badge>}
        <span className="text-muted-foreground">覆盖 {lineage.coverage}</span>
        {lineage.truncated ? <Badge variant="outline">结果已截断</Badge> : <Badge variant="outline">未截断</Badge>}
        {lineage.partial ? <Badge variant="secondary">部分覆盖</Badge> : null}
        {lineage.stale ? <Badge variant="destructive">超过时效门</Badge> : null}
      </div>
      {lineage.warnings.length ? (
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {lineage.warnings.map((warning) => (
            <li key={warning} className="flex items-start gap-1.5">
              <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

export function SourceLineageBar({ lineage }: { lineage: LineageBundle }) {
  const sources = lineage.mode === "single" ? [lineage.source] : [lineage.kaData, lineage.platform]
  return (
    <section aria-label="数据血缘" className="space-y-2 rounded-lg border bg-card p-3 shadow-xs">
      {lineage.mode === "reconcile" ? <div className="flex items-center justify-between gap-3 px-1 text-xs"><strong>双源独立血缘</strong><Badge variant={lineage.comparability.comparable ? "outline" : "secondary"}>{lineage.comparability.comparable ? "可比" : "不可比"}</Badge></div> : null}
      <div className={sources.length === 2 ? "grid gap-2 lg:grid-cols-2" : "grid gap-2"}>{sources.map((source) => <SourceCard key={source.source} lineage={source} />)}</div>
      {lineage.mode === "reconcile" && lineage.comparability.reason ? <p className="px-1 text-xs text-muted-foreground">{lineage.comparability.reason}</p> : null}
    </section>
  )
}
