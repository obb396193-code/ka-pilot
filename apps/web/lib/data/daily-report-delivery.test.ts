import assert from "node:assert/strict"
import test from "node:test"

import { dailyReportSchema } from "./r014/schemas.ts"

// v1.9.48 ④：日报推送状态新增 deduplicated（出站命中同内容已发行）。
// 宽收规则只放行「多出未知键」，枚举越界仍必须判废——这里两头都钉住。
const base = {
  schema: "daily-report/v1", date: "2026-09-12", role: "optimizer", dataAsOf: null,
  modules: [], actions: { pushDingtalk: true, exportPdf: false },
}

test("日报推送状态 deduplicated + at:null 过 schema", () => {
  const r = dailyReportSchema.safeParse({ ...base, delivery: { status: "deduplicated", at: null, target: "workspace:00000000-0000-4000-8000-000000000093:admins" } })
  assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues))
})

test("未知推送状态仍被判废（不宽收成任意 string）", () => {
  const r = dailyReportSchema.safeParse({ ...base, delivery: { status: "delivered_maybe", at: null, target: null } })
  assert.equal(r.success, false)
})
