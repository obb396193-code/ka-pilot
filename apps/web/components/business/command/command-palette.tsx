"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  IconAlertTriangle,
  IconArrowRight,
  IconBook2,
  IconChartBar,
  IconDatabase,
  IconLayoutDashboard,
  IconPalette,
  IconSparkles,
  IconSwitchHorizontal,
  IconTargetArrow,
  IconSearch,
  IconUsersGroup,
} from "@tabler/icons-react"

import { useSession } from "@/components/business/session/session-provider"
import { useTheme } from "@/components/business/theme/theme-provider"
import { Badge } from "@/components/ui/badge"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"
import { primaryNavigation } from "@/lib/navigation"
import { themeModes } from "@/lib/theme/theme"
import { OPEN_COMMAND_EVENT, openAgentDrawer } from "./events"

import { isOk } from "@/lib/fixtures/contract"
import { searchFixture, searchTypeLabel, type SearchItem } from "@/lib/fixtures/agent"

// ⌘K 命令面板 = 对象直达（GET /search?q= · system/search.json）+ 最近访问 + 页面 + 动作；命中为空 → 问 AI
const typeIcon: Record<SearchItem["type"], typeof IconDatabase> = { account: IconDatabase, task: IconTargetArrow, work_item: IconAlertTriangle, material: IconBook2, document: IconBook2 }
const searchData = isOk(searchFixture) ? searchFixture.data : { items: [], recent: [] }

export function CommandPalette() {
  const router = useRouter()
  const { session, switchWorkspace } = useSession()
  const { setMode } = useTheme()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen((value) => !value) }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener(OPEN_COMMAND_EVENT, onOpen)
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener(OPEN_COMMAND_EVENT, onOpen) }
  }, [])

  useEffect(() => { if (!open) setQuery("") }, [open])

  const go = (href: string) => { setOpen(false); router.push(href) }
  const ask = () => { const text = query.trim(); setOpen(false); openAgentDrawer(text) }
  const otherWorkspaces = useMemo(() => session?.workspaces.filter((workspace) => workspace.id !== session.activeWorkspace.id) ?? [], [session])

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="全局搜索与动作"
      description="搜索账户、任务、异常，或直接执行动作"
      className="top-[18%] max-w-xl translate-y-0 overflow-hidden rounded-xl p-0 shadow-2xl"
      showCloseButton={false}
    >
      <CommandInput value={query} onValueChange={setQuery} placeholder="搜索账户、任务、异常，或输入动作…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>
          <div className="flex flex-col items-center gap-2 py-2 text-muted-foreground">
            <span>没有匹配的对象</span>
            <button type="button" onClick={ask} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs text-foreground hover:bg-muted">
              <IconSparkles className="size-3.5" />问 AI：{query}
            </button>
          </div>
        </CommandEmpty>

        {query.trim() ? (
          <CommandGroup heading="AI">
            <CommandItem value={`ask ${query}`} onSelect={ask}>
              <IconSparkles className="text-primary" />
              <span className="truncate">问 AI：{query}</span>
              <CommandShortcut>↵</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        ) : null}

        {query.trim() ? (
          <CommandGroup heading="对象">
            <CommandItem value={`全部结果 ${query}`} onSelect={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}>
              <IconSearch />
              <span className="truncate">查看全部结果：{query}</span>
            </CommandItem>
            {searchData.items.map((item) => { const Icon = typeIcon[item.type]; return (
              <CommandItem key={item.id} value={`${searchTypeLabel[item.type]} ${item.label} ${item.id}`} onSelect={() => go(item.href)}>
                <Icon />
                <span className="truncate">{item.label}</span>
                <span className="ml-auto flex items-center gap-1.5"><Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">{searchTypeLabel[item.type]}</Badge><span className="font-mono text-[10px] text-muted-foreground">{item.id}</span></span>
              </CommandItem>
            ) })}
          </CommandGroup>
        ) : (
          <CommandGroup heading="最近访问">
            {searchData.recent.map((item) => { const Icon = typeIcon[item.type]; return (
              <CommandItem key={item.id} value={`最近 ${searchTypeLabel[item.type]} ${item.label}`} onSelect={() => go(item.href)}>
                <Icon />
                <span className="truncate">{item.label}</span>
                <span className="ml-auto flex items-center gap-1.5"><Badge variant="outline" className="h-5 px-1.5 text-[10px] text-muted-foreground">{searchTypeLabel[item.type]}</Badge></span>
              </CommandItem>
            ) })}
          </CommandGroup>
        )}

        <CommandSeparator />
        <CommandGroup heading="页面">
          {primaryNavigation.map((item) => {
            const Icon = item.url === "/" ? IconLayoutDashboard : item.url === "/data" ? IconChartBar : item.url === "/knowledge" ? IconBook2 : IconArrowRight
            return (
              <CommandItem key={item.url} value={`页面 ${item.title} ${item.hint}`} onSelect={() => go(item.url)}>
                <Icon />
                <span>{item.title}</span>
                <span className="ml-2 truncate text-xs text-muted-foreground">{item.hint}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="动作">
          {otherWorkspaces.map((workspace) => (
            <CommandItem key={workspace.id} value={`切换 数据空间 ${workspace.name}`} onSelect={async () => { setOpen(false); await switchWorkspace(workspace.id) }}>
              <IconSwitchHorizontal />
              <span>切换到「{workspace.name}」</span>
              <span className="ml-2 text-xs text-muted-foreground">{workspace.kind === "team" ? "团队 · 只读" : "个人"}</span>
            </CommandItem>
          ))}
          {themeModes.map((mode) => (
            <CommandItem key={mode.value} value={`颜色 主题 ${mode.label} ${mode.hint}`} onSelect={() => { setMode(mode.value); setOpen(false) }}>
              <IconPalette />
              <span>颜色模式：{mode.label}</span>
              <span className="ml-2 truncate text-xs text-muted-foreground">{mode.hint}</span>
            </CommandItem>
          ))}
          <CommandItem value="新建 任务 派发 变更集" disabled>
            <IconUsersGroup />
            <span>新建任务 / 派发 / 变更集</span>
            <span className="ml-2 text-xs text-muted-foreground">写接口开放后启用</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center justify-between border-t bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-3"><Key>↑↓</Key>选择<Key>↵</Key>打开<Key>esc</Key>关闭</span>
        <span>示例只有 2 个对象；接入后覆盖全量账户 / 任务 / 工作项 / 素材 / 文档</span>
      </div>
    </CommandDialog>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-background px-1 font-mono text-[10px] text-foreground/70">{children}</kbd>
}
