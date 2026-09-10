import type { ReactNode } from "react"

// 母版内容区页头：标题 + 一句说明 + 右侧动作；配 py-4 md:py-5 的内容壳
// 老板 2026-09-10：当真产品看，页头不自报「脱敏 Mock / 内网数据」这种数据源角标
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-4 lg:px-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {/* data-write-actions：F8-1 窄屏隐藏页面级写入口 */}
        {actions ? <span data-write-actions className="flex items-center gap-2">{actions}</span> : null}
      </div>
    </div>
  )
}

export function PageBody({ children }: { children: ReactNode }) {
  // 底部多留一段：右下角常驻 AI 悬浮球（48px + 24px 边距），不留白会盖住最后一张卡的数值
  return <div className="flex flex-col gap-4 py-4 pb-24 md:gap-5 md:py-5 md:pb-24 [&_[data-slot=card]]:gap-4 [&_[data-slot=card]]:py-4 [&_[data-slot=card-content]]:px-4 [&_[data-slot=card-footer]]:px-4 [&_[data-slot=card-header]]:px-4 @3xl/main:[&_[data-slot=card]]:py-5 @3xl/main:[&_[data-slot=card-content]]:px-5 @3xl/main:[&_[data-slot=card-footer]]:px-5 @3xl/main:[&_[data-slot=card-header]]:px-5">{children}</div>
}
