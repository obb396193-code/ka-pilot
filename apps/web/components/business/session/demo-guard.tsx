"use client"

import { IconEye } from "@tabler/icons-react"

import { useSession } from "@/components/business/session/session-provider"

// F8-12（契约 v1.9.6 / v1.9.12 改口）：访客浏览。
// 演示空间 = kind:"team" + isDemo:true；只读身份 = role:"viewer"，后端对写类请求一律 403 READ_ONLY_ROLE。
// 界面这一侧只做一件事：把「这是演示数据」说在前面。
// ★老板 2026-09-09 拍板：访客看到的和正常用户完全一样，不隐藏任何入口——
// 写类请求由后端 403 READ_ONLY_ROLE 兜底，前端不做可见性区别。

/** 顶部常驻条：演示空间才出。放在页头下面、内容之上，和移动端值守条同一位置。 */
export function DemoBanner() {
  const { isDemo } = useSession()
  if (!isDemo) return null
  return (
    <div className="flex items-start gap-2 border-b bg-status-warning/10 px-4 py-2.5 text-xs" role="status">
      <IconEye className="mt-0.5 size-4 shrink-0 text-status-warning" />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">演示数据 · 只读</span>
        <span className="mx-1">·</span>
        这里的账户、任务、金额都是脱敏样例，不是你们的真实投放数据；想用真数据找管理员开户。
      </p>
    </div>
  )
}
