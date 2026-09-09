"use client"

import { useMemo, type ReactNode } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { IconAlertCircle, IconDatabaseOff, IconLock } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import type { FixtureErr } from "@/lib/fixtures/contract"
import { cn } from "@/lib/utils"

// F-007 八态（每页都要）：normal / loading / empty / partial / stale / error / forbidden / disabled。
// mock 期用 `?state=` 切给老板看；接真数据后由响应 state 驱动，同一个壳。
export type PageState = "normal" | "loading" | "empty" | "partial" | "stale" | "error" | "forbidden" | "disabled"
export const pageStates: { value: PageState; label: string }[] = [
  { value: "normal", label: "正常" },
  { value: "loading", label: "加载中" },
  { value: "empty", label: "空" },
  { value: "partial", label: "覆盖不全" },
  { value: "stale", label: "数据过期" },
  { value: "error", label: "查询失败" },
  { value: "forbidden", label: "无权限" },
  { value: "disabled", label: "示例态" },
]

export function usePageState(): PageState {
  const params = useSearchParams()
  const value = params.get("state")
  return pageStates.some((item) => item.value === value) ? (value as PageState) : "normal"
}

/** 页头右侧的态切换（mock 演示用；真数据接入后隐藏） */
export function StateSwitch() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const state = usePageState()
  if (process.env.NEXT_PUBLIC_KA_DATA_PROVIDER !== "mock") return null
  return (
    <Select value={state} onValueChange={(value) => { const next = new URLSearchParams(params.toString()); if (value === "normal") next.delete("state"); else next.set("state", value); router.replace(`${pathname}${next.size ? `?${next}` : ""}`) }}>
      <SelectTrigger size="sm" className="w-36" aria-label="页面状态"><span className="text-muted-foreground">态</span><SelectValue /></SelectTrigger>
      <SelectContent align="end">{pageStates.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
  )
}

/** 「示例」角标：数据源未接或 P2 的区块——降饱和 + 一句解锁条件；绝不造真实感假数据 */
export function ExampleBadge({ className }: { className?: string }) {
  return <Badge variant="secondary" className={cn("pointer-events-none select-none", className)}>示例</Badge>
}
export function ExampleBlock({ unlock, children, className, inline = false }: { unlock: string; children: ReactNode; className?: string; inline?: boolean }) {
  return (
    <div className={cn("relative", className)} data-example>
      <div className="opacity-80 saturate-50">{children}</div>
      {/* 角标以前是 absolute top-3 right-3，会压住内容右上角的按钮（商品池「新建商品」被盖住）；改成跟解锁说明同一行，不遮挡任何可点区域 */}
      <p className={cn("flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground", inline ? "mt-1" : "mt-2 px-1")}>
        <ExampleBadge />
        示例数据，解锁条件：{unlock}
      </p>
    </div>
  )
}

function Blocking({ kind, title, description, requestId }: { kind: "empty" | "error" | "forbidden"; title: string; description: string; requestId?: string }) {
  const Icon = kind === "empty" ? IconDatabaseOff : kind === "error" ? IconAlertCircle : IconLock
  return (
    <Card role={kind === "error" ? "alert" : "status"} className="border-dashed">
      <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <span className="rounded-full bg-muted p-3"><Icon className="size-6 text-muted-foreground" /></span>
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        {requestId ? <p className="text-xs text-muted-foreground">排查编号 <span className="font-mono">{requestId}</span>（找我们排查时报这串）</p> : null}
      </CardContent>
    </Card>
  )
}

export function LoadingBlock({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="正在加载" className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-3 @5xl/main:grid-cols-6">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)}</div>
      <Skeleton className="h-10 rounded-lg" />
      {Array.from({ length: rows }).map((_, index) => <Skeleton key={index} className="h-12 rounded-lg" />)}
    </div>
  )
}

/**
 * 八态壳。normal/partial/stale 渲染 children（partial/stale 顶部带条）；loading/empty/error/forbidden 替换 children；
 * disabled = 示例态（children 降饱和 + 角标 + 解锁条件）。
 */
export function StateFrame({ state, children, empty, error, unlock = "对应后端接口（见状态文件）接入后自动切换为真数据", staleNote, partialNote, className }: {
  state: PageState
  children: ReactNode
  empty?: { title?: string; description?: string }
  error?: FixtureErr["error"] | null
  unlock?: string
  staleNote?: string
  partialNote?: string
  className?: string
}) {
  const banner = useMemo(() => {
    if (state === "partial") return { tone: "bg-status-warning/10 text-status-warning border-status-warning/30", text: partialNote ?? "覆盖不完整：只展示已返回的部分，不做全量结论，执行入口置灰。" }
    if (state === "stale") return { tone: "bg-status-critical/10 text-status-critical border-status-critical/30", text: staleNote ?? "今日数据未更新，当前展示为昨日数据；执行入口已置灰。" }
    return null
  }, [state, partialNote, staleNote])

  if (state === "loading") return <div className={className}><LoadingBlock /></div>
  if (state === "empty") return <div className={className}><Blocking kind="empty" title={empty?.title ?? "当前范围内没有数据"} description={empty?.description ?? "调整筛选或时间范围后重试；系统不会用 0 或旧值填充。"} /></div>
  if (state === "error") return <div className={className}><Blocking kind="error" title="数据查询失败" description={error?.message ?? "请稍后重试；系统不会用旧值或 0 静默替代。"} requestId={error?.requestId ?? "fixture-error"} /></div>
  if (state === "forbidden") return <div className={className}><Blocking kind="forbidden" title="当前身份无访问权限" description={error?.message ?? "这些数据不在你被授权的账户范围内，系统不会越权展示。要开权限：找工作区管理员在「治理后台 · 成员与授权」加授权。"} requestId={error?.requestId ?? "fixture-403"} /></div>
  if (state === "disabled") return <div className={className}><ExampleBlock unlock={unlock}>{children}</ExampleBlock></div>
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {banner ? <div role="alert" className={cn("flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm", banner.tone)}><IconAlertCircle className="size-4 shrink-0" />{banner.text}</div> : null}
      {children}
    </div>
  )
}
