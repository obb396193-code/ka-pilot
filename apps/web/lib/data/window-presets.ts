/**
 * 窗口预设的推算（F8-19b P1 附录）。从 `window-picker.tsx` 抽出来的纯逻辑。
 *
 * ★**所有预设以「数据日」为终点往前推，不是以今天**——今天的数还没跑完。
 * 这条写错很隐蔽：页面照常出数，只是每个预设都少一天或多一天，对账时才会发现。
 *
 * 取值必须是契约冻结的窗口枚举的子集（`today|yesterday|last_7d|month_to_date|
 * last_month|task_period|custom`）——这个 preset 会随「保存视图」写进
 * `saved_views.config.window`，自造一个 `last_30d` 后端不认，那个视图就再也读不回来。
 * 任务期（task_period）要有任务上下文，数据分析页没有，所以不列。
 */

export type WindowPreset = "today" | "yesterday" | "last_7d" | "month_to_date" | "last_month" | "custom"
export type DataWindow = { preset: WindowPreset; from: string; to: string }

export const windowPresetLabel: Record<WindowPreset, string> = {
  today: "今天",
  yesterday: "昨天",
  last_7d: "近 7 天",
  month_to_date: "本月至今",
  last_month: "上月",
  custom: "自定义",
}

export function iso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

/** 业务日一律按上海算。本机不在东八区时本机日期会差一天（美西晚上 9 点，上海已是第二天中午） */
export function shanghaiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

export function shiftDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number)
  return iso(new Date(year!, month! - 1, day! + days))
}

export function resolvePreset(preset: WindowPreset, dataDate: string, current: DataWindow): DataWindow {
  const [year, month] = dataDate.split("-").map(Number)
  switch (preset) {
    // 「今天」用真今天，不是数据日——它问的就是「今天到现在跑了多少」
    case "today": { const now = shanghaiToday(); return { preset, from: now, to: now } }
    case "yesterday": return { preset, from: dataDate, to: dataDate }
    // 含数据日在内的 7 天，所以是 -6 不是 -7
    case "last_7d": return { preset, from: shiftDays(dataDate, -6), to: dataDate }
    case "month_to_date": return { preset, from: iso(new Date(year!, month! - 1, 1)), to: dataDate }
    case "last_month": return { preset, from: iso(new Date(year!, month! - 2, 1)), to: iso(new Date(year!, month! - 1, 0)) }
    // 自定义保留现有区间，只把标签切过去——不然点一下「自定义」区间就被清空了
    case "custom": return { ...current, preset }
  }
}
