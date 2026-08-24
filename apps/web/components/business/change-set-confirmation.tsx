"use client"

import { useState } from "react"
import { IconCheck, IconLock, IconShieldCheck } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { ChangeSetPreviewData } from "@/lib/data/contracts"

export function ChangeSetConfirmation({ data, blocked }: { data: ChangeSetPreviewData; blocked: boolean }) {
  const [riskRead, setRiskRead] = useState(false)
  const [previewConfirmed, setPreviewConfirmed] = useState(false)

  return (
    <Card className="shadow-xs">
      <CardHeader className="flex-row items-center justify-between gap-3"><CardTitle>人工确认门</CardTitle><Badge variant="outline">只读预览</Badge></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border bg-muted/45 p-4 text-sm"><IconLock className="mt-0.5 size-4 shrink-0" /><div><div className="font-medium">未接执行器 · 媒体写操作未开放</div><p className="mt-1 text-muted-foreground">本页不调用 confirm、job 或媒体端点；二次确认只记录当前浏览器的预览状态。</p></div></div>
        <Button type="button" variant={riskRead ? "secondary" : "outline"} className="w-full" disabled={blocked} onClick={() => { setRiskRead(true); setPreviewConfirmed(false) }}>
          {riskRead ? <IconCheck /> : <IconShieldCheck />}{riskRead ? "第一步已完成：已阅读风险与回滚条件" : "第一步：阅读风险与回滚条件"}
        </Button>
        <Button type="button" className="w-full" disabled={blocked || !riskRead} onClick={() => setPreviewConfirmed(true)}>
          第二步：确认预览（不执行）
        </Button>
        {blocked ? <p role="alert" className="text-sm text-destructive">数据过期或不完整，预览确认已禁用。</p> : null}
        {previewConfirmed ? <p role="status" className="rounded-lg border p-3 text-sm">预览已确认；未调用任何媒体写接口。</p> : null}
        <p className="text-xs text-muted-foreground">executionEndpointConfigured = {String(data.executionEndpointConfigured)}</p>
      </CardContent>
    </Card>
  )
}
