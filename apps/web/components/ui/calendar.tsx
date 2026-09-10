"use client"

import * as React from "react"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { DayPicker, getDefaultClassNames } from "react-day-picker"
import { zhCN } from "react-day-picker/locale"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * 日历（shadcn New York v4 那版，底座是 react-day-picker v9）。
 * 老板 2026-09-10：手写那版不好看，换成成熟组件。
 * 本地化钉死 zh-CN 且周一起始——不跟浏览器语言走，免得同一份界面在不同机器上星期排布不一样。
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const defaults = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={zhCN}
      weekStartsOn={1}
      className={cn("bg-background p-3 [--cell-size:2rem]", className)}
      classNames={{
        ...defaults,
        months: cn("flex gap-4 flex-col md:flex-row relative", defaults.months),
        month: cn("flex flex-col w-full gap-3", defaults.month),
        nav: cn("flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between", defaults.nav),
        button_previous: cn(buttonVariants({ variant: "ghost" }), "size-(--cell-size) p-0 select-none text-muted-foreground hover:text-foreground", defaults.button_previous),
        button_next: cn(buttonVariants({ variant: "ghost" }), "size-(--cell-size) p-0 select-none text-muted-foreground hover:text-foreground", defaults.button_next),
        month_caption: cn("flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)", defaults.month_caption),
        caption_label: cn("select-none font-medium text-sm", defaults.caption_label),
        table: "w-full border-collapse",
        weekdays: cn("flex", defaults.weekdays),
        weekday: cn("text-muted-foreground rounded-md flex-1 font-normal text-[0.75rem] select-none", defaults.weekday),
        week: cn("flex w-full mt-1", defaults.week),
        day: cn("relative w-full h-full p-0 text-center group/day aspect-square select-none", defaults.day),
        // 区间：首尾方一边、中间方块连成一条，视觉上是一整段而不是一串独立圆点
        range_start: cn("rounded-l-md bg-accent", defaults.range_start),
        range_middle: cn("rounded-none", defaults.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaults.range_end),
        today: cn("bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none", defaults.today),
        outside: cn("text-muted-foreground aria-selected:text-muted-foreground", defaults.outside),
        disabled: cn("text-muted-foreground opacity-50", defaults.disabled),
        hidden: cn("invisible", defaults.hidden),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevronClassName, orientation, ...rest }) => {
          const Icon = orientation === "left" ? IconChevronLeft : IconChevronRight
          return <Icon className={cn("size-4", chevronClassName)} {...rest} />
        },
        DayButton: ({ className: dayClassName, day, modifiers, ...rest }) => {
          const ref = React.useRef<HTMLButtonElement>(null)
          React.useEffect(() => { if (modifiers.focused) ref.current?.focus() }, [modifiers.focused])
          return (
            <button
              ref={ref}
              type="button"
              data-day={day.date.toLocaleDateString()}
              data-selected-single={modifiers.selected && !modifiers.range_start && !modifiers.range_end && !modifiers.range_middle}
              data-range-start={modifiers.range_start}
              data-range-end={modifiers.range_end}
              data-range-middle={modifiers.range_middle}
              className={cn(
                "flex aspect-square size-auto w-full min-w-(--cell-size) flex-col items-center justify-center gap-1 rounded-md text-sm leading-none font-normal tabular-nums transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground",
                "data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-start=true]:rounded-l-md",
                "data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground data-[range-end=true]:rounded-r-md",
                "data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-middle=true]:rounded-none",
                "focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none",
                "disabled:pointer-events-none disabled:opacity-40",
                dayClassName,
              )}
              {...rest}
            />
          )
        },
      }}
      {...props}
    />
  )
}

export { Calendar }
