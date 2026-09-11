import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import test from "node:test"

import { dataQueryResponseSchema } from "./contracts.ts"

/**
 * A40 真响应回放（arch 2026-09-11）。
 *
 * 这里的 JSON 是联调库（合成种子，无真实账户）上 data-api 的**原样响应**，不是手写的。
 * 为什么要有它：be2 按 v1.9.35 开始发 `availability:"partial"`、`costStatusReason:"partial_data"`，
 * 命名维度行带 `source/sources`——而前端镜像不认，BFF 把整条响应判成「不合契约」→ 数据分析整页 502。
 * 前后端各自的门禁都是绿的（前端测的是自写 fixture，后端测的是自己的 schema），只有真响应能抓到。
 *
 * 规矩：后端改了发出的形状，arch 在联调库重取这几份覆盖进来；这条红了先修镜像，不许改 JSON。
 */
const dir = new URL("./fixtures/real-backend/", import.meta.url)

for (const file of readdirSync(dir).filter((name) => name.endsWith(".json"))) {
  test(`真响应回放：${file} 过 BFF 契约`, () => {
    const body = JSON.parse(readFileSync(new URL(file, dir), "utf8"))
    const result = dataQueryResponseSchema.safeParse(body)
    assert.ok(result.success, result.success ? "" : JSON.stringify(result.error.issues.slice(0, 3)))
  })
}

test("真响应回放覆盖部分合计与缺数点名", () => {
  const body = JSON.parse(readFileSync(new URL("summary-partial.json", dir), "utf8"))
  const source = body.data.source
  assert.equal(source.lineage.partial, true)
  const codes = source.lineage.warnings.filter((w: unknown) => typeof w === "object").map((w: { code: string }) => w.code)
  assert.ok(codes.includes("ACCOUNT_DAY_MISSING") && codes.includes("BATCH_FAILED"))
  assert.equal(source.rows[0].assessment.biConv.availability, "partial")
})
