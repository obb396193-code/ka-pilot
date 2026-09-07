"use client"

import Link from "next/link"
import { IconShieldLock } from "@tabler/icons-react"

import { useSession } from "@/components/business/session/session-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

// 无权限（403 FORBIDDEN）统一落点：说清「谁没权 / 为什么 / 怎么办」，不把人扔回登录页。
const roleLabel: Record<string, string> = { optimizer: "优化师", operator: "运营", lead: "负责人", admin: "管理员" }

export function NoAccess({ title = "你没有这个页面的权限", reason, action }: { title?: string; reason?: string; action?: React.ReactNode }) {
  const { session } = useSession()
  const active = session?.activeWorkspace
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
        <IconShieldLock className="size-8 text-muted-foreground" />
        <p className="font-medium">{title}</p>
        <p className="max-w-md text-sm text-muted-foreground">{reason ?? "这个对象不在你被授权的账户范围内，或者当前空间是只读的。"}</p>
        <p className="text-xs text-muted-foreground">当前空间 {active?.name ?? "−"} · {active ? roleLabel[active.role] ?? active.role : "−"}{active?.readOnly ? " · 只读" : ""}</p>
        <div className="mt-2 flex gap-2">
          {action ?? <Button asChild size="sm" variant="outline"><Link href="/">回工作台</Link></Button>}
        </div>
        <p className="text-xs text-muted-foreground">要开权限：找工作区管理员在「治理后台 · 成员与授权」加授权。</p>
      </CardContent>
    </Card>
  )
}
