import type { ReactNode } from "react"
import { IconAlertCircle, IconDatabaseOff, IconLock } from "@tabler/icons-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { DataResponse } from "@/lib/data/data-view"
import { SourceLineageBar } from "./source-lineage"

function LoadingPanel() {
  return (
    <div aria-busy="true" aria-label="正在加载数据" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
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

function BlockingPanel({ kind, message }: { kind: "empty" | "error" | "no-access"; message?: string }) {
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
      </CardContent>
    </Card>
  )
}

export function DataStateFrame<T>({ response, children }: { response: DataResponse<T>; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-4">
      <SourceLineageBar lineage={response.lineage} />
      {response.state === "loading" ? <LoadingPanel /> : null}
      {response.state === "empty" ? <BlockingPanel kind="empty" message={response.message} /> : null}
      {response.state === "error" ? <BlockingPanel kind="error" message={response.message} /> : null}
      {response.state === "no-access" ? <BlockingPanel kind="no-access" message={response.message} /> : null}
      {["partial", "stale", "success"].includes(response.state) ? children : null}
    </div>
  )
}
