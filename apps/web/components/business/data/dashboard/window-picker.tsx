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

// 预设推算搬到了 `lib/data/window-presets.ts`——`.tsx` 里的东西 node:test 引不了
// （测试 glob 只跑 `lib/data/*.test.ts`），纯逻辑放那边才盖得住门禁。这里只做转发。
export { resolvePreset, windowPresetLabel, shiftDays, type DataWindow, type WindowPreset } from "@/lib/data/window-presets"
import { iso, resolvePreset, shiftDays, windowPresetLabel, type DataWindow, type WindowPreset } from "@/lib/data/window-presets"

/** 日历组件吃 Date，我们的窗口是 `YYYY-MM-DD` 字符串——两边转换只在这个文件里用 */
const fromDate = iso
function toDate(day: string): Date {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year!, month! - 1, date!)
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
  const presets: WindowPreset[] = ["today", "yesterday", "last_7d", "month_to_date", "last_month"]
  /**
   * 「近 30 天」这类快捷键**只是 UI 快捷方式**，落成 `custom` + 起止日（arch 第四次答：(b)）。
   * 不往 `WindowPreset` 里自造 `last_30d`：这个 preset 会随「保存视图」写进
   * `saved_views.config.window`，后端枚举里没有的值存进去，视图就再也读不回来了。
   */
  const quickRanges: { label: string; days: number }[] = [{ label: "近 30 天", days: 30 }]

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
            {quickRanges.map((range) => {
              const from = shiftDays(dataDate, -(range.days - 1))
              const active = value.preset === "custom" && value.from === from && value.to === dataDate
              return (
                <Button
                  key={range.label}
                  variant="ghost"
                  size="sm"
                  aria-pressed={active}
                  className={cn("h-7 justify-start px-2 text-xs font-normal", active && "bg-foreground text-background hover:bg-foreground hover:text-background")}
                  onClick={() => { onChange({ preset: "custom", from, to: dataDate }); setOpen(false) }}
                >
                  {range.label}
                </Button>
              )
            })}
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
