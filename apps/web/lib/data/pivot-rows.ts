import { z } from "zod"

/**
 * 透视行 → 格子。从 `use-pivot.ts` 抽出来的纯逻辑，好让真响应回放测得到它
 * （hook 文件带 React 与路径别名，node:test 引不进来——09-13 透视被拦就是没人测这层）。
 */

export type PivotCell = {
  a: { key: string; label: string }
  b: { key: string; label: string } | null
  /** 选中指标在这个格子上的值；缺数为 null（不是 0） */
  value: number | null
}

/**
 * 透视行的形状。用**真 schema** 而不是类型断言——
 * `as unknown as` 一个字段都不校验，形状对不上要等用户点开某个格子才炸（审查点名过）。
 * 这里放得松（`loose` + 指标值只要 `value`）：后端多发字段不该让整表不显示，
 * 但「a 里有没有 key/label」这种画表必需的东西必须有。
 */
const pivotValueSchema = z.looseObject({ value: z.number().nullable() })
// key/label 可为 null = 这一格没归上这个维度（未标注），domain `pivot-window.ts` 就是这么冻的。
// 09-13 联调实测：业务×任务里整列 biz 为 null，按必有字符串校验把整张透视拦掉了。
const pivotAxisSchema = z.object({ key: z.string().min(1).nullable(), label: z.string().nullable() }).loose()
export const pivotRowSchema = z.looseObject({
  a: pivotAxisSchema,
  b: pivotAxisSchema.optional(),
  metrics: z.looseObject({ ratios: z.record(z.string(), pivotValueSchema).optional() }),
})
export type PivotRow = z.infer<typeof pivotRowSchema>

/** 空键格子的内部 key。真 key 由后端给、至少 1 个字符，撞不上这个 */
export const UNLABELED_KEY = "__unlabeled__"

function toAxis(axis: z.infer<typeof pivotAxisSchema>): PivotCell["a"] {
  if (axis.key === null) return { key: UNLABELED_KEY, label: axis.label ?? "未标注" }
  return { key: axis.key, label: axis.label ?? axis.key }
}

/** 指标名 → 从行里取值。比率在 `metrics.ratios` 下，其余在 `metrics` 顶层 */
function readMetric(row: PivotRow, metric: string): number | null {
  const ratios = row.metrics.ratios
  if (ratios && metric in ratios) return ratios[metric]?.value ?? null
  const direct = (row.metrics as Record<string, unknown>)[metric]
  const value = (direct as { value?: unknown } | undefined)?.value
  return typeof value === "number" ? value : null
}

export function toPivotCell(row: PivotRow, colDim: string | null, metric: string): PivotCell {
  return { a: toAxis(row.a), b: colDim && row.b ? toAxis(row.b) : null, value: readMetric(row, metric) }
}

/** 解析失败照实回 issues，调用方说「形状对不上」，不把半截数据画成表 */
export function parsePivotRows(rows: unknown, colDim: string | null, metric: string): { ok: true; cells: PivotCell[] } | { ok: false; issues: unknown[] } {
  const parsed = z.array(pivotRowSchema).safeParse(rows)
  if (!parsed.success) return { ok: false, issues: parsed.error.issues.slice(0, 3) }
  return { ok: true, cells: parsed.data.map((row) => toPivotCell(row, colDim, metric)) }
}
