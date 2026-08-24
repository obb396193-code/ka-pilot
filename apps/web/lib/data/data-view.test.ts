import assert from "node:assert/strict"
import test from "node:test"

import {
  buildDataViewHref,
  dataResponseSchema,
  readDataState,
  readDataViewMode,
} from "./data-view.ts"

test("only accepts the three frozen data views", () => {
  assert.equal(readDataViewMode("ka_data"), "ka_data")
  assert.equal(readDataViewMode("platform"), "platform")
  assert.equal(readDataViewMode("reconcile"), "reconcile")
  assert.equal(readDataViewMode("invented"), "platform")
})

test("only accepts the seven required data states", () => {
  for (const state of [
    "loading",
    "empty",
    "error",
    "no-access",
    "partial",
    "stale",
    "success",
  ] as const) {
    assert.equal(readDataState(state), state)
  }

  assert.equal(readDataState("unknown"), "success")
})

test("preserves compatible filters when switching data view", () => {
  assert.equal(
    buildDataViewHref("/data", "reconcile", {
      account_id: "demo-account-07",
      start: "2026-08-18",
      end: "2026-08-24",
      state: "partial",
      ignored: "drop-me",
    }),
    "/data?data_view=reconcile&account_id=demo-account-07&start=2026-08-18&end=2026-08-24&state=partial",
  )
})

test("rejects an API payload without visible lineage", () => {
  const result = dataResponseSchema.safeParse({
    state: "success",
    data: {},
  })

  assert.equal(result.success, false)
})

test("accepts a payload with source, deadline, version and coverage", () => {
  const result = dataResponseSchema.safeParse({
    state: "success",
    lineage: {
      source: "platform",
      sourceLabel: "平台原始数据",
      dataAsOf: "2026-08-24T09:30:00+08:00",
      datasetVersion: "platform-demo-v1",
      coverage: "18/20 账户",
      truncated: false,
      partial: false,
      stale: false,
      warnings: [],
    },
    data: {},
  })

  assert.equal(result.success, true)
})
