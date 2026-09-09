import type { ReactNode } from "react"
import { IconAlertCircle, IconDatabaseOff, IconLock } from "@tabler/icons-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DataResponse } from "@/lib/data/data-view"
import { cn } from "@/lib/utils"
import { SourceLineageBar, SourceLineageInline } from "./source-lineage"

function LoadingPanel({ cards = 4 }: { cards?: number }) {
  return (
    <div aria-busy="true" aria-label="正在加载数据" className={cn("grid gap-4 md:grid-cols-2", cards === 6 ? "xl:grid-cols-3 @[1360px]/main:grid-cols-6" : "xl:grid-cols-4")}>
      {Array.from({ length: cards }).map((_, index) => (
        <Card key={index}>
          <CardHeader><Skeleton className="h-4 w-24" /></CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function BlockingPanel({ kind, message, requestId, retryable }: { kind: "empty" | "error" | "no-access"; message?: string; requestId?: string; retryable?: boolean }) {
  const content = {
    empty: { title: "当前筛选范围没有数据", description: message ?? "调整账户或时间范围后重试。", icon: IconDatabaseOff },
    error: { title: "数据查询失败", description: message ?? "请稍后重试；系统不会用旧值或 0 静默替代。", icon: IconAlertCircle },
    "no-access": { title: "当前身份无访问权限", description: message ?? "请申请对应账户范围，不会越权展示数据。", icon: IconLock },
  }[kind]
  const Icon = content.icon

  return (
    <Card role={kind === "error" ? "alert" : "status"} className="border-dashed">
      <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <span className="rounded-full bg-muted p-3"><Icon className="size-6 text-muted-foreground" /></span>
        <CardTitle className="text-lg">{content.title}</CardTitle>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{content.description}</p>
        {requestId ? <p className="text-xs text-muted-foreground">排查编号 <span className="font-mono">{requestId}</span>（找我们排查时报这串）</p> : null}
        {requestId ? <p className="text-xs text-muted-foreground">{retryable ? "可重试；若持续失败请携问题编号排障。" : "请携问题编号联系数据平台排障。"}</p> : null}
      </CardContent>
    </Card>
  )
}

// lineage="full"：血缘条置顶（数据页）；lineage="inline"：血缘收成一行页脚，面板随母版内容区留白（工作台）。
export function DataStateFrame<T>({ response, children, lineage = "full" }: { response: DataResponse<T>; children: ReactNode; lineage?: "full" | "inline" }) {
  const noAccess = response.state === "unauthorized" || response.state === "forbidden"
  const error = ["error", "timeout", "too-large"].includes(response.state)
  const degraded = ["unavailable", "truncated", "partial", "stale"].includes(response.state)
  const inline = lineage === "inline"
  const pad = inline ? "px-4 lg:px-6" : undefined
  return (
    <div className={cn("min-w-0", inline ? "flex flex-col gap-4 md:gap-6" : "space-y-4")}>
      {!inline ? <SourceLineageBar lineage={response.lineage} /> : null}
      {response.state === "loading" ? <div className={pad}><LoadingPanel cards={inline ? 6 : 4} /></div> : null}
      {response.state === "empty" ? <div className={pad}><BlockingPanel kind="empty" message={response.message} /></div> : null}
      {error ? <div className={pad}><BlockingPanel kind="error" message={response.message} requestId={response.error?.requestId} retryable={response.error?.retryable} /></div> : null}
      {noAccess ? <div className={pad}><BlockingPanel kind="no-access" message={response.message} requestId={response.error?.requestId} retryable={response.error?.retryable} /></div> : null}
      {degraded ? <div className={pad}><div role="alert" className="rounded-lg border bg-muted/45 px-4 py-3 text-sm"><strong>{response.state === "unavailable" ? "来源或对账不可用" : response.state === "truncated" ? "结果已截断" : response.state === "stale" ? "数据已过期" : "仅返回部分数据"}</strong><p className="mt-1 text-muted-foreground">{response.message ?? "当前结果只用于查看，不参与全量判断或写操作。"}</p>{response.error?.requestId ? <p className="mt-2 font-mono text-xs text-muted-foreground">requestId: {response.error.requestId}</p> : null}</div></div> : null}
      {["ready", "unavailable", "truncated", "partial", "stale"].includes(response.state) ? children : null}
      {inline ? <div className={pad}><SourceLineageInline lineage={response.lineage} /></div> : null}
    </div>
  )
}
