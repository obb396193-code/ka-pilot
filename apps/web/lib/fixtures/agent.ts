import type { Fixture } from "@/lib/fixtures/contract"
import session from "@contract/fixtures/agent/session.json"
import sseFrames from "@contract/fixtures/agent/sse-frames.json"
import suggestion from "@contract/fixtures/agent/suggestion.json"
import search from "@contract/fixtures/system/search.json"

// 全局 Agent 抽屉 + ⌘K（F-007 §12，契约 v1.3 agent/sessions · messages SSE 七帧 · context · diagnosis/v1；v1.5.1 ⑤ suggestion 帧 + accept）fixture 读取层
export type ContextItem = { type: "task" | "accounts" | "window" | "anomaly" | "page" | "workspace"; id?: string; ids?: string[]; from?: string; to?: string; label: string }
export const agentSessionFixture = session as unknown as Fixture<{ sessionId: string; context: ContextItem[]; messages: unknown[] }>
export type DiagnosisAction = { kind: "generate_report" | "create_work_item" | "generate_changeset" | "save_view" | string; label: string }
export type Diagnosis = { schema: "diagnosis/v1"; conclusion: string; evidence: { ref: string; text: string }[]; actions: DiagnosisAction[] }
export type SuggestionFrame = { suggestion_id: string; kind: "view_patch" | "report_config_patch" | "workflow_draft"; target_ref: string; before: Record<string, unknown>; after: Record<string, unknown>; diff: { path: string; before: unknown; after: unknown }[] }
export type SseFrame =
  | { event: "session"; data: { sessionId: string; runId: string; seq: number } }
  | { event: "context"; data: { items: number } }
  | { event: "token"; data: { text: string } }
  | { event: "tool"; data: { name: string; status: "running" | "done" | "error" } }
  | { event: "diagnosis"; data: Diagnosis }
  | { event: "suggestion"; data: SuggestionFrame }
  | { event: "done"; data: { seq: number; usage: { in: number; out: number } } }
export const sseFramesFixture = sseFrames as unknown as Fixture<{ frames: SseFrame[] }>
export const suggestionAcceptFixture = suggestion as unknown as Fixture<{ suggestionId: string; kind: string; targetRef: string; accepted: { mode: "all" | "partial"; paths?: string[] }; resultRef: string }>
export const suggestionKindLabel: Record<SuggestionFrame["kind"], string> = { view_patch: "视图配置", report_config_patch: "报告配置", workflow_draft: "工作流草稿" }
export const actionKindHint: Record<string, string> = { generate_report: "按 report-config/v1 出一张表", create_work_item: "进工作台队列", generate_changeset: "出变更集草稿，人工确认后执行", save_view: "存到个人视图" }
export const toolLabel: Record<string, string> = { "query.account_summary": "查账户汇总（account.summary/v3）", "query.table": "查总表", "kb.search": "搜知识库" }
// 契约 v1.9：后端只出机器值（title + 结构化 meta），中文副标题由前端组装
export type SearchMeta = { status?: string; stage?: string; taskName?: string; accountCount?: number; severity?: string; kind?: string; durationMs?: number; analysisVersion?: number }
export type SearchItem = { type: "account" | "task" | "work_item" | "material" | "document"; id: string; title: string; href: string; workspaceKind?: string; meta?: SearchMeta }
export const searchFixture = search as unknown as Fixture<{ items: SearchItem[]; recent: Pick<SearchItem, "type" | "id" | "title" | "href">[] }>
export const searchTypeLabel: Record<SearchItem["type"], string> = { account: "账户", task: "任务", work_item: "工作项", material: "素材", document: "文档" }

const searchStatusLabel: Record<string, string> = { active: "投放中", paused: "暂停", closed: "已关", open: "待处理", done: "已处理", ack: "已认领" }
const searchStageLabel: Record<string, string> = { preparing: "准备中", active: "投放中", reviewing: "复盘中", closed: "已结束" }
const searchSeverityLabel: Record<string, string> = { p0: "P0", p1: "P1", p2: "P2" }
const searchKindLabel: Record<string, string> = { video: "视频", image: "图片", sop: "SOP", note: "笔记", case: "案例", report: "AI 报告" }

/** 搜索结果副标题：把机器值拼成人话，缺字段就不显那一段（不编） */
export function searchSubtitle(item: SearchItem): string {
  const meta = item.meta
  if (!meta) return ""
  const parts: string[] = []
  if (item.type === "account") {
    if (meta.status) parts.push(searchStatusLabel[meta.status] ?? meta.status)
    if (meta.taskName) parts.push(`挂在「${meta.taskName}」`)
  } else if (item.type === "task") {
    if (meta.stage) parts.push(searchStageLabel[meta.stage] ?? meta.stage)
    if (typeof meta.accountCount === "number") parts.push(`${meta.accountCount} 个账户`)
  } else if (item.type === "work_item") {
    if (meta.severity) parts.push(searchSeverityLabel[meta.severity] ?? meta.severity.toUpperCase())
    if (meta.status) parts.push(searchStatusLabel[meta.status] ?? meta.status)
  } else if (item.type === "material") {
    if (meta.kind) parts.push(searchKindLabel[meta.kind] ?? meta.kind)
    if (typeof meta.durationMs === "number") parts.push(`${Math.round(meta.durationMs / 1000)} 秒`)
    if (typeof meta.analysisVersion === "number") parts.push(`已拆片 v${meta.analysisVersion}`)
  } else if (item.type === "document") {
    if (meta.kind) parts.push(searchKindLabel[meta.kind] ?? meta.kind)
  }
  return parts.join(" · ")
}

// Agent 运行事件 / 建议动作 / 参数类型在界面显中文
export const runEventKindLabel: Record<string, string> = { run_started: "开始运行", run_finished: "运行结束", diagnosis: "诊断", tool_call: "调用工具", tool_result: "工具返回", error: "出错" }
export const paramTypeLabel: Record<string, string> = { string: "文本", number: "数字", integer: "整数", boolean: "是否", array: "列表", object: "对象" }
