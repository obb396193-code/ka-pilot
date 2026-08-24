import type { ReactNode } from "react"

import { Badge } from "@/components/ui/badge"
import styles from "./neutral-surface.module.css"

export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <main className={`${styles.surface} mx-auto flex w-full min-w-0 max-w-[1600px] flex-1 flex-col gap-6 overflow-x-clip px-4 py-5 md:px-6 md:py-7`} data-theme="neutral">
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.16em]">
              {eyebrow}
            </Badge>
            <span className="text-xs text-muted-foreground">来源、时效与完整性见数据血缘</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      {children}
    </main>
  )
}
