"use client"

import type { ReactNode } from "react"
import { IconInfoCircle } from "@tabler/icons-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

/**
 * 指标口径说明的**唯一入口**（老板 2026-09-13 拍板：只统一这一处交互，不换整张卡）。
 *
 * 之前站里有四种写法：标签带虚线下划线（大盘 KPI、gap 表头、分布明细的样本量）、
 * 和工作台那版的 ⓘ 图标。统一成 ⓘ。
 *
 * 为什么选 ⓘ 而不是虚线下划线，除了「工作台已经是这样」还有两条实的：
 * ① **虚线下划线是纯鼠标交互**——原来那几处用的是 `<span>`，键盘 Tab 根本停不上去，
 *    读屏也读不到有说明可看。ⓘ 是 `<button>`，Tab 能到、回车能开。
 * ② 下划线容易被当成链接。口径说明不是跳转，不该长得像能点进去。
 *
 * 标签本身保持纯文本，说明挂在图标上——**指标名不该有装饰**，一屏十几个指标全带下划线很吵。
 */
export function MetricHint({ label, children, side = "bottom" }: {
  /** 指标名。给了就一起渲染；只想要图标就不传 */
  label?: ReactNode
  /** 说明内容。为空时不渲染图标——没有说明就不该有一个点了没反应的图标 */
  children?: ReactNode
  side?: "top" | "bottom" | "left" | "right"
}) {
  if (!children) return <>{label}</>
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={typeof label === "string" ? `${label} 口径` : "口径说明"}
            className="inline-flex rounded-sm text-muted-foreground/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <IconInfoCircle className="size-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side={side} className="max-w-72">{children}</TooltipContent>
      </Tooltip>
    </span>
  )
}
