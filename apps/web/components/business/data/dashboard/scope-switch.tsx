"use client"

import { useState } from "react"
import { IconUser, IconUsersGroup } from "@tabler/icons-react"
import { toast } from "sonner"

import { useSession } from "@/components/business/session/session-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * F8-19（v1.9.23）：数据分析页顶部的「个人 | 团队」。
 * ★不是另造一套视角开关——它调的就是左下角空间切换器那**同一个** `switchWorkspace`，
 * 所以两处永远一致，切完也留在本页（换的是数据源不是路由）：
 * 个人 = 启航授权账户，团队 = ka-data。
 * 会话里没有对应空间时按钮禁用并说明原因，而不是给个点了没反应的按钮。
 */
export function ScopeSwitch() {
  const { session, switching, switchWorkspace } = useSession()
  const [pending, setPending] = useState<string | null>(null)
  if (!session) return null

  const current = session.activeWorkspace.kind
  const personal = session.workspaces.find((workspace) => workspace.kind === "personal")
  const team = session.workspaces.find((workspace) => workspace.kind === "team")

  const go = async (target: typeof personal, kind: "personal" | "team") => {
    if (!target || target.id === session.activeWorkspace.id) return
    setPending(kind)
    const result = await switchWorkspace(target.id)
    setPending(null)
    if (!result.ok) toast.error("切换失败", { description: result.message })
  }

  const item = (kind: "personal" | "team", label: string, workspace: typeof personal, Icon: typeof IconUser) => {
    const active = current === kind
    return (
      <Button
        key={kind}
        size="sm"
        variant="ghost"
        aria-pressed={active}
        disabled={!workspace || switching}
        title={workspace ? workspace.name : kind === "team" ? "这个账号还没有团队空间" : "这个账号还没有个人空间"}
        className={cn("h-7 gap-1.5 rounded-md px-2.5 text-xs font-normal", active && "bg-foreground text-background hover:bg-foreground hover:text-background")}
        onClick={() => void go(workspace, kind)}
      >
        <Icon className="size-3.5" />
        {pending === kind ? "切换中…" : label}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center rounded-lg border p-0.5" role="group" aria-label="数据范围">
        {item("personal", "个人", personal, IconUser)}
        {item("team", "团队", team, IconUsersGroup)}
      </div>
      <span className="hidden text-xs text-muted-foreground @3xl/main:inline">
        {current === "team" ? "团队 · 全渠道，来自 KA Data" : "个人 · 本人授权账户，来自启航"}
      </span>
    </div>
  )
}
