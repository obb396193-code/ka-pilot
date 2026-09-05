"use client"

import { useCallback } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

// 视图收敛：子功能做页内 tab（`?tab=`），不加侧栏项、不开一级路由（F-007 规则）
export function usePageTab<T extends string>(tabs: readonly { value: T }[], fallback: T): [T, (next: T) => void] {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const raw = params.get("tab")
  const current = tabs.some((tab) => tab.value === raw) ? (raw as T) : fallback
  const setTab = useCallback((next: T) => {
    const search = new URLSearchParams(params.toString())
    if (next === fallback) search.delete("tab"); else search.set("tab", next)
    router.replace(`${pathname}${search.size ? `?${search}` : ""}`)
  }, [router, pathname, params, fallback])
  return [current, setTab]
}

export function PageTabs<T extends string>({ tabs, value, onChange }: { tabs: readonly { value: T; label: string; badge?: number | string | null }[]; value: T; onChange: (next: T) => void }) {
  return (
    <div className="px-4 lg:px-6">
      <Tabs value={value} onValueChange={(next) => onChange(next as T)}>
        <TabsList variant="line" className="flex-wrap">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              {tab.badge !== undefined && tab.badge !== null ? <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">{tab.badge}</span> : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
