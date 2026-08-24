"use client"

import { useState } from "react"
import { IconBellOff, IconCheck, IconEye, IconX } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"

const ignoreReasons = ["已知波动", "等待数据", "暂不处理"]

export function WorkItemActions({
  accountName,
  suggestion,
  disabled,
}: {
  accountName: string
  suggestion: string
  disabled: boolean
}) {
  const [ignored, setIgnored] = useState(false)
  const [reason, setReason] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [riskRead, setRiskRead] = useState(false)
  const [previewConfirmed, setPreviewConfirmed] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Drawer onOpenChange={(open) => { if (!open) setRiskRead(false) }}>
          <DrawerTrigger asChild>
            <Button size="sm" disabled={disabled}>
              <IconEye />
              预览调整
            </Button>
          </DrawerTrigger>
          <DrawerContent>
            <div className="mx-auto w-full max-w-2xl">
              <DrawerHeader>
                <DrawerTitle>变更预览 · {accountName}</DrawerTitle>
                <DrawerDescription>仅本地确认演示，不连接媒体写端点，不会执行任何修改。</DrawerDescription>
              </DrawerHeader>
              <div className="space-y-4 px-4 pb-4">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <div className="text-xs text-muted-foreground">建议动作</div>
                  <div className="mt-2 text-sm font-medium">{suggestion}</div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">当前</div><div className="mt-1 text-sm">保持原预算与时段</div></div>
                  <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">建议</div><div className="mt-1 text-sm">收紧异常时段风险敞口</div></div>
                </div>
                <Button type="button" variant={riskRead ? "secondary" : "outline"} className="w-full" onClick={() => setRiskRead(true)}>
                  {riskRead ? <IconCheck /> : null}
                  {riskRead ? "已阅读风险与回滚条件" : "第一步：阅读风险与回滚条件"}
                </Button>
              </div>
              <DrawerFooter>
                <Button disabled={!riskRead} onClick={() => setPreviewConfirmed(true)}>
                  第二步：确认预览（不发送媒体）
                </Button>
                <DrawerClose asChild><Button variant="outline">关闭</Button></DrawerClose>
                {previewConfirmed ? <p role="status" className="text-center text-xs text-muted-foreground">预览已确认；未调用媒体写接口。</p> : null}
              </DrawerFooter>
            </div>
          </DrawerContent>
        </Drawer>
        <Button size="sm" variant="outline" onClick={() => setIgnored((value) => !value)}>
          <IconX />
          {ignored ? "取消忽略" : "忽略"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setMuted((value) => !value)}>
          <IconBellOff />
          {muted ? "已静音 3 天" : "静音 3 天"}
        </Button>
      </div>
      {ignored ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="忽略原因">
          <span className="text-xs text-muted-foreground">可选原因</span>
          {ignoreReasons.map((item) => (
            <button key={item} type="button" onClick={() => setReason(item)} className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <Badge variant={reason === item ? "default" : "outline"}>{item}</Badge>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
