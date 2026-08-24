"use client"

import { useEffect, useState } from "react"
import { IconMessageCircle, IconSearch } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const recentObjects = ["演示账户 · 华东 07", "AAC 拉新", "成本异常 P0"]

export function AgentCommandShell() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const filtered = recentObjects.filter((item) => item.toLowerCase().includes(query.toLowerCase()))

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" aria-label="打开 Agent 与对象搜索">
          <IconSearch />
          <span className="hidden sm:inline">搜索与 Agent</span>
          <kbd className="hidden rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground md:inline">⌘K</kbd>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-lg" onEscapeKeyDown={() => setOpen(false)}>
        <SheetHeader>
          <SheetTitle>KA Pilot 全局入口</SheetTitle>
          <SheetDescription>对象搜索与 AI 对话状态分开；当前全部为示例。</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="search" className="px-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search"><IconSearch />对象搜索</TabsTrigger>
            <TabsTrigger value="agent"><IconMessageCircle />AI 对话</TabsTrigger>
          </TabsList>
          <TabsContent value="search" className="space-y-4 py-4">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索账户、任务、异常…" autoFocus />
            <div>
              <div className="mb-2 text-xs font-medium text-muted-foreground">最近访问</div>
              <div className="space-y-2">
                {filtered.map((item) => <button key={item} type="button" className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><span>{item}</span><Badge variant="outline">示例</Badge></button>)}
                {!filtered.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">没有匹配对象</p> : null}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="agent" className="py-4">
            <div className="rounded-lg border border-dashed p-6 text-center">
              <IconMessageCircle className="mx-auto size-6 text-muted-foreground" />
              <div className="mt-3 font-medium">AI 对话入口已隔离</div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">正式消息、推理、工具调用和来源引用将复用 Vercel AI Elements 官方源码；本视觉样板不仿写聊天组件。</p>
              <Badge variant="secondary" className="mt-3">搜索可用 · LLM 未接入</Badge>
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
