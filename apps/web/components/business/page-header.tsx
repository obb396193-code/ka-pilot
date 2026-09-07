import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"

// 母版内容区页头：标题 + 一句说明 + 右侧动作；配 py-4 md:py-5 的内容壳
export function PageHeader({ title, description, actions, isMock }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; isMock?: boolean }) {
  return (
    <div className="flex flex-col gap-3 px-4 lg:px-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {isMock === undefined ? null : isMock ? <Badge variant="secondary">脱敏 Mock</Badge> : <Badge variant="outline">内网数据</Badge>}
        {actions}
      </div>
    </div>
  )
}

export function PageBody({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4 py-4 md:gap-5 md:py-5 [&_[data-slot=card]]:gap-4 [&_[data-slot=card]]:py-4 [&_[data-slot=card-content]]:px-4 [&_[data-slot=card-footer]]:px-4 [&_[data-slot=card-header]]:px-4 @3xl/main:[&_[data-slot=card]]:py-5 @3xl/main:[&_[data-slot=card-content]]:px-5 @3xl/main:[&_[data-slot=card-footer]]:px-5 @3xl/main:[&_[data-slot=card-header]]:px-5">{children}</div>
}
