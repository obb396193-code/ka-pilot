"use client"

import { useMemo, useState } from "react"
import { IconArrowRight, IconBrandDingtalk, IconCheck, IconFileSpreadsheet, IconLock, IconPencil } from "@tabler/icons-react"
import { toast } from "sonner"

import { MissingValue, StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { fmtTime, isOk } from "@/lib/fixtures/contract"
import { formulaText, frozenFixture, issueCodeLabel, previewFixtures, settlementTemplatesFixture, toleranceText, type PreviewRow, type SettlementField, type SettlementTemplate } from "@/lib/fixtures/reports"
import { cn } from "@/lib/utils"

// 结算单四步向导（v1.6 7.3 / 原型 P14）：模板+期间 → 字段映射 → 校验预览（blocked 不许冻结，校正入口）→ 生成与分发（冻结快照 / 导出 / 推群 / 差异转工作项）
const steps = ["模板与期间", "字段映射", "校验预览", "生成与分发"]
const money = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtValue = (field: SettlementField | undefined, value: string | number | null) => value === null || value === undefined ? "−" : typeof value === "number" ? (field?.valueType === "money" ? `¥${money.format(value)}` : field?.valueType === "rate" ? `${(value * 100).toFixed(2)}%` : value.toLocaleString("zh-CN")) : value
const checkTone = { match: "success", mismatch: "warning", undefined: "muted" } as const
const checkLabel = { match: "一致", mismatch: "不一致", undefined: "无法判断" } as const
const templates: SettlementTemplate[] = isOk(settlementTemplatesFixture) ? settlementTemplatesFixture.data.items : []

function PreviewTable({ template, rows, totals }: { template: SettlementTemplate; rows: PreviewRow[]; totals: { fieldKey: string; value: number | null }[] }) {
  const fieldOf = (key: string) => template.fields.find((field) => field.fieldKey === key)
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted"><TableRow>{template.fields.map((field) => <TableHead key={field.fieldKey} className={cn(field.valueType !== "text" && "text-right")}>{field.label}</TableHead>)}{template.checks.map((check) => <TableHead key={check.checkKey}>{check.label}</TableHead>)}</TableRow></TableHeader>
        <TableBody>
          {rows.map((row) => <TableRow key={row.rowKey}>{template.fields.map((field) => { const cell = row.fields.find((item) => item.fieldKey === field.fieldKey); return <TableCell key={field.fieldKey} className={cn("tabular-nums", field.valueType !== "text" && "text-right", cell?.source === "correction" && "bg-status-warning/10")} title={cell ? `来源 ${cell.source}` : undefined}>{cell ? fmtValue(field, cell.value) : <MissingValue />}{cell?.source === "formula" ? <span className="ml-1 text-[10px] text-muted-foreground">ƒ</span> : null}</TableCell> })}{template.checks.map((check) => { const result = row.checks.find((item) => item.checkKey === check.checkKey); return <TableCell key={check.checkKey}>{result ? <span className="flex items-center gap-1"><StatusChip tone={checkTone[result.status]}>{checkLabel[result.status]}</StatusChip>{result.difference !== null ? <span className="text-xs text-muted-foreground tabular-nums">{result.difference > 0 ? "+" : ""}{money.format(result.difference)}{result.relativeDifference !== null ? ` (${(result.relativeDifference * 100).toFixed(2)}%)` : ""}</span> : null}</span> : <MissingValue />}</TableCell> })}</TableRow>)}
          <TableRow className="bg-muted/50 font-medium">{template.fields.map((field) => { const total = totals.find((item) => item.fieldKey === field.fieldKey); return <TableCell key={field.fieldKey} className={cn("tabular-nums", field.valueType !== "text" && "text-right")}>{field.order === 1 ? "合计" : total ? fmtValue(fieldOf(field.fieldKey), total.value) : field.aggregation === "sum" ? "−" : ""}</TableCell> })}{template.checks.map((check) => <TableCell key={check.checkKey} />)}</TableRow>
        </TableBody>
      </Table>
    </div>
  )
}

export function SettlementWizard() {
  const [step, setStep] = useState(0)
  const [version, setVersion] = useState(templates[0]?.templateVersion ?? "")
  const [period, setPeriod] = useState("2026-08")
  const [sample, setSample] = useState<"blocked" | "ready">("blocked")
  const [frozenDone, setFrozenDone] = useState(false)
  const [correction, setCorrection] = useState<{ rowKey: string; field: SettlementField } | null>(null)
  const [correctionForm, setCorrectionForm] = useState({ value: "", reason: "" })
  const template = useMemo(() => templates.find((item) => item.templateVersion === version) ?? templates[0] ?? null, [version])
  const preview = isOk(previewFixtures[sample]) ? previewFixtures[sample].data : null
  const frozen = isOk(frozenFixture) ? frozenFixture.data : null
  if (!template) return null
  const labelOf = (key: string) => template.fields.find((field) => field.fieldKey === key)?.label ?? key
  const blocked = preview?.status === "blocked"
  const blockIssues = preview?.issues.filter((issue) => issue.severity === "block") ?? []

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-wrap items-center gap-2">{steps.map((label, index) => <li key={label} className="flex items-center gap-2"><button type="button" onClick={() => index <= step && setStep(index)} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm", index === step && "border-foreground bg-foreground text-background", index < step && "border-foreground/30", index > step && "text-muted-foreground")}><span className="text-xs tabular-nums">{index + 1}</span>{label}{index < step ? <IconCheck className="size-3.5" /> : null}</button>{index < steps.length - 1 ? <span className="h-px w-4 bg-border" /> : null}</li>)}</ol>

      {step === 0 ? (
        <Card>
          <CardHeader><CardTitle>模板与期间</CardTitle><CardDescription>新版本 = 新行；旧结算单绑旧版本不覆盖</CardDescription></CardHeader>
          <CardContent className="grid gap-4 @3xl/main:grid-cols-3">
            <div className="grid gap-1.5"><Label>模板版本</Label><Select value={template.templateVersion} onValueChange={setVersion}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{templates.map((item) => <SelectItem key={item.templateVersion} value={item.templateVersion}>{item.name} {item.templateVersion}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">{template.currencyCode} · 单位 {template.unitNote} · {template.fields.length} 字段 · {template.checks.length} 校验 · 指纹 {template.fingerprint.slice(0, 8)}…</p></div>
            <div className="grid gap-1.5"><Label>结算期间</Label><Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></div>
            <div className="grid gap-1.5"><Label>样例（mock）</Label><Select value={sample} onValueChange={(value) => { setSample(value as typeof sample); setFrozenDone(false) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="blocked">preview-blocked（有必填缺失）</SelectItem><SelectItem value="ready">preview-ready（可冻结）</SelectItem></SelectContent></Select></div>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardHeader><CardTitle>字段映射</CardTitle><CardDescription>带「事实」的取自白名单数据，带「公式」的由后端按模板算；允许校正的字段在预览里可改</CardDescription></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted"><TableRow><TableHead>#</TableHead><TableHead>字段</TableHead><TableHead>类型</TableHead><TableHead>汇总</TableHead><TableHead>来源</TableHead><TableHead>必填</TableHead><TableHead>可校正</TableHead></TableRow></TableHeader>
              <TableBody>{[...template.fields].sort((a, b) => a.order - b.order).map((field) => <TableRow key={field.fieldKey}><TableCell className="tabular-nums text-muted-foreground">{field.order}</TableCell><TableCell className="font-medium">{field.label}<span className="ml-2 font-mono text-xs text-muted-foreground">{field.fieldKey}</span></TableCell><TableCell><TypeChip>{field.valueType}</TypeChip></TableCell><TableCell>{field.aggregation === "sum" ? "求和" : "不汇总"}</TableCell><TableCell className="text-xs">{field.source.kind === "fact" ? <span>事实 <span className="font-mono">{field.source.factKey}</span></span> : <span>公式 = {formulaText(field.source.expression, labelOf)}</span>}</TableCell><TableCell>{field.required ? <IconCheck className="size-4" /> : <span className="text-muted-foreground">−</span>}</TableCell><TableCell>{field.allowCorrection ? <IconCheck className="size-4" /> : <span className="text-muted-foreground">−</span>}</TableCell></TableRow>)}</TableBody>
            </Table>
            <div className="border-t px-4 py-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">校验规则</p>
              {template.checks.map((check) => <p key={check.checkKey} className="text-sm">{check.label}：{labelOf(check.leftFieldKey)} vs {labelOf(check.rightFieldKey)}，容差 {toleranceText(check.tolerance)} · <StatusChip tone={check.severity === "block" ? "critical" : "warning"}>{check.severity === "block" ? "阻断" : "警告"}</StatusChip></p>)}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 && preview ? (
        <div className="flex flex-col gap-4">
          <div className={cn("rounded-lg border px-4 py-2.5 text-sm", blocked ? "border-status-critical/30 bg-status-critical/10 text-status-critical" : "border-status-success/30 bg-status-success/10 text-status-success")}>{blocked ? `阻断：${blockIssues.length} 个必填/阻断问题未解决，不许冻结` : "可冻结：无阻断问题（警告不拦冻结，但会留在结算行上）"}</div>
          <Card>
            <CardHeader><CardTitle>校验预览 · {preview.period}</CardTitle><CardDescription>运行 {preview.runId} · 数据基础 {preview.dataBasis} · 截止 {fmtTime(preview.dataCutoffAt)} · 模板指纹 {preview.templateFingerprint.slice(0, 8)}…</CardDescription></CardHeader>
            <CardContent className="p-0"><PreviewTable template={template} rows={preview.rows} totals={preview.totals} /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>问题清单</CardTitle><CardDescription>「必须处理」的不修不能过；「提醒」可以带着进冻结</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {preview.issues.length ? preview.issues.map((issue, index) => { const field = issue.fieldKey ? template.fields.find((item) => item.fieldKey === issue.fieldKey) : undefined; return <div key={`${issue.code}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><span className="flex items-center gap-2"><StatusChip tone={issue.severity === "block" ? "critical" : "warning"}>{issue.severity === "block" ? "阻断" : "警告"}</StatusChip>{issueCodeLabel[issue.code] ?? issue.code}{issue.rowKey ? <span className="text-xs text-muted-foreground">行 {issue.rowKey}</span> : null}{issue.fieldKey ? <span className="text-xs text-muted-foreground">· {labelOf(issue.fieldKey)}</span> : null}{issue.checkKey ? <span className="text-xs text-muted-foreground">· {template.checks.find((check) => check.checkKey === issue.checkKey)?.label ?? issue.checkKey}</span> : null}</span>{issue.rowKey && field ? (field.allowCorrection ? <Button size="sm" variant="outline" onClick={() => { setCorrection({ rowKey: issue.rowKey!, field }); setCorrectionForm({ value: "", reason: "" }) }}><IconPencil />校正</Button> : <span className="text-xs text-muted-foreground">该字段不允许校正，需回源补数</span>) : null}</div> }) : <p className="text-sm text-muted-foreground">无问题</p>}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="grid gap-4 @5xl/main:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>冻结</CardTitle><CardDescription>冻结后快照不随数据变；指纹固定</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-3">
              {frozenDone && frozen ? (
                <>
                  <p className="text-sm"><StatusChip tone="success">已冻结</StatusChip> {frozen.period} · 模板 {frozen.templateVersion} · {frozen.confirmedBy.name} · {fmtTime(frozen.confirmedAt)}</p>
                  <p className="font-mono text-xs text-muted-foreground">指纹 {frozen.fingerprint.slice(0, 16)}…</p>
                  <div><p className="mb-1 text-xs font-medium text-muted-foreground">结算行</p>{frozen.lines.map((line) => <div key={line.lineId} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"><span>行 {line.rowKey}{line.taskId ? ` · 任务 ${line.taskId}` : ""} · {line.checks.map((check) => `${template.checks.find((item) => item.checkKey === check.checkKey)?.label ?? check.checkKey} ${checkLabel[check.status]}`).join("，")}</span>{line.workItemId ? <TypeChip>已转工作项</TypeChip> : <Button size="sm" variant="outline" onClick={() => toast("已转工作项", { description: `接口接入后生效（当前为示例）` })}>差异转工作项</Button>}</div>)}</div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">{blocked ? "当前预览为 blocked，先回第 3 步处理阻断问题。" : "预览无阻断，可以冻结生成正式结算单。"}</p>
                  <Button disabled={blocked} onClick={() => { setFrozenDone(true); toast.success("已冻结", { description: "已生成快照与指纹" }) }}><IconLock />冻结生成</Button>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>分发</CardTitle><CardDescription>导出 Excel / 推一张需确认的群卡片</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Button variant="outline" disabled={!frozenDone} onClick={() => toast("已排队导出", { description: "排队后完成" })}><IconFileSpreadsheet />导出 xlsx</Button>
              <Button variant="outline" disabled={!frozenDone} onClick={() => toast.success("已推到群", { description: "发到结算单订阅的目标群（当前示例该订阅停用，需先启用）" })}><IconBrandDingtalk />推钉钉群</Button>
              {!frozenDone ? <p className="text-xs text-muted-foreground">冻结后才能分发，避免分发未定稿数据。</p> : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <Button variant="outline" disabled={step === 0} onClick={() => setStep((prev) => prev - 1)}>上一步</Button>
        <Button disabled={step === steps.length - 1} onClick={() => setStep((prev) => prev + 1)}>下一步<IconArrowRight /></Button>
      </div>

      <Dialog open={correction !== null} onOpenChange={(open) => { if (!open) setCorrection(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>校正 · {correction?.field.label}</DialogTitle><DialogDescription>只对允许校正的字段；留痕（改动人 / 原因 / 原值）</DialogDescription></DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5"><Label>行</Label><Input value={correction?.rowKey ?? ""} readOnly /></div>
            <div className="grid gap-1.5"><Label>校正值</Label><Input type={correction?.field.valueType === "text" ? "text" : "number"} value={correctionForm.value} onChange={(event) => setCorrectionForm((prev) => ({ ...prev, value: event.target.value }))} /></div>
            <div className="grid gap-1.5"><Label>原因（必填）</Label><Textarea value={correctionForm.reason} onChange={(event) => setCorrectionForm((prev) => ({ ...prev, reason: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCorrection(null)}>取消</Button><Button disabled={!correctionForm.value || !correctionForm.reason} onClick={() => { toast.success("已记录校正，重新预览后生效", { description: "校正会留痕；该行来源标为人工校正" }); setCorrection(null) }}>保存校正</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
