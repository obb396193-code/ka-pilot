"use client"

import { useEffect } from "react"
import Link from "next/link"
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

// 页面级错误边界：一个页崩了不整站白屏，保留侧栏 / 面包屑，给「重试」和 requestId 线索。
export default function MainError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[page-error]", error) }, [error])
  return (
    <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <IconAlertTriangle className="size-8 text-status-critical" />
          <p className="font-medium">这个页面没能打开</p>
          <p className="max-w-md text-sm text-muted-foreground">不是你的操作问题。可以先重试；一直失败就把下面这串编号发给我们，能定位到具体那次请求。</p>
          <p className="font-mono text-xs text-muted-foreground">{error.digest ?? error.message.slice(0, 120) ?? "无编号"}</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={reset}><IconRefresh />重试</Button>
            <Button asChild size="sm" variant="outline"><Link href="/">回工作台</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
