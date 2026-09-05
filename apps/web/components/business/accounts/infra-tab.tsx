"use client"

import { useState } from "react"
import { IconChevronRight } from "@tabler/icons-react"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { ExampleBlock } from "@/components/business/state/page-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { infraFixture, poolStatusMap } from "@/lib/fixtures/accounts"
import { isOk } from "@/lib/fixtures/contract"
import { cn } from "@/lib/utils"

// 基建管理（P1，OS 联调前示例态）：左队列 + 中矩阵表单 → 结构化指令预览 + 右状态机（B 主 A 兜底：未取得回执不显「配置成功」）
const states = ["generated_unsent", "sent", "acked", "applied", "verified"] as const
const stateLabel: Record<(typeof states)[number], string> = { generated_unsent: "已生成未发送", sent: "已发送 OS", acked: "OS 已回执", applied: "已配置", verified: "已回读核验" }

export function InfraTab() {
  const data = isOk(infraFixture) ? infraFixture.data : null
  const [current, setCurrent] = useState(data?.queue[0]?.accountId ?? "")
  const request = data?.items.find((item) => item.accountId === current) ?? data?.items[0] ?? null
  const [form, setForm] = useState({ materials: request?.params.materials ?? 3, targeting: request?.params.targeting ?? 2, bids: request?.params.bids.join(", ") ?? "38, 42" })
  const [preview, setPreview] = useState<string | null>(request?.compiledPrompt ?? null)
  const bids = form.bids.split(",").map((value) => value.trim()).filter(Boolean)
  const units = form.materials * form.targeting * bids.length
  const currentState = (request?.status ?? "generated_unsent") as (typeof states)[number]

  return (
    <ExampleBlock unlock="基建管理（P1）：OS 对话托管联调通过后，这里的指令真正发到 OS 并回读结构">
      <div className="grid gap-4 @5xl/main:grid-cols-12">
        <Card className="@5xl/main:col-span-3">
          <CardHeader><CardTitle className="text-sm">待搭建队列</CardTitle><CardDescription>来源：开户完成 / 手动加入</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data?.queue.map((row) => (
              <button key={row.accountId} type="button" onClick={() => setCurrent(row.accountId)} className={cn("flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted/50", current === row.accountId && "border-foreground ring-1 ring-foreground")}>
                <span className="font-mono text-xs">{row.accountId}</span>
                <span className="text-xs text-muted-foreground">{poolStatusMap[row.poolStatus].label} · {row.source === "open_flow" ? "开户流程" : row.source} · 自 {row.since.slice(5)}</span>
              </button>
            ))}
          </CardContent>
        </Card>
        <Card className="@5xl/main:col-span-6">
          <CardHeader><CardTitle className="text-sm">矩阵搭建表单</CardTitle><CardDescription>素材 × 定向 × 出价 → 结构化指令（模板 {request?.templateVersion ?? "matrix-v1"}）</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="grid gap-1.5"><Label>素材数</Label><Input type="number" min={1} value={form.materials} onChange={(event) => setForm((prev) => ({ ...prev, materials: Number(event.target.value) || 1 }))} /></div>
              <div className="grid gap-1.5"><Label>定向数</Label><Input type="number" min={1} value={form.targeting} onChange={(event) => setForm((prev) => ({ ...prev, targeting: Number(event.target.value) || 1 }))} /></div>
              <div className="grid gap-1.5"><Label>出价（逗号分隔）</Label><Input value={form.bids} onChange={(event) => setForm((prev) => ({ ...prev, bids: event.target.value }))} /></div>
            </div>
            <div className="flex items-center gap-2 text-sm"><TypeChip>{form.materials} 素材</TypeChip>×<TypeChip>{form.targeting} 定向</TypeChip>×<TypeChip>{bids.length} 出价</TypeChip>=<span className="font-medium tabular-nums">{units} unit</span>{request ? <span className="text-xs text-muted-foreground">· 日上限 {request.dailyCap}</span> : null}</div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => { setPreview(`（结构化指令摘要：${form.materials} 素材 × ${form.targeting} 定向 × ${bids.length} 出价 = ${units} unit；出价 ${bids.join(" / ")}）`); toast("已生成结构化指令预览") }}>生成指令预览</Button>
              <Button size="sm" variant="outline" disabled={!preview} onClick={() => toast("已发送到 OS 会话", { description: "POST /infra/requests/:id/send；回执前不显「配置成功」" })}>发送到 OS</Button>
            </div>
            {preview ? <pre className="rounded-lg bg-muted/50 p-3 text-xs whitespace-pre-wrap">{preview}</pre> : null}
          </CardContent>
        </Card>
        <Card className="@5xl/main:col-span-3">
          <CardHeader><CardTitle className="text-sm">状态机</CardTitle><CardDescription>B 主 A 兜底 · 未取得回执不显「配置成功」</CardDescription></CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-2">
              {states.map((state, index) => { const reached = states.indexOf(currentState) >= index; const active = currentState === state; return <li key={state} className="flex items-center gap-2 text-sm"><StatusChip tone={active ? "progress" : reached ? "success" : "pending"}>{active ? "当前" : reached ? "完成" : "待"}</StatusChip>{stateLabel[state]}{index < states.length - 1 ? <IconChevronRight className="ml-auto size-3.5 text-muted-foreground/50" /> : null}</li> })}
            </ol>
            {request ? <p className="mt-3 text-xs text-muted-foreground">thread {request.threadId ?? "未建"} · 发起 {request.initiator.slice(-4)} · 凭证 {request.credentialOwnerUserId.slice(-4)}{request.scheduled ? " · 定时" : ""}</p> : null}
          </CardContent>
        </Card>
      </div>
    </ExampleBlock>
  )
}
