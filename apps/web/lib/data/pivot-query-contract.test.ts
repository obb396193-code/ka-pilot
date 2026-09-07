import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { dataQueryResponseSchema, dataQueryRequestSchema } from "./contracts.ts"
import { canonicalQueryRowSchemaById } from "./canonical-query-rows.ts"
async function fixture() {
  const body = JSON.parse(await readFile(new URL("../../../../packages/contract/fixtures/data-query/pivot2.json", import.meta.url), "utf8"))
  return { ok: true, data: body.data, meta: { cellCoverage: body.meta.cellCoverage } }
}
test("pivot BFF wire schema preserves authoritative source cells and coverage without mock synthesis", async () => {
  const input = await fixture()
  assert.deepEqual(dataQueryResponseSchema.parse(input), input)
  assert.ok(dataQueryRequestSchema.safeParse({ queryId: "account.pivot2", params: { dimA: "biz", dimB: "task" } }).success)
  assert.ok(!dataQueryRequestSchema.safeParse({ queryId: "account.pivot2", params: {}, dataView: "ka_data" }).success)
})
test("pivot metric zero/missing/error stay distinct and malformed present values fail", async () => {
  const input = await fixture(), row = input.data.source.rows[0]
  for (const cost of [{ value: 0, availability: "available" }, { value: null, availability: "missing" }, { value: null, availability: "error" }]) {
    assert.ok(canonicalQueryRowSchemaById["account.pivot2"].safeParse({ ...row, metrics: { ...row.metrics, cost } }).success)
  }
  for (const cost of [null, 0, { value: "0", availability: "available" }, { value: 1, availability: "error" }, { value: Infinity, availability: "available" }]) {
    assert.ok(!canonicalQueryRowSchemaById["account.pivot2"].safeParse({ ...row, metrics: { ...row.metrics, cost } }).success)
  }
})
test("pivot missing/extra fields, mismatched count/window/axis and metadata are rejected", async () => {
  for (const key of ["dimA", "dimB", "rows", "rowSchemaVersion"]) {
    const input = await fixture(); delete input.data.source[key]; assert.ok(!dataQueryResponseSchema.safeParse(input).success)
  }
  const duplicate = await fixture(); duplicate.data.source.rows.push(duplicate.data.source.rows[0]); duplicate.data.source.returnedRowCount++
  assert.ok(!dataQueryResponseSchema.safeParse(duplicate).success)
  const missingWindow = await fixture(); delete missingWindow.data.source.lineage.window
  assert.ok(!dataQueryResponseSchema.safeParse(missingWindow).success)
  const badMeta = await fixture(); badMeta.meta.cellCoverage.withData = 4
  assert.ok(!dataQueryResponseSchema.safeParse(badMeta).success)
  const wrongVersion = await fixture(); wrongVersion.data.source.rowSchemaVersion = "account.pivot2/v2"
  assert.ok(!dataQueryResponseSchema.safeParse(wrongVersion).success)
})
