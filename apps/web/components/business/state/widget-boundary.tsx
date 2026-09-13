"use client"

import { Component, type ReactNode } from "react"
import { IconAlertTriangle } from "@tabler/icons-react"

/**
 * 组件级错误边界（F8-19b P1）。
 *
 * 路由级 `error.tsx` 已经有了，但它的粒度是**整页**：一个图表算错一个下标，
 * 整个数据分析页就白了。老板 2026-09-10 撞到的 `removeChild` 崩溃就是这样——
 * 页面上另外七块都是好的，却一起消失了。
 *
 * 这个边界把爆炸范围收在一块组件内：那一块显「这块没画出来 + 重试」，
 * 其余照常。**看得到剩下的七块**，比一个统一的错误页有用得多。
 *
 * 用 class 组件是因为 React 到今天也只有 class 能当错误边界（没有 hook 版本）。
 */

type Props = { children: ReactNode; label?: string }
type State = { error: Error | null }

export class WidgetBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error) {
    // 留一条控制台记录：用户只会说「有一块没出来」，排查得靠这个
    console.error(`[widget] ${this.props.label ?? "组件"}渲染失败：`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-status-critical/40 px-4 py-8 text-center">
        <IconAlertTriangle className="size-5 text-status-critical" />
        <p className="text-sm text-status-critical">{this.props.label ?? "这一块"}没画出来</p>
        <p className="max-w-md text-xs text-muted-foreground">页面其余部分不受影响。点重试重画这一块；一直失败请把这句话和当前筛选条件发给我们。</p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >重试</button>
      </div>
    )
  }
}
