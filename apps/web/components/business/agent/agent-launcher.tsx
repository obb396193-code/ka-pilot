"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { IconSparkles, IconX } from "@tabler/icons-react"
import { toast } from "sonner"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "@/components/ai-elements/conversation"
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input"
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion"
import { OPEN_AGENT_EVENT } from "@/components/business/command/events"
import { useSession } from "@/components/business/session/session-provider"
import { Badge } from "@/components/ui/badge"
import { pageTitleFor } from "@/lib/navigation"
import { cn } from "@/lib/utils"

// AI 助手 = 右下角悬浮球 + 浮层面板（老板 2026-09-05：不放顶栏，做悬浮窗）。
// 面板内的输入框 / 模型选择 / 建议 chip / 消息流全部是 Vercel AI Elements 官方件（components/ai-elements/）。
// 后端 = Claude Agent SDK，经 CC Switch 网关切模型；模型列表与会话流（P-008 Agent 会话 / SSE 七帧）接入前，
// 这里只做诚实空态：不伪造回答、不伪造模型清单。
const quickQuestions = ["今天哪些账户超考核？", "消耗断崖的账户是什么原因？", "帮我生成今日早报草稿", "真实 CPA 和回传差多少？"]

export function AgentLauncher() {
  const pathname = usePathname()
  const { session } = useSession()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [model, setModel] = useState("gateway-default")
  const [context, setContext] = useState({ page: true, workspace: true })

  useEffect(() => {
    const onOpen = (event: Event) => {
      const query = (event as CustomEvent<{ query?: string }>).detail?.query ?? ""
      setOpen(true)
      if (query) setDraft(query)
    }
    window.addEventListener(OPEN_AGENT_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_AGENT_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  const handleSubmit = (message: PromptInputMessage) => {
    if (!message.text?.trim()) return
    toast.message("AI 服务接入后可发送", { description: "对话走 Claude Agent SDK，经网关切模型；现在先保留你的问题。" })
  }

  return (
    <>
      {/* 光晕球（B）：渐变慢转 + 柔光，悬停滑出「问 AI」标签；打开时球变成关闭态 */}
      <div className="group fixed right-6 bottom-6 z-50 flex flex-row-reverse items-center gap-2.5">
        <button
          type="button"
          aria-label={open ? "关闭 AI 助手" : "打开 AI 助手"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="kp-orb relative size-12 rounded-full border-0 p-0 transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <span className="relative z-10 grid size-full place-items-center text-white">
            {open ? <IconX className="size-5" /> : <IconSparkles className="size-5" />}
          </span>
        </button>
        <span aria-hidden className="pointer-events-none translate-x-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium opacity-0 shadow-md transition-all group-hover:translate-x-0 group-hover:opacity-100">
          {open ? "关闭" : "问 AI"}
        </span>
      </div>

      {open ? (
        <section
          role="dialog"
          aria-label="AI 助手"
          className={cn(
            "kp-glass fixed right-6 bottom-[88px] z-50 flex h-[600px] max-h-[calc(100vh-120px)] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl bg-background shadow-2xl",
            "animate-in fade-in-0 slide-in-from-bottom-2 duration-200",
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold"><IconSparkles className="size-4 text-primary" />AI 助手</div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">带着当前页面和数据范围提问；回答分「确定性数据」和「分析推断」</p>
            </div>
            <Badge variant="secondary" className="shrink-0">示例 · 未接入</Badge>
          </header>

          <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2.5">
            <span className="text-[11px] text-muted-foreground">上下文</span>
            {context.page ? <ContextChip label={`页面 · ${pageTitleFor(pathname)}`} onRemove={() => setContext((c) => ({ ...c, page: false }))} /> : null}
            {context.workspace && session ? <ContextChip label={`空间 · ${session.activeWorkspace.name}`} onRemove={() => setContext((c) => ({ ...c, workspace: false }))} /> : null}
            <button type="button" disabled title="账户上下文随 Agent 会话接口开放" className="rounded-full border border-dashed px-2.5 py-0.5 text-[11px] text-muted-foreground disabled:opacity-60">+ 账户</button>
          </div>

          <Conversation className="flex-1">
            <ConversationContent className="gap-4 p-4">
              <ConversationEmptyState
                icon={<IconSparkles className="size-6 text-muted-foreground" />}
                title="还没有对话"
                description="对象直达用 ⌘K；对话、推理过程、工具调用与来源引用随 Agent 服务上线开放。"
                className="rounded-xl border border-dashed py-6"
              />
              <div>
                <div className="mb-2 text-[11px] text-muted-foreground">高频问题</div>
                <Suggestions>
                  {quickQuestions.map((question) => (
                    <Suggestion key={question} suggestion={question} onClick={(text) => setDraft(text)} />
                  ))}
                </Suggestions>
              </div>
            </ConversationContent>
          </Conversation>

          <div className="border-t p-3">
            <PromptInput onSubmit={handleSubmit} className="rounded-xl">
              <PromptInputBody>
                <PromptInputTextarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="问一个关于账户、任务或异常的问题…" />
              </PromptInputBody>
              <PromptInputFooter>
                <PromptInputTools>
                  <PromptInputSelect value={model} onValueChange={setModel}>
                    <PromptInputSelectTrigger aria-label="模型" className="h-7 text-xs">
                      <PromptInputSelectValue placeholder="模型" />
                    </PromptInputSelectTrigger>
                    <PromptInputSelectContent>
                      <PromptInputSelectItem value="gateway-default">默认模型 · 网关分配</PromptInputSelectItem>
                    </PromptInputSelectContent>
                  </PromptInputSelect>
                </PromptInputTools>
                <PromptInputSubmit status="ready" aria-label="发送" title="Agent 服务接入后可发送" />
              </PromptInputFooter>
            </PromptInput>
            <p className="mt-2 px-1 text-[11px] text-muted-foreground">模型列表由 CC Switch 网关返回；写操作永远先出预览再确认，AI 不会直接改。</p>
          </div>
        </section>
      ) : null}
    </>
  )
}

function ContextChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border bg-muted/50 py-0.5 pr-1 pl-2.5 text-[11px]">
      {label}
      <button type="button" onClick={onRemove} aria-label={`移除 ${label}`} className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"><IconX className="size-3" /></button>
    </span>
  )
}
