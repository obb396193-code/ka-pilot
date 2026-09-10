"use client"

import { useMemo, useState } from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * 区间日历（自己写，不引 react-day-picker）。
 * 不引库的原因：内网装包不便、CI 出 standalone 产物要重装依赖，而一个区间选择器就百来行；
 * 自己写还能把中文星期、"不能选未来"这些规则和我们的 token 一次性摆平。
 *
 * 交互：点第一下定起点，点第二下定终点（点到比起点早的日期就重新当起点）。
 * 日期一律用 `YYYY-MM-DD` 字符串进出——**不传 Date 对象**：
 * Date 带时区，用户机器在 UTC-7 时 `new Date("2026-09-01")` 会退到 8 月 31 日。
 */

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"]

/** 本地日历日 → YYYY-MM-DD（不经 UTC，避免跨时区退一天） */
function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

function parse(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  return match ? { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) } : null
}

/** 周一为一周之首（国内习惯）；返回该月 1 号前要空几格 */
function leadingBlanks(year: number, month: number): number {
  return (new Date(year, month, 1).getDay() + 6) % 7
}

export function DateRangeCalendar({ from, to, max, min, onChange, className }: {
  from: string
  to: string
  /** 可选的最晚日期（数据只到数据日，再往后选出来也是空） */
  max?: string
  min?: string
  onChange: (range: { from: string; to: string }) => void
  className?: string
}) {
  const anchor = parse(from) ?? parse(to)
  const [view, setView] = useState(() => ({ year: anchor?.year ?? new Date().getFullYear(), month: anchor?.month ?? new Date().getMonth() }))
  // 选中起点后、还没点终点时的悬停预览
  const [pendingStart, setPendingStart] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)

  const days = useMemo(() => {
    const total = new Date(view.year, view.month + 1, 0).getDate()
    return Array.from({ length: total }, (_, index) => iso(view.year, view.month, index + 1))
  }, [view])

  const rangeStart = pendingStart ?? from
  const rangeEnd = pendingStart ? (hover && hover >= pendingStart ? hover : pendingStart) : to

  const pick = (day: string) => {
    if (!pendingStart) { setPendingStart(day); return }
    if (day < pendingStart) { setPendingStart(day); return }
    onChange({ from: pendingStart, to: day })
    setPendingStart(null)
    setHover(null)
  }

  const shift = (delta: number) => setView((prev) => {
    const next = new Date(prev.year, prev.month + delta, 1)
    return { year: next.getFullYear(), month: next.getMonth() }
  })

  return (
    <div className={cn("w-64 select-none", className)}>
      <div className="mb-2 flex items-center justify-between">
        <Button variant="ghost" size="icon" className="size-7" onClick={() => shift(-1)} aria-label="上个月"><IconChevronLeft className="size-4" /></Button>
        <span className="text-sm font-medium tabular-nums">{view.year} 年 {view.month + 1} 月</span>
        <Button variant="ghost" size="icon" className="size-7" onClick={() => shift(1)} aria-label="下个月"><IconChevronRight className="size-4" /></Button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-muted-foreground">
        {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: leadingBlanks(view.year, view.month) }, (_, index) => <span key={`blank-${index}`} />)}
        {days.map((day) => {
          const disabled = (max !== undefined && day > max) || (min !== undefined && day < min)
          const inRange = day >= rangeStart && day <= rangeEnd
          const isEdge = day === rangeStart || day === rangeEnd
          return (
            <button
              key={day}
              type="button"
              disabled={disabled}
              aria-pressed={isEdge}
              onClick={() => pick(day)}
              onMouseEnter={() => setHover(day)}
              className={cn(
                "h-7 rounded-md text-xs tabular-nums transition-colors",
                disabled && "cursor-not-allowed text-muted-foreground/40",
                !disabled && !inRange && "hover:bg-muted",
                inRange && !isEdge && "bg-muted",
                isEdge && "bg-foreground font-medium text-background",
              )}
            >
              {Number(day.slice(8))}
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {pendingStart ? `已选起点 ${pendingStart}，再点一天定终点` : `${from} ~ ${to}`}
      </p>
    </div>
  )
}
