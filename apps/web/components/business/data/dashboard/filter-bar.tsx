"use client"

import { IconFilterOff, IconX } from "@tabler/icons-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { mediaOptions } from "@/lib/fixtures/naming"
import { filtersIsMock, useDataFilters, type FilterOption, type FilterSelection } from "@/lib/data/use-data-filters"
import { cn } from "@/lib/utils"

/**
 * 大盘筛选栏（F8-27）。多值 + 级联，选项来自 `GET /data/filters`。
 *
 * 两条来自后端语义、界面必须照做的规矩：
 * ① **选项只含窗口内 cost>0 的项**。所以「列表里没有」不等于「这东西不存在」，
 *    而是「这个窗口它没花钱」——空态要这么说，不能笼统写「暂无数据」。
 * ② **下游随上游收窄**：选了优化师，任务列表就只剩他的任务。所以上游一变就重新拉选项，
 *    并且**把下游里已经不在新选项里的值摘掉**——否则会留下一个「看不见却在生效」的筛选条件，
 *    数字对不上而人找不到原因。
 *
 * 媒体选择器也在这条栏上：多媒体账户必需，而且 pivot2 的 `media` 是必填参数。
 */

const GROUPS = [
  { key: "optimizer", label: "优化师", field: "optimizers" },
  { key: "biz", label: "任务大类", field: "bizs" },
  { key: "task_id", label: "任务", field: "tasks" },
  { key: "resource_position", label: "资源位", field: "resource_positions" },
] as const

const cny0 = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 })

function MultiSelect({ label, options, selected, onChange, loading }: {
  label: string
  options: FilterOption[]
  selected: string[]
  onChange: (next: string[]) => void
  loading: boolean
}) {
  const toggle = (key: string) => onChange(selected.includes(key) ? selected.filter((item) => item !== key) : [...selected, key])
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-7 gap-1 text-xs font-normal", selected.length && "border-foreground")}>
          {label}
          {selected.length ? <Badge variant="secondary" className="h-4 px-1 text-[10px]">{selected.length}</Badge> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        {loading ? <p className="px-2 py-4 text-center text-xs text-muted-foreground">正在取选项…</p>
          : options.length === 0 ? (
            // 「没选项」的真实含义是「这个窗口里没有花钱的项」，不是「没数据」
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">这个窗口里没有有消耗的{label}</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="checkbox"
                  aria-checked={selected.includes(option.key)}
                  onClick={() => toggle(option.key)}
                  className={cn("flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted", selected.includes(option.key) && "bg-muted font-medium")}
                >
                  <span className="truncate">{option.label}</span>
                  {/* 把消耗一起显出来：选筛选项时最想知道的就是「这个占多少」 */}
                  <span className="shrink-0 tabular-nums text-muted-foreground">{option.cost === null ? "−" : cny0.format(option.cost)}</span>
                </button>
              ))}
            </div>
          )}
      </PopoverContent>
    </Popover>
  )
}

export function FilterBar({ window, media, onMediaChange, value, onChange }: {
  window: { from: string; to: string }
  media: string
  onMediaChange: (next: string) => void
  value: FilterSelection
  onChange: (next: FilterSelection) => void
}) {
  const { options, loading, error } = useDataFilters(window, media, value)
  const active = GROUPS.reduce((sum, group) => sum + (value[group.key]?.length ?? 0), 0)

  const setGroup = (key: (typeof GROUPS)[number]["key"], next: string[]) => {
    const updated: FilterSelection = { ...value, [key]: next }
    // ★上游一变，把下游里已经不在新选项里的值摘掉。留着的话就是一个
    //   「看不见却在生效」的筛选条件——数字对不上，而人根本找不到原因。
    const index = GROUPS.findIndex((group) => group.key === key)
    for (const group of GROUPS.slice(index + 1)) {
      const allowed = new Set(options[group.field].map((option) => option.key))
      const current = updated[group.key]
      if (current?.length) updated[group.key] = current.filter((item) => allowed.has(item))
    }
    onChange(updated)
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={media} onValueChange={onMediaChange}>
        <SelectTrigger size="sm" className="h-7 w-24 text-xs" aria-label="媒体"><SelectValue /></SelectTrigger>
        <SelectContent>{mediaOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
      </Select>
      {GROUPS.map((group) => (
        <MultiSelect
          key={group.key}
          label={group.label}
          options={options[group.field]}
          selected={value[group.key] ?? []}
          onChange={(next) => setGroup(group.key, next)}
          loading={loading}
        />
      ))}
      {active ? (
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs font-normal text-muted-foreground" onClick={() => onChange({})}>
          <IconFilterOff className="size-3" />清空（{active}）
        </Button>
      ) : null}
      {/* 选中的值平铺出来：折在下拉里的筛选条件最容易被忘掉，然后拿着筛过的数当全量看 */}
      {GROUPS.flatMap((group) => (value[group.key] ?? []).map((key) => {
        const option = options[group.field].find((item) => item.key === key)
        return (
          <Badge key={`${group.key}:${key}`} variant="secondary" className="h-6 gap-0.5 pr-0.5 font-normal">
            {group.label}：{option?.label ?? key}
            <button type="button" aria-label={`移除筛选 ${option?.label ?? key}`} className="rounded-sm p-0.5 hover:bg-foreground/10" onClick={() => setGroup(group.key, (value[group.key] ?? []).filter((item) => item !== key))}>
              <IconX className="size-3" />
            </button>
          </Badge>
        )
      }))}
      {error && !filtersIsMock ? <span className="text-xs text-status-critical">筛选项取数失败：{error}</span> : null}
    </div>
  )
}
