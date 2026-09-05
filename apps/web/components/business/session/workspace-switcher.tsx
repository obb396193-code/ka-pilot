"use client"

import { IconLock, IconUser, IconUsersGroup } from "@tabler/icons-react"
import { toast } from "sonner"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SidebarGroup, SidebarGroupContent } from "@/components/ui/sidebar"
import { useSession } from "./session-provider"

const kindLabel = { personal: "个人 · 本人授权账户", team: "团队 · 全渠道只读" } as const

export function WorkspaceSwitcher() {
  const { status, session, switching, switchWorkspace } = useSession()
  const active = session?.activeWorkspace

  return (
    <SidebarGroup className="p-0">
      <SidebarGroupContent>
        <Select
          value={active?.id ?? ""}
          disabled={status !== "ready" || switching || !session}
          onValueChange={async (workspaceId) => {
            const result = await switchWorkspace(workspaceId)
            if (!result.ok) toast.error("切换空间失败", { description: result.message })
          }}
        >
          <SelectTrigger className="w-full bg-background" aria-label="切换数据空间">
            <SelectValue placeholder={status === "loading" ? "正在读取会话…" : "未登录"} />
          </SelectTrigger>
          <SelectContent align="start">
            {session?.workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.kind === "personal" ? <IconUser /> : <IconUsersGroup />}
                <span className="truncate">{workspace.name}</span>
                {workspace.readOnly ? <IconLock className="ml-auto size-3 text-muted-foreground" aria-label="只读" /> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="px-1 pt-1.5 text-[11px] leading-4 text-muted-foreground">
          {active ? kindLabel[active.kind] : status === "error" ? "会话服务未就绪" : "登录后可切换个人 / 团队空间"}
        </p>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
