"use client"

import { useState } from "react"
import { IconCalendar } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { DateRangeCalendar } from "@/components/ui/date-range-calendar"
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
  const presets: WindowPreset[] = ["yesterday", "last_7d", "month_to_date", "last_month"]

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            <DateRangeCalendar
              from={value.from}
              to={value.to}
              max={dataDate}
              onChange={(range) => { onChange({ preset: "custom", ...range }); setOpen(false) }}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">数据只到 {dataDate}，之后的日期选了也没有数</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
