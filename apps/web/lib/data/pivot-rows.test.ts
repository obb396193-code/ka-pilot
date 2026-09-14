import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { parsePivotRows, UNLABELED_KEY } from "./pivot-rows.ts"

/**
 * 透视行解析的真响应回放（arch 2026-09-13）。
 * JSON 是联调库上 BFF `/api/internal/data-query` 的原样响应（业务×任务，种子里没有业务归属）。
 * 09-13 真浏览器实测：a.key/label 全是 null，前端按「必有字符串」校验，整张透视显示「形状对不上」。
 */
const body = JSON.parse(readFileSync(new URL("./fixtures/real-backend/pivot2-biz-task-unlabeled.json", import.meta.url), "utf8"))
const rows = body.data.source.rows as { a: { key: string | null }; b: { key: string | null } }[]

test("★真响应里空键透视行能解析，不整表拦掉", () => {
  assert.ok(rows.some((row) => row.a.key === null), "回放样本得带空键行，不然这条测不到东西")
  const parsed = parsePivotRows(rows, "task", "cost")
  assert.ok(parsed.ok, parsed.ok ? "" : JSON.stringify(parsed.issues))
  assert.equal(parsed.cells.length, rows.length)
})

test("空键格子显示「未标注」，key 用内部占位、不和真 key 混", () => {
  const parsed = parsePivotRows(rows, "task", "cost")
  assert.ok(parsed.ok)
  for (const cell of parsed.cells) {
    if (cell.a.key === UNLABELED_KEY) assert.equal(cell.a.label, "未标注")
  }
  const bothNull = rows.findIndex((row) => row.a.key === null && row.b.key === null)
  if (bothNull >= 0) assert.deepEqual(parsed.cells[bothNull]!.b, { key: UNLABELED_KEY, label: "未标注" })
})

test("单维（不选列维）时不带 b", () => {
  const parsed = parsePivotRows(rows, null, "cost")
  assert.ok(parsed.ok)
  assert.ok(parsed.cells.every((cell) => cell.b === null))
})

test("画表必需的 a 缺了照样拦", () => {
  const parsed = parsePivotRows([{ metrics: {} }], null, "cost")
  assert.equal(parsed.ok, false)
})
