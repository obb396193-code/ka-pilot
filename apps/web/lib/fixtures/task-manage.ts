import { z } from "zod"

import listManage from "@contract/fixtures/tasks/list-manage.json"

/**
 * F8-23 任务管理视图的数据形（契约 v1.9.28）。
 *
 * **不用 `as unknown as Fixture<…>`**：那种断言一个字段都不校验，压着不合形的数据进页面，
 * 等真接口一上才在用户面前炸（F8-19b 审查点名过一次，这里不再犯）。
 * 这里用真 schema parse，不合形就退化成空列表 + 控制台点名，页面照实说没数据。
 */

export const taskManageRowSchema = z.object({
  taskId: z.string().min(1),
  taskName: z.string().min(1),
  bizName: z.string().nullable(),
  /** `paused` = 停投（v1.9.28 新增）；`ended` 仍表示任务期结束 */
  status: z.enum(["preparing", "active", "paused", "ended"]),
  aliases: z.array(z.string()).default([]),
  monitorUrl: z.string().nullable().default(null),
  productName: z.string().nullable().default(null),
  assessmentPrice: z.object({ value: z.number(), effectiveDate: z.string() }).nullable().default(null),
  /** 后端 list-manage 目前不发预算；发了就显这一列，没发就整列不显（问 arch 中） */
  budget: z.number().nullable().optional(),
}).loose()

export type TaskManageRow = z.infer<typeof taskManageRowSchema>

/** 一个大类下可编辑的那几个字段——和 `taskManageRecordSchema`（BFF 侧）保持一致 */
export type TaskManageDraft = Pick<TaskManageRow, "taskId" | "taskName" | "bizName" | "status" | "aliases" | "monitorUrl" | "productName">

function read(): TaskManageRow[] {
  const payload = listManage as { ok?: boolean; data?: { items?: unknown[] } }
  if (payload?.ok !== true || !Array.isArray(payload.data?.items)) return []
  const parsed = z.array(taskManageRowSchema).safeParse(payload.data.items)
  if (parsed.success) return parsed.data
  console.error("[task-manage fixture] list-manage.json 不合 schema：", parsed.error.issues.slice(0, 3))
  return []
}

export const taskManageRows: TaskManageRow[] = read()

/** 停投沉底：在投的排前面，同组按名字。管理视图里人找的是在跑的那批。 */
export function sortForManage(rows: TaskManageRow[]): TaskManageRow[] {
  const weight = (status: TaskManageRow["status"]) => (status === "active" ? 0 : status === "preparing" ? 1 : status === "paused" ? 2 : 3)
  return [...rows].sort((left, right) => weight(left.status) - weight(right.status) || left.taskName.localeCompare(right.taskName, "zh-CN"))
}

/** 按业务大类分组；没有大类的归到「未归类」，不丢行。 */
export function groupByBiz(rows: TaskManageRow[]): { biz: string; named: boolean; rows: TaskManageRow[] }[] {
  const groups = new Map<string, TaskManageRow[]>()
  for (const row of rows) {
    const key = row.bizName ?? ""
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups.entries()]
    .map(([biz, items]) => ({ biz: biz || "未归类", named: biz !== "", rows: sortForManage(items) }))
    .sort((left, right) => Number(left.named === false) - Number(right.named === false) || left.biz.localeCompare(right.biz, "zh-CN"))
}
