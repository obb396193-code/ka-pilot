import assert from "node:assert/strict"
import test from "node:test"

import { createDataClient } from "./client.ts"

/**
 * F8-19b P1：**取消要真的取消**，不只是丢弃结果。
 * 只丢结果的话，连点几次窗口就是几次白算——大盘一轮是八个查询。
 */

test("★调用方给的 signal 一 abort，请求就带着 aborted 的 signal 发出去", async () => {
  let seen: AbortSignal | undefined
  const client = createDataClient({
    mode: "internal_api",
    fetchImpl: async (_input, init) => {
      seen = init?.signal ?? undefined
      return Response.json({ ok: false, error: { code: "INTERNAL_ERROR", message: "x", retryable: false, requestId: "r" } })
    },
  })
  const controller = new AbortController()
  controller.abort()
  await client.query({ queryId: "account.summary", params: {}, dataView: "platform" }, controller.signal).catch(() => {})
  assert.ok(seen, "必须把 signal 传给 fetch，否则「取消」只是个摆设")
  assert.equal(seen?.aborted, true)
})

test("★不给 signal 时超时兜底还在 —— 别因为接了取消就把 12s 预算丢了", async () => {
  let seen: AbortSignal | undefined
  const client = createDataClient({
    mode: "internal_api",
    fetchImpl: async (_input, init) => {
      seen = init?.signal ?? undefined
      return Response.json({ ok: false, error: { code: "INTERNAL_ERROR", message: "x", retryable: false, requestId: "r" } })
    },
  })
  await client.query({ queryId: "account.summary", params: {}, dataView: "platform" }).catch(() => {})
  assert.ok(seen, "没有调用方 signal 时也要有超时 signal")
  assert.equal(seen?.aborted, false)
})
