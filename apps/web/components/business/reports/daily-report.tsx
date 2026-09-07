"use client"

import { useState } from "react"
import { IconBrandDingtalk, IconFileTypePdf } from "@tabler/icons-react"
import { toast } from "sonner"

import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { KpiCards } from "@/components/business/workbench/kpi-cards"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { DisplayMetric } from "@/lib/data/contracts"
import { fmtTime, isOk, mv, rv } from "@/lib/fixtures/contract"
import { dailyFixture, dailyRoleLabel, type DailyModule, type DailyReport } from "@/lib/fixtures/reports"
import { cn } from "@/lib/utils"

// 日报 daily-report/v1：12 模块 + 分角色 + 一键推钉钉 / 导出 PDF；缺数三态（有数 / 无数据 / UNSUPPORTED）
function ModuleBody({ module }: { module: DailyModule }) {
  if (module.cards) {
    const metrics: DisplayMetric[] = [
      { key: "cost", label: "账面消耗", value: mv(module.cards.cost, "money0"), delta: null, tone: "neutral" },
      { key: "cashCost", label: "现金消耗", value: mv(module.cards.cashCost, "money0"), delta: null, tone: "neutral" },
      { key: "realConversion", label: "真实转化", value: mv(module.cards.realConversion), delta: null, tone: "neutral" },
      { key: "cashCpa", label: "现金 CPA", value: rv(module.cards.cashCpa, "money"), delta: null, tone: "neutral" },
      { key: "onTargetRate", label: "达标率", value: rv(module.cards.onTargetRate), delta: null, tone: "neutral" },
      { key: "costSpace", label: "成本空间", value: mv(module.cards.costSpace, "money0"), delta: null, tone: "neutral" },
    ]
    return (
      <div className="flex flex-col gap-3">
        <KpiCards metrics={metrics} className="px-0 lg:px-0" />
        {module.anomalies?.length ? <ul className="flex flex-col gap-1 text-sm">{module.anomalies.map((item) => <li key={item} className="flex items-center gap-2"><span className={cn("size-1.5 rounded-full", item.includes("P0") ? "bg-status-critical" : "bg-status-warning")} />{item}</li>)}</ul> : <p className="text-sm text-muted-foreground">无异常</p>}
      </div>
    )
  }
  if (module.unsupported) return <p className="text-sm text-muted-foreground">UNSUPPORTED：该维度映射未就绪（出价工具待 mapping / UBP 永久不支持），日报不出此模块数据。</p>
  if (module.status) return <p className="text-sm text-muted-foreground">{module.status === "p1_pending" ? "健康度模块 P1 待接入" : module.status}</p>
  const rows = module.rows ?? module.trend ?? []
  return rows.length ? <p className="text-sm">{rows.length} 行</p> : <p className="text-sm text-muted-foreground">本模块本日无数据（后端未返回行；不用 0 代）</p>
}

export function DailyReportView() {
  const report = isOk(dailyFixture) ? dailyFixture.data : null
  const [role, setRole] = useState<DailyReport["role"]>(report?.role ?? "optimizer")
  const [active, setActive] = useState<string>(report?.modules[0]?.key ?? "")
  if (!report) return null
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <TypeChip>{report.schema}</TypeChip>
        <span className="text-sm">{report.date} · 数据截至 {fmtTime(report.dataAsOf)}</span>
        <Select value={role} onValueChange={(value) => { setRole(value as DailyReport["role"]); toast(`切到${dailyRoleLabel[value as DailyReport["role"]]}视角`, { description: "GET /reports/daily?role= 接入后按角色裁模块；fixture 只有 optimizer" }) }}>
          <SelectTrigger size="sm" className="w-32" aria-label="角色"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(dailyRoleLabel) as DailyReport["role"][]).map((key) => <SelectItem key={key} value={key}>{dailyRoleLabel[key]}</SelectItem>)}</SelectContent>
        </Select>
        {role !== report.role ? <StatusChip tone="muted">fixture 为 {dailyRoleLabel[report.role]} 视角</StatusChip> : null}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={!report.actions.exportPdf} onClick={() => toast("已排队导出 PDF", { description: "POST /exports {kind: daily_report, format: pdf} → queued → done（签名链接有效期内下载）" })}><IconFileTypePdf />导出 PDF</Button>
          <Button size="sm" disabled={!report.actions.pushDingtalk} onClick={() => toast.success("已推送到钉钉群", { description: "卡片 L1 · 走 subscriptions daily_report 目标群" })}><IconBrandDingtalk />一键发钉钉</Button>
        </div>
      </div>
      <div className="grid gap-4 @5xl/main:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-1 rounded-xl border bg-card p-2">
          {report.modules.map((module, index) => <button key={module.key} type="button" onClick={() => setActive(module.key)} className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted", active === module.key && "bg-foreground text-background hover:bg-foreground")}><span className={cn("w-4 text-xs tabular-nums", active === module.key ? "text-background/70" : "text-muted-foreground")}>{index + 1}</span><span className="flex-1 truncate">{module.title}</span>{module.unsupported ? <span className="size-1.5 rounded-full bg-muted-foreground/40" /> : null}</button>)}
        </nav>
        <div className="flex flex-col gap-4">
          {report.modules.filter((module) => module.key === active).map((module) => (
            <Card key={module.key}>
              <CardHeader><CardTitle>{module.title}</CardTitle><CardDescription>模块 {module.key}{module.unsupported ? " · UNSUPPORTED" : ""}</CardDescription></CardHeader>
              <CardContent><ModuleBody module={module} /></CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground">12 模块字段按 docs/18 KA 日报规范；口径 = 考核用现金口径，缺数显 −。</p>
        </div>
      </div>
    </div>
  )
}
