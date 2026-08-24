import Link from "next/link"

import { buildDataViewHref, dataViewLabels, type DataViewMode, type QueryRecord } from "@/lib/data/data-view"
import { cn } from "@/lib/utils"

const modes: DataViewMode[] = ["ka_data", "platform", "reconcile"]

export function DataViewSwitcher({
  pathname,
  current,
  query,
}: {
  pathname: string
  current: DataViewMode
  query: QueryRecord
}) {
  return (
    <nav
      aria-label="数据视图"
      className="grid grid-cols-1 rounded-lg border bg-muted/35 p-1 sm:grid-cols-3"
    >
      {modes.map((mode) => (
        <Link
          key={mode}
          href={buildDataViewHref(pathname, mode, query)}
          aria-current={current === mode ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-2 text-center text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            current === mode
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {dataViewLabels[mode]}
        </Link>
      ))}
    </nav>
  )
}
