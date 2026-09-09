"use client"

import { useEffect, useMemo, useState } from "react"
import { IconAlertTriangle, IconCheck, IconChecks, IconFlask, IconRefresh } from "@tabler/icons-react"
import { toast } from "sonner"

import { MissingValue, StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { useSession } from "@/components/business/session/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { fmtTime, isOk } from "@/lib/fixtures/contract"
import {
  accountNamesFixture, filledSegmentCount, mediaOptions, namingRulesFixture, namingRulesTestFixture,
  parseStatusMeta, segmentSourceLabel, separatorOptions,
  type AccountNameParse, type DryRunResponse, type NamingRule, type ParseStatus,
} from "@/lib/fixtures/naming"

// 治理后台第七个 tab「归属清洗」（契约 v1.8）：规范模板 + 干跑 / 待确认列表 / 单条编辑 / 批量确认。
// 老板铁律：归属性质的字段都要能人工改，改完不被自动流程覆盖 —— 改过的段打「人工」角标，重解析跳过。
const statusFilters: { value: ParseStatus | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "parsed", label: "解析成功" },
  { value: "partial", label: "部分成功" },
  { value: "failed", label: "解析失败" },
  { value: "conflict", label: "冲突" },
  { value: "confirmed", label: "已确认" },
]

const DRY_RUN_PLACEHOLDER = "一行一个账户名"

export function NamingTab() {
  const { isMock } = useSession()
  const [media, setMedia] = useState("KUAISHOU")
  const [status, setStatus] = useState<ParseStatus | "all">("all")
  const [keyword, setKeyword] = useState("")
  const [separators, setSeparators] = useState<string[]>([])
  const [sample, setSample] = useState("")
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null)
  const [dryRunning, setDryRunning] = useState(false)
  const [editing, setEditing] = useState<AccountNameParse | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState<string[]>([])

  const rule: NamingRule | null = isOk(namingRulesFixture) ? namingRulesFixture.data : null
  const allRows = useMemo(() => (isOk(accountNamesFixture) ? accountNamesFixture.data.items : []), [])

  useEffect(() => { if (rule) { setSeparators(rule.separators); setSample(allRows.slice(0, 2).map((row) => row.accountName).join("\n")) } }, [rule, allRows])

  const rows = useMemo(() => allRows.filter((item) =>
    item.media === media &&
    (status === "all" || item.status === status || (status === "confirmed" && confirmed.includes(item.accountId))) &&
    (keyword.trim() === "" || item.accountName.includes(keyword.trim()) || item.accountId.includes(keyword.trim())),
  ), [allRows, media, status, keyword, confirmed])

  const pendingParsed = allRows.filter((item) => item.media === media && item.status === "parsed" && !confirmed.includes(item.accountId))
  const segments = rule?.segments ?? []

  /** 干跑：真实模式打 POST /admin/naming-rules/test；mock 模式回放 fixture */
  const runDryRun = async () => {
    const names = sample.split("\n").map((line) => line.trim()).filter(Boolean)
    if (names.length === 0) { toast("先贴几个账户名", { description: "一行一个" }); return }
    setDryRunning(true)
    try {
      if (isMock) {
        setDryRun(isOk(namingRulesTestFixture) ? namingRulesTestFixture.data : null)
        return
      }
      const response = await fetch(`/api/internal/admin/naming-rules/test?media=${encodeURIComponent(media)}`, {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sampleNames: names, separators }),
      })
      const body = await response.json().catch(() => null)
      if (!response.ok || !body?.ok) { toast.error("干跑失败", { description: body?.error?.message ?? `请求失败（${response.status}）` }); return }
      setDryRun(body.data as DryRunResponse)
    } finally {
      setDryRunning(false)
    }
  }

  const openEdit = (item: AccountNameParse) => {
    setEditing(item)
    setDraft(Object.fromEntries(segments.map((segment) => [segment.key, item.segments[segment.key]?.value ?? ""])))
  }

  if (!rule) return <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">还没有命名规范模板。</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={media} onValueChange={setMedia}>
          <SelectTrigger size="sm" className="w-32" aria-label="渠道"><span className="text-muted-foreground">渠道</span><SelectValue /></SelectTrigger>
          <SelectContent>{mediaOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <Badge variant="outline">规范 v{rule.version}{rule.effectiveFrom ? ` · ${rule.effectiveFrom} 起` : ""} · {segments.length} 段</Badge>
        <Button size="sm" variant="outline" onClick={() => toast("已发起重解析", { description: "人工改过的段会跳过，不被覆盖" })}><IconRefresh className="size-4" />重解析</Button>
        {rule.note ? <span className="text-xs text-muted-foreground">{rule.note}</span> : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">规范模板</CardTitle>
          <CardDescription>按渠道分别存、按版本留痕；改了规范不追溯已确认的账户。分隔符可以多选——各家「杠」不一样。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">分隔符</span>
            {separatorOptions.map((item) => {
              const active = separators.includes(item.value)
              return (
                <Button key={item.value} size="sm" variant={active ? "default" : "outline"} className="h-7 text-xs"
                  onClick={() => setSeparators((prev) => (active ? prev.filter((value) => value !== item.value) : [...prev, item.value]))}>
                  {item.label}
                </Button>
              )
            })}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted"><TableRow><TableHead className="w-12">序</TableHead><TableHead>段</TableHead><TableHead>取值方式</TableHead><TableHead>必填</TableHead><TableHead>可多值</TableHead><TableHead>对应系统维度</TableHead></TableRow></TableHeader>
              <TableBody>
                {segments.map((segment) => (
                  <TableRow key={segment.key}>
                    <TableCell className="tabular-nums text-muted-foreground">{segment.order + 1}</TableCell>
                    <TableCell className="font-medium">{segment.label}</TableCell>
                    <TableCell>
                      <TypeChip>{segmentSourceLabel[segment.source]}</TypeChip>
                      {segment.values?.length ? <span className="ml-2 text-xs text-muted-foreground">{segment.values.slice(0, 3).join(" / ")}{segment.values.length > 3 ? ` 等 ${segment.values.length} 项` : ""}</span> : null}
                      {segment.pattern ? <span className="ml-2 font-mono text-[11px] text-muted-foreground">{segment.pattern}</span> : null}
                    </TableCell>
                    <TableCell>{segment.required ? "是" : "否"}</TableCell>
                    <TableCell>{segment.multi ? "是" : "否"}</TableCell>
                    <TableCell>{segment.mapsTo ? <TypeChip>{segment.mapsTo}</TypeChip> : <MissingValue />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium"><IconFlask className="size-4" />干跑：贴一批账户名，看这套规范解析成什么</span>
              {dryRun ? <span className="text-xs text-muted-foreground tabular-nums">{dryRun.results.length} 条 · 命中 {(dryRun.hitRate * 100).toFixed(0)}%</span> : null}
            </div>
            <Textarea value={sample} onChange={(event) => setSample(event.target.value)} rows={3} className="bg-background font-mono text-xs" placeholder={DRY_RUN_PLACEHOLDER} />
            <div className="mt-2 flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={dryRunning} onClick={() => void runDryRun()}>{dryRunning ? "解析中…" : "干跑一次"}</Button>
              <span className="text-[11px] text-muted-foreground">只算不写库；改完规范先干跑，确认命中率再保存。</span>
            </div>

            {dryRun ? (
              <div className="mt-2 overflow-x-auto rounded-lg border bg-background">
                <Table>
                  <TableHeader className="bg-muted"><TableRow><TableHead>账户名</TableHead><TableHead className="w-24">结果</TableHead><TableHead>解析出的段</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {dryRun.results.map((row) => {
                      const meta = parseStatusMeta[row.status] ?? parseStatusMeta.failed
                      return (
                        <TableRow key={row.accountName}>
                          <TableCell className="max-w-64 truncate font-mono text-xs">{row.accountName}</TableCell>
                          <TableCell><StatusChip tone={meta.tone}>{meta.label}</StatusChip></TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {segments.map((segment) => {
                                const parsed = row.segments[segment.key]
                                return parsed?.value ? <TypeChip key={segment.key}>{segment.label} {parsed.value}</TypeChip> : null
                              })}
                              {filledSegmentCount(row.segments) === 0 ? <span className="text-xs text-muted-foreground">一段都没匹配上</span> : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => { setSeparators(rule.separators); setDryRun(null) }}>还原</Button>
            <Button size="sm" onClick={() => toast.success("规范已存为新版本", { description: `v${rule.version + 1} · 已确认的账户不追溯` })}>保存为新版本</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><CardTitle className="text-base">待确认</CardTitle><CardDescription>冲突的必须人工看，系统绝不静默选一边</CardDescription></div>
            <div className="flex flex-wrap items-center gap-2">
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜账户名 / ID" className="h-8 w-40" aria-label="搜索" />
              <Button size="sm" disabled={pendingParsed.length === 0} onClick={() => { setConfirmed((prev) => [...prev, ...pendingParsed.map((item) => item.accountId)]); toast.success(`已确认 ${pendingParsed.length} 条`, { description: "只过「解析成功」的，冲突和失败仍需人工看" }) }}>
                <IconChecks className="size-4" />一键确认解析成功的{pendingParsed.length ? `（${pendingParsed.length}）` : ""}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Tabs value={status} onValueChange={(value) => setStatus(value as ParseStatus | "all")}>
            <TabsList>{statusFilters.map((item) => {
              const count = item.value === "all"
                ? allRows.filter((row) => row.media === media).length
                : allRows.filter((row) => row.media === media && (row.status === item.value || (item.value === "confirmed" && confirmed.includes(row.accountId)))).length
              return <TabsTrigger key={item.value} value={item.value}>{item.label}<Badge variant="secondary" className="ml-1">{count}</Badge></TabsTrigger>
            })}</TabsList>
          </Tabs>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">这个筛选下没有账户。</p>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((item) => {
                const isConfirmed = confirmed.includes(item.accountId) || item.status === "confirmed"
                const meta = parseStatusMeta[isConfirmed ? "confirmed" : item.status] ?? parseStatusMeta.failed
                const overrides = Object.keys(item.override ?? {})
                const conflicts = item.conflicts ?? []
                return (
                  <div key={item.accountId} className="rounded-lg border px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs">{item.accountName}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                          <span>{item.accountId}</span>
                          <span>解析出 {filledSegmentCount(item.segments)} / {segments.length} 段</span>
                          {item.taskIds.length ? <span>任务 {item.taskIds.join(" / ")}</span> : null}
                          {overrides.length ? <TypeChip>{overrides.length} 段人工改过</TypeChip> : null}
                          <span>解析于 {fmtTime(item.parsedAt)}</span>
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" variant="outline" onClick={() => openEdit(item)}>逐段编辑</Button>
                        {!isConfirmed ? <Button size="sm" disabled={item.status === "conflict" || item.status === "failed"} title={item.status === "conflict" ? "先解决冲突再确认" : item.status === "failed" ? "先逐段编辑补齐" : ""} onClick={() => { setConfirmed((prev) => [...prev, item.accountId]); toast.success("已确认") }}><IconCheck className="size-4" />确认</Button> : null}
                      </div>
                    </div>

                    {conflicts.length ? (
                      <div className="mt-2 rounded-lg border border-status-critical/30 bg-status-critical/5 p-2">
                        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-status-critical"><IconAlertTriangle className="size-3.5" />{conflicts.length} 处冲突，选一边</p>
                        <div className="flex flex-col gap-1.5">
                          {conflicts.map((conflict) => (
                            <div key={conflict.field} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="w-20 shrink-0 text-muted-foreground">{conflict.field}</span>
                              <Button size="sm" variant="outline" className="h-7" onClick={() => toast.success(`${conflict.field} 采用昵称`, { description: `${conflict.fromNickname}（标为人工改，重解析不覆盖）` })}>昵称说：{conflict.fromNickname}</Button>
                              <span className="text-muted-foreground">vs</span>
                              <Button size="sm" variant="outline" className="h-7" onClick={() => toast.success(`${conflict.field} 采用平台`, { description: `${conflict.fromPlatform}（标为人工改，重解析不覆盖）` })}>平台说：{conflict.fromPlatform}</Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>逐段编辑</SheetTitle>
            <SheetDescription className="font-mono text-xs">{editing?.accountName}</SheetDescription>
          </SheetHeader>
          {editing ? (
            <div className="flex flex-col gap-3 px-4 pb-4">
              <p className="text-xs text-muted-foreground">改过的段会打「人工」角标，永远优先于自动解析，重解析不会覆盖。</p>
              {segments.map((segment) => {
                const original = editing.segments[segment.key]?.value ?? ""
                const value = draft[segment.key] ?? ""
                const changed = value !== original
                const wasOverridden = Boolean(editing.override?.[segment.key])
                return (
                  <div key={segment.key} className="grid gap-1.5">
                    <Label htmlFor={`seg-${segment.key}`} className="flex items-center gap-1.5">
                      {segment.label}
                      {changed || wasOverridden ? <TypeChip>人工</TypeChip> : null}
                      {segment.required ? <span className="text-status-critical">*</span> : null}
                      {segment.mapsTo ? <span className="text-[11px] font-normal text-muted-foreground">→ {segment.mapsTo}</span> : null}
                    </Label>
                    <Input id={`seg-${segment.key}`} value={value} onChange={(event) => setDraft((prev) => ({ ...prev, [segment.key]: event.target.value }))} placeholder={segment.values?.length ? segment.values.slice(0, 2).join(" / ") : segment.pattern ?? "留空表示这段没有"} />
                  </div>
                )
              })}
            </div>
          ) : null}
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={() => { const changed = editing ? segments.filter((segment) => (draft[segment.key] ?? "") !== (editing.segments[segment.key]?.value ?? "")).length : 0; setEditing(null); toast.success("已保存", { description: changed ? `${changed} 段标为人工改，重解析不覆盖` : "没有改动" }) }}>保存</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}

