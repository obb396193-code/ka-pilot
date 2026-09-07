"use client"

import Link from "next/link"
import { IconPhoto, IconPlayerPlay, IconSparkles } from "@tabler/icons-react"

import { openAgentDrawer } from "@/components/business/command/events"
import { MissingValue, StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { isOk, mv, rv } from "@/lib/fixtures/contract"
import { analysisFixture, componentLabel, densityLabel, fmtDuration, hookKindLabel, materialDetailFixture, materialsFixture, methodLabel, segmentRoleLabel, similarFixture, tempoLabel, type MaterialItem } from "@/lib/fixtures/materials"
import { cn } from "@/lib/utils"

// 拆片分析面板（v1.6 6.3）：预览 + 关键帧墙 + 内容拆解（钩子/卖点/人群/节奏/CTA + 段落时间轴）+ Agent 证据 + 相似 + 谱系 + 用在哪；
// timingPrecision=whole_video → 不显句级时间戳（IdeaLab 实证无时间戳）
const roleTone: Record<string, string> = { hook: "bg-foreground", selling_point: "bg-status-success", cta: "bg-status-warning", problem: "bg-status-critical", proof: "bg-status-info", body: "bg-muted-foreground/60", turn: "bg-muted-foreground/40", other: "bg-border" }

export function MaterialAnalysisPanel({ material }: { material: MaterialItem }) {
  const detail = isOk(materialDetailFixture) && materialDetailFixture.data.material.materialId === material.materialId ? materialDetailFixture.data : null
  const analysis = isOk(analysisFixture) && material.analysis.status === "done" ? analysisFixture.data : null
  const similar = isOk(similarFixture) && analysis ? similarFixture.data.items : []
  const allMaterials = isOk(materialsFixture) ? materialsFixture.data.items : []
  const nameOf = (id: string) => allMaterials.find((item) => item.materialId === id)?.name ?? id
  const duration = analysis?.media.durationMs ?? material.durationMs ?? 0
  const evidenceLabel = (id: string) => (id.startsWith("shot") ? `镜头 ${id.replace("shot-", "")}` : id.startsWith("transcript") ? "口播" : id)

  if (!analysis) {
    return (
      <Card>
        <CardHeader><CardTitle>{material.name}</CardTitle><CardDescription>{material.materialId} · {fmtDuration(material.durationMs)} · {material.sourceStatus === "unreachable" ? "视频源不可达" : "未拆片"}</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>{material.sourceStatus === "unreachable" ? "视频源探针没过，拆片会被拒绝；先让视频源可达。" : "还没有拆片版本；点「拆片」排队一次（job），完成后这里显示 analysis/v1。"}</p>
          <Button size="sm" className="w-fit" disabled={material.sourceStatus !== "reachable"}><IconSparkles />拆片</Button>
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 @4xl/main:grid-cols-[240px_minmax(0,1fr)]">
        <Card>
          <CardContent className="flex flex-col gap-2 pt-4">
            <div className="relative flex aspect-[9/16] w-full items-center justify-center rounded-lg bg-muted text-muted-foreground"><IconPlayerPlay className="size-8" /><span className="absolute right-2 bottom-2 rounded bg-background/80 px-1.5 text-[10px] tabular-nums">{fmtDuration(analysis.media.durationMs)} · {analysis.media.width}×{analysis.media.height}</span></div>
            <p className="text-sm font-medium">{material.name}</p>
            <p className="text-xs text-muted-foreground">{material.materialId} · 拆片 v{analysis.version} · {analysis.promptVersion} · 指纹 {analysis.fingerprint.slice(0, 8)}…</p>
            <div className="flex flex-wrap gap-1">{material.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}</div>
            <dl className="grid grid-cols-2 gap-y-1 text-xs"><dt className="text-muted-foreground">消耗</dt><dd className="text-right tabular-nums">{mv(material.metrics.cost, "money0")}</dd><dt className="text-muted-foreground">CTR</dt><dd className="text-right tabular-nums">{rv(material.metrics.ratios.ctr)}</dd><dt className="text-muted-foreground">真实 CPA</dt><dd className="text-right tabular-nums">{rv(material.metrics.ratios.realCpa, "money")}</dd><dt className="text-muted-foreground">真实转化</dt><dd className="text-right tabular-nums">{mv(material.metrics.realConversion)}</dd></dl>
            <Button size="sm" variant="outline" onClick={() => openAgentDrawer(`基于素材「${material.name}」的拆片结果，给 3 个复刻方向`)}><IconSparkles />问 AI</Button>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>关键帧墙</CardTitle><CardDescription>{analysis.shots.length} 个镜头 · 硬切 {analysis.visualSummary.hardCutCount} · 视觉事件 {analysis.visualSummary.visualEventCount} · 平均镜头 {fmtDuration(analysis.visualSummary.averageShotLengthMs)} · 前 3 秒视觉密度 {(analysis.visualSummary.hookVisualDensity * 100).toFixed(0)}%</CardDescription></CardHeader>
            <CardContent className="grid grid-cols-3 gap-2 @3xl/main:grid-cols-6">{analysis.shots.map((shot, index) => <div key={shot.id} className={cn("flex aspect-video flex-col items-center justify-center rounded-lg border text-[10px] text-muted-foreground", shot.frame.status === "ready" ? "bg-muted" : "border-dashed")}>{shot.frame.status === "ready" ? <IconPhoto className="size-4" /> : <span>抽帧失败</span>}<span className="mt-1 tabular-nums">#{index} {fmtDuration(shot.startMs)}–{fmtDuration(shot.endMs)}</span></div>)}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>段落时间轴</CardTitle><CardDescription>result.segments · 角色分段</CardDescription></CardHeader>
            <CardContent>
              <div className="flex h-6 w-full overflow-hidden rounded-md">{analysis.result.segments.map((segment) => <div key={`${segment.role}-${segment.startMs}`} className={cn("flex items-center justify-center text-[10px] text-background", roleTone[segment.role] ?? "bg-border")} style={{ width: `${((segment.endMs - segment.startMs) / Math.max(1, duration)) * 100}%` }} title={`${segmentRoleLabel[segment.role]} ${fmtDuration(segment.startMs)}–${fmtDuration(segment.endMs)}`}>{segmentRoleLabel[segment.role]}</div>)}</div>
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums"><span>0s</span><span>{fmtDuration(duration)}</span></div>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="grid gap-4 @4xl/main:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>内容拆解</CardTitle><CardDescription>钩子 / 卖点 / 人群 / 节奏 / CTA · 每条带 Agent 证据（evidenceIds）</CardDescription></CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div><p className="text-xs text-muted-foreground">钩子 <TypeChip className="ml-1 text-[10px]">{hookKindLabel[analysis.result.hook.kind] ?? analysis.result.hook.kind}</TypeChip></p><p className="font-medium">{analysis.result.hook.text}</p><p className="mt-0.5 flex flex-wrap gap-1">{analysis.result.hook.evidenceIds.map((id) => <Badge key={id} variant="outline" className="text-[10px]">{evidenceLabel(id)}</Badge>)}</p></div>
            <div><p className="text-xs text-muted-foreground">卖点</p><ul className="flex flex-col gap-1">{analysis.result.sellingPoints.map((point) => <li key={point.text} className="flex flex-wrap items-center gap-1"><span className="font-medium">{point.text}</span>{point.evidenceIds.map((id) => <Badge key={id} variant="outline" className="text-[10px]">{evidenceLabel(id)}</Badge>)}</li>)}</ul></div>
            <div><p className="text-xs text-muted-foreground">人群</p><p className="flex flex-wrap gap-1">{analysis.result.audiences.map((audience) => <TypeChip key={audience}>{audience}</TypeChip>)}</p></div>
            <div><p className="text-xs text-muted-foreground">节奏</p><p>{tempoLabel[analysis.result.rhythm.tempo] ?? analysis.result.rhythm.tempo} · 钩子 {analysis.result.rhythm.hookSeconds}s · 信息密度 {densityLabel[analysis.result.rhythm.infoDensity] ?? analysis.result.rhythm.infoDensity}</p></div>
            <div><p className="text-xs text-muted-foreground">CTA</p><p className="font-medium">{analysis.result.cta.text}</p><p className="mt-0.5 flex flex-wrap gap-1">{analysis.result.cta.evidenceIds.map((id) => <Badge key={id} variant="outline" className="text-[10px]">{evidenceLabel(id)}</Badge>)}</p></div>
            <div><p className="text-xs text-muted-foreground">口播（{analysis.transcript.source === "cloud_asr" ? "云 ASR" : "平台字幕"}{analysis.transcript.timingPrecision === "whole_video" ? " · 整片粒度，不显句级时间戳" : ""}）</p>{analysis.transcript.segments.map((segment) => <p key={segment.id} className="rounded-lg bg-muted px-3 py-2 text-sm">{analysis.transcript.timingPrecision === "segment" ? <span className="mr-2 text-xs text-muted-foreground tabular-nums">{fmtDuration(segment.startMs)}</span> : null}{segment.text}</p>)}</div>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>相似素材</CardTitle><CardDescription>六维分量；证据不足不打分</CardDescription></CardHeader>
            <CardContent className="flex flex-col gap-2">
              {similar.map((item) => <div key={item.materialId} className={cn("rounded-lg border px-3 py-2", item.status !== "scored" && "opacity-70")}><div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium">{nameOf(item.materialId)}</span>{item.status === "scored" && item.score !== null ? <span className="tabular-nums">{(item.score * 100).toFixed(0)}%</span> : <StatusChip tone="muted">证据不足</StatusChip>}</div>{item.components.length ? <div className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-0.5 text-[11px]">{item.components.map((component) => <span key={component.kind} className="flex items-center justify-between"><span className="text-muted-foreground">{componentLabel[component.kind]}</span><span className="tabular-nums">{component.status === "compared" && component.score !== null ? `${(component.score * 100).toFixed(0)}%` : "−"}</span></span>)}</div> : null}{item.missingComponents.length ? <p className="mt-1 text-[11px] text-muted-foreground">缺：{item.missingComponents.map((kind) => componentLabel[kind as keyof typeof componentLabel] ?? kind).join(" / ")}</p> : null}</div>)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>谱系 · 用在哪</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {detail ? (
                <>
                  <p className="text-xs text-muted-foreground">复刻子代</p>
                  {detail.lineage.children.length ? detail.lineage.children.map((child) => <p key={child.materialId} className="flex items-center gap-2">{nameOf(child.materialId)}<TypeChip>{methodLabel[child.method as keyof typeof methodLabel] ?? child.method}</TypeChip></p>) : <p className="text-muted-foreground">无</p>}
                  <p className="mt-1 text-xs text-muted-foreground">用在哪</p>
                  {detail.whereUsed.map((use) => <p key={`${use.taskId}-${use.accountId}`} className="flex items-center gap-2"><Link href={`/tasks/${encodeURIComponent(use.taskId)}`} className="underline-offset-4 hover:underline">{use.taskId}</Link><span className="text-muted-foreground">·</span><Link href={`/accounts/KUAISHOU/${encodeURIComponent(use.accountId)}`} className="underline-offset-4 hover:underline">{use.accountId}</Link><span className="text-xs text-muted-foreground tabular-nums">{use.adCount} 条广告</span></p>)}
                </>
              ) : <MissingValue title="该素材没有拆片详情样例" />}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
