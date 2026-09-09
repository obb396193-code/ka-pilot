"use client"

import { useMemo, useState } from "react"
import { IconAlertTriangle, IconCheck, IconChecks, IconFlask, IconRefresh } from "@tabler/icons-react"
import { toast } from "sonner"

import { MissingValue, StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { ExampleBlock } from "@/components/business/state/page-state"
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
import { fmtTime } from "@/lib/fixtures/contract"
import { accountNameParses, dryRunParse, mediaOptions, namingRules, parseStatusMeta, separatorOptions, type AccountNameParse, type ParseStatus } from "@/lib/fixtures/naming"
import { cn } from "@/lib/utils"

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

const sourceLabel: Record<string, string> = { enum: "枚举", regex: "正则", free: "自由填写" }

export function NamingTab() {
  const [media, setMedia] = useState("KUAISHOU")
  const [status, setStatus] = useState<ParseStatus | "all">("conflict")
  const [keyword, setKeyword] = useState("")
  const [separators, setSeparators] = useState<string[]>(namingRules.KUAISHOU.separators)
  const [sample, setSample] = useState("KS-CVR有端(1803240580)-自投-张三-手动-安卓-优选-激活-RTA-双十一-1024-A\n快手账户07测试")
  const [editing, setEditing] = useState<AccountNameParse | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [confirmed, setConfirmed] = useState<string[]>([])

  const rule = useMemo(() => ({ ...namingRules[media], separators }), [media, separators])
  const rows = useMemo(() => accountNameParses.filter((item) =>
    item.media === media &&
    (status === "all" || item.status === status || (status === "confirmed" && confirmed.includes(item.accountId))) &&
    (keyword.trim() === "" || item.accountName.includes(keyword.trim()) || item.accountId.includes(keyword.trim())),
  ), [media, status, keyword, confirmed])
  const dryRun = useMemo(() => sample.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => dryRunParse(line, rule)), [sample, rule])
  const hitRate = dryRun.length ? dryRun.reduce((sum, row) => sum + row.hit, 0) / dryRun.length : 0
  const pendingParsed = accountNameParses.filter((item) => item.media === media && item.status === "parsed" && !confirmed.includes(item.accountId))

  const openEdit = (item: AccountNameParse) => {
    setEditing(item)
    setDraft(Object.fromEntries(Object.entries(item.segments).map(([key, value]) => [key, value ?? ""])))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={media} onValueChange={setMedia}>
          <SelectTrigger size="sm" className="w-32" aria-label="渠道"><span className="text-muted-foreground">渠道</span><SelectValue /></SelectTrigger>
          <SelectContent>{mediaOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
        </Select>
        <Badge variant="outline">规范 v{rule.version}{rule.effectiveFrom ? ` · ${rule.effectiveFrom} 起` : ""}</Badge>
        <Button size="sm" variant="outline" onClick={() => toast("已发起重解析", { description: "人工改过的段会跳过，不被覆盖" })}><IconRefresh className="size-4" />重解析</Button>
      </div>

      <ExampleBlock unlock="归属清洗接口（规范模板 / 干跑 / 清洗列表 / 确认）接入后切换为真数据">
        <div className="flex flex-col gap-4">
          {/* 1 规范模板 + 干跑 */}
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

              {rule.segments.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">这个渠道还没有规范模板；先建模板才能解析。</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader className="bg-muted"><TableRow><TableHead className="w-12">序</TableHead><TableHead>段</TableHead><TableHead>取值方式</TableHead><TableHead>必填</TableHead><TableHead>可多值</TableHead><TableHead>对应系统维度</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {rule.segments.map((segment) => (
                        <TableRow key={segment.key}>
                          <TableCell className="tabular-nums text-muted-foreground">{segment.order}</TableCell>
                          <TableCell className="font-medium">{segment.label}</TableCell>
                          <TableCell><TypeChip>{sourceLabel[segment.source]}</TypeChip>{segment.values?.length ? <span className="ml-2 text-xs text-muted-foreground">{segment.values.slice(0, 3).join(" / ")}{segment.values.length > 3 ? ` 等 ${segment.values.length} 项` : ""}</span> : null}{segment.pattern ? <span className="ml-2 font-mono text-[11px] text-muted-foreground">{segment.pattern}</span> : null}</TableCell>
                          <TableCell>{segment.required ? "是" : "否"}</TableCell>
                          <TableCell>{segment.multi ? "是" : "否"}</TableCell>
                          <TableCell>{segment.mapsTo ? <TypeChip>{segment.mapsTo}</TypeChip> : <MissingValue />}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium"><IconFlask className="size-4" />干跑：贴一批账户名，看这套规范解析成什么</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{dryRun.length} 条 · 平均命中 {(hitRate * 100).toFixed(0)}%</span>
                </div>
                <Textarea value={sample} onChange={(event) => setSample(event.target.value)} rows={3} className="bg-background font-mono text-xs" placeholder="一行一个账户名" />
                <p className="mt-1.5 text-[11px] text-muted-foreground">本地预览，只用来看规范改得对不对；保存后以后端解析为准，不写库。</p>
                {dryRun.length ? (
                  <div className="mt-2 overflow-x-auto rounded-lg border bg-background">
                    <Table>
                      <TableHeader className="bg-muted"><TableRow><TableHead>账户名</TableHead><TableHead className="w-20 text-right">命中</TableHead><TableHead>解析结果</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {dryRun.map((row) => (
                          <TableRow key={row.name}>
                            <TableCell className="max-w-64 truncate font-mono text-xs">{row.name}</TableCell>
                            <TableCell className={cn("text-right tabular-nums", row.hit < 0.5 && "text-status-critical")}>{(row.hit * 100).toFixed(0)}%</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {rule.segments.map((segment) => {
                                  const value = row.segments[segment.key]
                                  return value ? <TypeChip key={segment.key}>{segment.label} {value}</TypeChip> : null
                                })}
                                {Object.values(row.segments).every((value) => !value) ? <span className="text-xs text-muted-foreground">一段都没匹配上</span> : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="outline" onClick={() => setSeparators(namingRules[media].separators)}>还原</Button>
                <Button size="sm" onClick={() => toast.success("规范已存为新版本", { description: `v${rule.version + 1} · 已确认的账户不追溯` })}>保存为新版本</Button>
              </div>
            </CardContent>
          </Card>

          {/* 2 待确认列表 + 4 批量确认 */}
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
                  const count = item.value === "all" ? accountNameParses.filter((row) => row.media === media).length : accountNameParses.filter((row) => row.media === media && (row.status === item.value || (item.value === "confirmed" && confirmed.includes(row.accountId)))).length
                  return <TabsTrigger key={item.value} value={item.value}>{item.label}<Badge variant="secondary" className="ml-1">{count}</Badge></TabsTrigger>
                })}</TabsList>
              </Tabs>

              {rows.length === 0 ? (
                <p className="rounded-lg border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">这个筛选下没有账户。</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {rows.map((item) => {
                    const isConfirmed = confirmed.includes(item.accountId) || item.status === "confirmed"
                    const meta = parseStatusMeta[isConfirmed ? "confirmed" : item.status]
                    return (
                      <div key={item.accountId} className="rounded-lg border px-3 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs">{item.accountName}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              <StatusChip tone={meta.tone}>{meta.label}</StatusChip>
                              <span>{item.accountId}</span>
                              {item.taskIds.length ? <span>任务 {item.taskIds.join(" / ")}</span> : null}
                              {item.overrides.length ? <TypeChip>{item.overrides.length} 段人工改过</TypeChip> : null}
                              <span>解析于 {fmtTime(item.parsedAt)}</span>
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(item)}>逐段编辑</Button>
                            {!isConfirmed ? <Button size="sm" disabled={item.status === "conflict" || item.status === "failed"} title={item.status === "conflict" ? "先解决冲突再确认" : item.status === "failed" ? "先逐段编辑补齐" : ""} onClick={() => { setConfirmed((prev) => [...prev, item.accountId]); toast.success("已确认") }}><IconCheck className="size-4" />确认</Button> : null}
                          </div>
                        </div>

                        {item.conflicts.length ? (
                          <div className="mt-2 rounded-lg border border-status-critical/30 bg-status-critical/5 p-2">
                            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-status-critical"><IconAlertTriangle className="size-3.5" />{item.conflicts.length} 处冲突，选一边</p>
                            <div className="flex flex-col gap-1.5">
                              {item.conflicts.map((conflict) => (
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
        </div>
      </ExampleBlock>

      {/* 3 单条编辑抽屉 */}
      <Sheet open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>逐段编辑</SheetTitle>
            <SheetDescription className="font-mono text-xs">{editing?.accountName}</SheetDescription>
          </SheetHeader>
          {editing ? (
            <div className="flex flex-col gap-3 px-4 pb-4">
              <p className="text-xs text-muted-foreground">改过的段会打「人工」角标，永远优先于自动解析，重解析不会覆盖。</p>
              {namingRules[editing.media].segments.map((segment) => {
                const original = editing.segments[segment.key] ?? ""
                const value = draft[segment.key] ?? ""
                const changed = value !== original
                return (
                  <div key={segment.key} className="grid gap-1.5">
                    <Label htmlFor={`seg-${segment.key}`} className="flex items-center gap-1.5">
                      {segment.label}
                      {changed || editing.overrides.includes(segment.key) ? <TypeChip>人工</TypeChip> : null}
                      {segment.required ? <span className="text-status-critical">*</span> : null}
                    </Label>
                    <Input id={`seg-${segment.key}`} value={value} onChange={(event) => setDraft((prev) => ({ ...prev, [segment.key]: event.target.value }))} placeholder={segment.values?.length ? segment.values.slice(0, 2).join(" / ") : segment.pattern ?? "留空表示这段没有"} />
                  </div>
                )
              })}
            </div>
          ) : null}
          <SheetFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={() => { const changed = editing ? Object.keys(draft).filter((key) => draft[key] !== (editing.segments[key] ?? "")).length : 0; setEditing(null); toast.success("已保存", { description: changed ? `${changed} 段标为人工改，重解析不覆盖` : "没有改动" }) }}>保存</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  )
}
