"use client"

import { useState } from "react"
import type { DateRange } from "react-day-picker"
import { IconCalendar } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * 时间窗口选择器（F8-20 第一项，老板 2026-09-10 直接点名）。
 * 原来只有一个下拉，「自定义」是**个死标签**——没有日历可点，而且选了之后页面数据也不跟着变。
 *
 * 现在：快捷档只是**预设**，点一下把区间算好；下面永远有日历可以自己拖区间。
 * 选完通过 `onChange` 往上抛，页面据此重新取数（真实模式重查、示例数据按天重算）。
 */

export type DataWindow = { preset: WindowPreset; from: string; to: string }
// ★取值必须是契约冻结的窗口枚举的子集（`today|yesterday|last_7d|month_to_date|last_month|task_period|custom`）——
// 这个 preset 会随「保存视图」写进 `saved_views.config.window`，自造一个 last_30d 后端不认。
// 任务期（task_period）要有任务上下文，数据分析页没有，所以这里不列。
export type WindowPreset = "yesterday" | "last_7d" | "month_to_date" | "last_month" | "custom"

export const windowPresetLabel: Record<WindowPreset, string> = {
  yesterday: "昨天",
  last_7d: "近 7 天",
  month_to_date: "本月至今",
  last_month: "上月",
  custom: "自定义",
}

/** 数据只到「数据日」，所以所有预设都以它为终点往前推，而不是以今天 */
function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}
/**
 * 字符串 ↔ Date 的边界只在这两处。
 * 内部一律用 `YYYY-MM-DD` 字符串：Date 带时区，`new Date("2026-09-01")` 会按 UTC 解析，
 * 用户机器在 UTC-7 时退成 8 月 31 日；所以转 Date 时**按本地年月日构造**，不走字符串解析。
 */
function toDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year, month - 1, date)
}
function fromDate(date: Date): string {
  return iso(date)
}
function shiftDays(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number)
  return iso(new Date(year, month - 1, date + delta))
}

export function resolvePreset(preset: WindowPreset, dataDate: string, current: DataWindow): DataWindow {
  const [year, month] = dataDate.split("-").map(Number)
  switch (preset) {
    case "yesterday": return { preset, from: dataDate, to: dataDate }
    case "last_7d": return { preset, from: shiftDays(dataDate, -6), to: dataDate }
    case "month_to_date": return { preset, from: iso(new Date(year, month - 1, 1)), to: dataDate }
    case "last_month": return { preset, from: iso(new Date(year, month - 2, 1)), to: iso(new Date(year, month - 1, 0)) }
    // 自定义保留现有区间，只是把标签切过去——不然点一下「自定义」区间就被清空了
    case "custom": return { ...current, preset }
  }
}

export function WindowPicker({ value, dataDate, onChange, className }: {
  value: DataWindow
  /** 数据日：预设都以它为终点，日历也不让选到它之后 */
  dataDate: string
  onChange: (next: DataWindow) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  // 日历里正在选的区间。每次打开都从当前窗口起步，关掉不保留半截选择
  const [draft, setDraft] = useState<DateRange | undefined>(undefined)
  const toggle = (next: boolean) => {
    setOpen(next)
    if (next) setDraft({ from: toDate(value.from), to: toDate(value.to) })
  }
  const presets: WindowPreset[] = ["yesterday", "last_7d", "month_to_date", "last_month"]

  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-2", className)} aria-label="时间窗口">
          <IconCalendar className="size-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">{windowPresetLabel[value.preset]}</span>
          <span className="tabular-nums">{value.from} ~ {value.to}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-3">
        <div className="flex gap-4">
          <div className="flex w-24 shrink-0 flex-col gap-0.5">
            <p className="mb-1 text-[11px] text-muted-foreground">快捷</p>
            {presets.map((preset) => (
              <Button
                key={preset}
                variant="ghost"
                size="sm"
                aria-pressed={value.preset === preset}
                className={cn("h-7 justify-start px-2 text-xs font-normal", value.preset === preset && "bg-foreground text-background hover:bg-foreground hover:text-background")}
                onClick={() => { onChange(resolvePreset(preset, dataDate, value)); setOpen(false) }}
              >
                {windowPresetLabel[preset]}
              </Button>
            ))}
          </div>
          <div className="border-l pl-4">
            <p className="mb-1 text-[11px] text-muted-foreground">自己选区间</p>
            <Calendar
              mode="range"
              defaultMonth={toDate(value.to)}
              selected={draft}
              // 数据只到数据日，之后的日期没有数——直接禁掉，别让人选出一片空
              disabled={{ after: toDate(dataDate) }}
              onSelect={(range, clicked) => {
                // ★已有完整区间时再点一天，rdp 默认是「收窄现有区间」；
                //   但在窗口选择器里人的预期是「重新选一个」——所以这里自己重起。
                if (draft?.from && draft?.to) { setDraft({ from: clicked, to: undefined }); return }
                setDraft(range)
                // 只点了起点先不收窗：等点到终点再提交，避免中途把窗口刷成单日
                if (!range?.from || !range.to) return
                onChange({ preset: "custom", from: fromDate(range.from), to: fromDate(range.to) })
                setOpen(false)
              }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">数据只到 {dataDate}，之后的日期选了也没有数</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
