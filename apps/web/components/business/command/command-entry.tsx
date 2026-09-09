"use client"

import { IconSearch } from "@tabler/icons-react"

import { openCommandPalette } from "./events"

// 顶栏入口：搜索框样式的按钮开命令面板（⌘K）；AI 助手走右下角悬浮球（agent-launcher）
export function CommandEntry() {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="搜索账户、任务、异常（⌘K）"
        className="inline-flex h-8 items-center gap-2 rounded-md border bg-muted/40 px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none xl:w-60 xl:px-2.5"
      >
        <IconSearch className="size-4 shrink-0" />
        {/* F8-10：<1280 只留放大镜，1093px 页头才放得下 */}
        <span className="hidden truncate xl:inline">搜索账户、任务、异常…</span>
        <kbd className="ml-auto hidden rounded border bg-background px-1.5 font-mono text-[10px] text-muted-foreground xl:inline">⌘K</kbd>
      </button>
    </div>
  )
}
