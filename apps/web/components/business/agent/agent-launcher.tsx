"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { IconCheck, IconPlus, IconSparkles, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import { Conversation, ConversationContent, ConversationEmptyState } from "@/components/ai-elements/conversation"
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message"
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSelect, PromptInputSelectContent, PromptInputSelectItem, PromptInputSelectTrigger, PromptInputSelectValue, PromptInputSubmit, PromptInputTextarea, PromptInputTools, type PromptInputMessage } from "@/components/ai-elements/prompt-input"
import { Suggestion } from "@/components/ai-elements/suggestion"
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool"
import { OPEN_AGENT_EVENT } from "@/components/business/command/events"
import { StatusChip, TypeChip } from "@/components/business/data-grid/data-grid"
import { useSession } from "@/components/business/session/session-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { isOk, schemaText } from "@/lib/fixtures/contract"
import { actionKindHint, agentSessionFixture, sseFramesFixture, suggestionKindLabel, toolLabel, type ContextItem, type Diagnosis, type SseFrame, type SuggestionFrame } from "@/lib/fixtures/agent"
import { agentModelsFixture } from "@/lib/fixtures/me"
import { pageTitleFor } from "@/lib/navigation"
import { cn } from "@/lib/utils"

// AI 助手 = 右下角光晕球（B）+ 浮层面板（老板 2026-09-05：不放顶栏）。面板件全部 Vercel AI Elements 官方源码（components/ai-elements/）。
// 契约 v1.3 agent/sessions + messages SSE 七帧（session/context/token/tool/diagnosis/suggestion/done）+ v1.5.1 ⑤ suggestion 帧 + accept（全部 / 局部）。
// 接口接入前：发送 = 按 fixture sse-frames.json 逐帧回放（标「fixture 回放」），不伪造模型清单、不生成假结论。
const quickQuestions = ["今天哪些账户超考核？", "消耗断崖的账户是什么原因？", "帮我生成今日早报草稿", "真实 CPA 和回传差多少？"]
type Turn = { id: string; role: "user"; text: string } | { id: string; role: "assistant"; text: string; tools: { name: string; status: string }[]; diagnosis: Diagnosis | null; suggestion: SuggestionFrame | null; done: { in: number; out: number } | null; streaming: boolean }
const contextChipLabel = (item: ContextItem) => item.type === "task" ? `任务 · ${item.label}` : item.type === "accounts" ? `账户 · ${item.label}` : item.type === "window" ? `时间 · ${item.label}` : item.type === "anomaly" ? `异常 · ${item.label}` : item.label

function DiagnosisCard({ diagnosis, onAction }: { diagnosis: Diagnosis; onAction: (kind: string, label: string) => void }) {
  return (
    <div className="rounded-xl border bg-card p-3 text-sm">
      <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground"><TypeChip>{schemaText(diagnosis.schema)}</TypeChip>诊断（分析推断）</div>
      <p className="font-medium">{diagnosis.conclusion}</p>
      <ul className="mt-2 flex flex-col gap-1">{diagnosis.evidence.map((item) => <li key={item.ref} className="flex items-start gap-2 text-xs"><StatusChip tone="muted" className="shrink-0 font-mono text-[10px]">{item.ref}</StatusChip><span>{item.text}</span></li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-1.5">{diagnosis.actions.map((action) => <Button key={action.kind} size="sm" variant="outline" className="h-7 text-xs" title={actionKindHint[action.kind]} onClick={() => onAction(action.kind, action.label)}>{action.label}</Button>)}</div>
      <p className="mt-2 text-[11px] text-muted-foreground">写操作（形成变更集）永远先出预览再确认，AI 不直接改。</p>
    </div>
  )
}

function SuggestionCard({ suggestion, onDecide }: { suggestion: SuggestionFrame; onDecide: (mode: "all" | "partial" | "reject", paths: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>(suggestion.diff.map((item) => item.path))
  const [state, setState] = useState<"pending" | "accepted" | "rejected">("pending")
  const fmt = (value: unknown) => (Array.isArray(value) ? value.join(", ") : typeof value === "object" && value !== null ? JSON.stringify(value) : String(value))
  return (
    <div className="rounded-xl border bg-card p-3 text-sm">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span className="flex items-center gap-2"><TypeChip>Patch</TypeChip>配置变更建议 · {suggestionKindLabel[suggestion.kind]}</span><span className="font-mono">{suggestion.target_ref}</span></div>
      <div className="mt-2 flex flex-col gap-1.5">{suggestion.diff.map((item) => <label key={item.path} className={cn("flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs", state !== "pending" && "opacity-70")}><Checkbox disabled={state !== "pending"} checked={selected.includes(item.path)} onCheckedChange={(checked) => setSelected((prev) => checked ? [...prev, item.path] : prev.filter((path) => path !== item.path))} /><span className="flex-1"><span className="font-mono">{item.path}</span><span className="mt-0.5 block text-muted-foreground"><span className="line-through">{fmt(item.before)}</span> → <span className="text-foreground">{fmt(item.after)}</span></span></span></label>)}</div>
      {state === "pending" ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button size="sm" className="h-7 text-xs" onClick={() => { setState("accepted"); onDecide("all", suggestion.diff.map((item) => item.path)) }}><IconCheck />全部接受</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={selected.length === 0 || selected.length === suggestion.diff.length} onClick={() => { setState("accepted"); onDecide("partial", selected) }}>只接受勾选的 {selected.length}</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setState("rejected"); onDecide("reject", []) }}>拒绝</Button>
        </div>
      ) : <p className="mt-2 text-xs">{state === "accepted" ? <StatusChip tone="success">已接受 → 新版本 {suggestion.target_ref}@v2</StatusChip> : <StatusChip tone="muted">已拒绝（记录原因）</StatusChip>}</p>}
    </div>
  )
}

export function AgentLauncher() {
  const pathname = usePathname()
  const router = useRouter()
  const { session } = useSession()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const models = isOk(agentModelsFixture) ? agentModelsFixture.data.items : []
  const [model, setModel] = useState(models.find((item) => item.default)?.id ?? "gateway-default")
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const baseContext = isOk(agentSessionFixture) ? agentSessionFixture.data.context : []
  const [context, setContext] = useState<ContextItem[]>(() => [{ type: "page", label: `页面 · ${pageTitleFor(pathname)}` }, ...baseContext])
  const [addingAccount, setAddingAccount] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const onOpen = (event: Event) => { const query = (event as CustomEvent<{ query?: string }>).detail?.query ?? ""; setOpen(true); if (query) setDraft(query) }
    window.addEventListener(OPEN_AGENT_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_AGENT_EVENT, onOpen)
  }, [])
  useEffect(() => { setContext((prev) => prev.map((item) => item.type === "page" ? { ...item, label: `页面 · ${pageTitleFor(pathname)}` } : item)) }, [pathname])
  useEffect(() => { if (!open) return; const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown) }, [open])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const replay = useCallback((assistantId: string) => {
    const frames: SseFrame[] = isOk(sseFramesFixture) ? sseFramesFixture.data.frames : []
    const patch = (fn: (turn: Extract<Turn, { role: "assistant" }>) => Partial<Extract<Turn, { role: "assistant" }>>) => setTurns((prev) => prev.map((turn) => turn.id === assistantId && turn.role === "assistant" ? { ...turn, ...fn(turn) } : turn))
    frames.forEach((frame, index) => {
      const timer = setTimeout(() => {
        if (frame.event === "token") { const text = frame.data.text; let i = 0; const tick = () => { i += 3; patch(() => ({ text: text.slice(0, i) })); if (i < text.length) timers.current.push(setTimeout(tick, 30)) }; tick() }
        else if (frame.event === "tool") patch((turn) => ({ tools: [...turn.tools.filter((tool) => tool.name !== frame.data.name), { name: frame.data.name, status: frame.data.status }] }))
        else if (frame.event === "diagnosis") patch(() => ({ diagnosis: frame.data }))
        else if (frame.event === "suggestion") patch(() => ({ suggestion: frame.data }))
        else if (frame.event === "done") { patch(() => ({ done: frame.data.usage, streaming: false })); setBusy(false) }
      }, 350 * index + 200)
      timers.current.push(timer)
    })
  }, [])

  const handleSubmit = (message: PromptInputMessage) => {
    const text = message.text?.trim(); if (!text || busy) return
    const userId = `u-${Date.now()}`, assistantId = `a-${Date.now()}`
    setTurns((prev) => [...prev, { id: userId, role: "user", text }, { id: assistantId, role: "assistant", text: "", tools: [], diagnosis: null, suggestion: null, done: null, streaming: true }])
    setDraft(""); setBusy(true); replay(assistantId)
  }
  const onAction = (kind: string, label: string) => {
    if (kind === "create_work_item") { toast.success("已创建待办", { description: "进工作台队列" }); return }
    if (kind === "generate_changeset") { toast("已出变更集草稿", { description: "到工作台「待确认变更集」确认后才执行" }); setOpen(false); router.push("/?tab=today"); return }
    if (kind === "generate_report") { toast("已生成分析表", { description: "在报告页「经营报告」里可见" }); setOpen(false); router.push("/reports?tab=business"); return }
    if (kind === "save_view") { toast.success("已保存个人视图", { description: "接口接入后生效（当前为示例）" }); return }
    toast(label)
  }

  return (
    <>
      <div className="group fixed right-6 bottom-6 z-50 flex flex-row-reverse items-center gap-2.5">
        <button type="button" aria-label={open ? "关闭 AI 助手" : "打开 AI 助手"} aria-expanded={open} onClick={() => setOpen((value) => !value)} className="kp-orb relative size-12 rounded-full border-0 p-0 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
          <span className="relative z-10 grid size-full place-items-center text-white">{open ? <IconX className="size-5" /> : <IconSparkles className="size-5" />}</span>
        </button>
        <span aria-hidden className="pointer-events-none translate-x-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium opacity-0 shadow-md transition-all group-hover:translate-x-0 group-hover:opacity-100">{open ? "关闭" : "问 AI"}</span>
      </div>

      {open ? (
        <section role="dialog" aria-label="AI 助手" className={cn("kp-glass fixed right-6 bottom-[88px] z-50 flex h-[640px] max-h-[calc(100vh-120px)] w-[460px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl", "animate-in fade-in-0 slide-in-from-bottom-2 duration-200")}>
          <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0"><div className="flex items-center gap-2 text-sm font-semibold"><IconSparkles className="size-4 text-primary" />AI 助手</div><p className="mt-0.5 text-[11px] text-muted-foreground">带着当前页面和数据范围提问；回答分「确定性数据」和「分析推断」</p></div>
            <Badge variant="secondary" className="shrink-0">示例回放</Badge>
          </header>

          <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5">
            <span className="text-[11px] text-muted-foreground">上下文</span>
            {context.map((item, index) => <ContextChip key={`${item.type}-${item.id ?? item.label}-${index}`} label={contextChipLabel(item)} onRemove={() => setContext((prev) => prev.filter((_, i) => i !== index))} />)}
            {session ? <ContextChip label={`空间 · ${session.activeWorkspace.name}`} /> : null}
            {addingAccount ? (
              <Select onValueChange={(value) => { setContext((prev) => [...prev, { type: "accounts", ids: [value], label: value }]); setAddingAccount(false) }}><SelectTrigger size="sm" className="h-6 w-40 text-[11px]"><SelectValue placeholder="选账户" /></SelectTrigger><SelectContent>{["account-1", "account-2", "account-3", "account-5"].map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}</SelectContent></Select>
            ) : <button type="button" onClick={() => setAddingAccount(true)} className="inline-flex items-center gap-0.5 rounded-full border border-dashed px-2.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"><IconPlus className="size-3" />账户</button>}
          </div>

          <Conversation className="flex-1">
            <ConversationContent className="gap-4 p-4">
              {turns.length === 0 ? (
                <>
                  <ConversationEmptyState icon={<IconSparkles className="size-6 text-muted-foreground" />} title="还没有对话" description="想直接跳到某个账户或任务，按 ⌘K。提问后会依次显示：接上下文 → 思考 → 取数 → 结论 → 建议动作，中途可以停。" className="rounded-xl border border-dashed py-6" />
                  <div><div className="mb-2 text-[11px] text-muted-foreground">高频问题</div><div className="flex flex-wrap items-center gap-2">{quickQuestions.map((question) => <Suggestion key={question} suggestion={question} onClick={(text) => setDraft(text)} />)}</div></div>
                </>
              ) : turns.map((turn) => turn.role === "user" ? (
                <Message key={turn.id} from="user"><MessageContent>{turn.text}</MessageContent></Message>
              ) : (
                <div key={turn.id} className="flex flex-col gap-3">
                  {turn.tools.map((tool) => (
                    <Tool key={tool.name} defaultOpen={false}>
                      <ToolHeader type={`tool-${tool.name}` as `tool-${string}`} state={tool.status === "done" ? "output-available" : tool.status === "error" ? "output-error" : "input-available"} title={toolLabel[tool.name] ?? tool.name} />
                      <ToolContent><ToolInput input={{ window: "last_7d", accounts: ["account-1", "account-2"] }} /><ToolOutput output={tool.status === "done" ? "account.summary/v3 · 2 行 · 缺数显 −" : undefined} errorText={undefined} /></ToolContent>
                    </Tool>
                  ))}
                  {turn.text || turn.streaming ? <Message from="assistant"><MessageContent><MessageResponse>{turn.text || "…"}</MessageResponse></MessageContent></Message> : null}
                  {turn.diagnosis ? <DiagnosisCard diagnosis={turn.diagnosis} onAction={onAction} /> : null}
                  {turn.suggestion ? <SuggestionCard suggestion={turn.suggestion} onDecide={(mode, paths) => toast(mode === "reject" ? "已拒绝建议" : mode === "all" ? "已全部接受" : `已接受 ${paths.length} 项`, { description: mode === "reject" ? "POST .../suggestions/:sid/reject" : `POST .../suggestions/:sid/accept {mode: ${mode}${mode === "partial" ? `, paths: [${paths.join(", ")}]` : ""}} → saved_views 新版本` })} /> : null}
                  {turn.done ? <p className="text-[11px] text-muted-foreground">done · tokens in {turn.done.in} / out {turn.done.out} · <Link href="/automation?tab=runs" className="underline-offset-4 hover:underline" onClick={() => setOpen(false)}>运行记录</Link></p> : null}
                </div>
              ))}
            </ConversationContent>
          </Conversation>

          <div className="border-t p-3">
            <PromptInput onSubmit={handleSubmit} className="rounded-xl">
              <PromptInputBody><PromptInputTextarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="问一个关于账户、任务或异常的问题…" /></PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputSelect value={model} onValueChange={setModel}>
                    <PromptInputSelectTrigger aria-label="模型" className="h-7 text-xs"><PromptInputSelectValue placeholder="模型" /></PromptInputSelectTrigger>
                    <PromptInputSelectContent>{models.length ? models.map((item) => <PromptInputSelectItem key={item.id} value={item.id} disabled={item.status !== "verified"} title={item.status === "documented_unverified" ? "有文档未验证，灰显" : item.status === "disabled" ? "已禁用" : undefined}>{item.label}{item.status !== "verified" ? "（未验证）" : ""}</PromptInputSelectItem>) : <PromptInputSelectItem value="gateway-default">默认模型 · 网关分配</PromptInputSelectItem>}</PromptInputSelectContent>
                  </PromptInputSelect>
                </PromptInputTools>
                <PromptInputSubmit status={busy ? "streaming" : "ready"} aria-label="发送" />
              </PromptInputFooter>
            </PromptInput>
            <p className="mt-2 px-1 text-[11px] text-muted-foreground">模型清单来自网关能力表（未验证的灰显）；写操作永远先出预览再确认，AI 不会直接改。</p>
          </div>
        </section>
      ) : null}
    </>
  )
}

function ContextChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5 text-[11px]">
      {label}
      {onRemove ? <button type="button" onClick={onRemove} aria-label={`移除 ${label}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><IconX className="size-3" /></button> : <span className="w-1" />}
    </span>
  )
}
