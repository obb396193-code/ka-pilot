import assert from "node:assert/strict"
import test from "node:test"

import {
  isRetryableErrorCode,
  resolveErrorMessage,
  stableDataQueryErrorCodeSchema,
  stableErrorCopy,
  stableErrorStatus,
} from "./contracts.ts"
import { forwardToBackend } from "./r014/forwarder.ts"
import { meCountsSchema } from "./r014/schemas.ts"

// F8-14（契约 v1.9.10 / v1.9.13）：五个码进共享枚举后，别再被判成「上游不合契约」502。
const NEW_CODES = ["NOT_FOUND", "CONFLICT", "RATE_LIMITED", "INVALID_CREDENTIALS", "READ_ONLY_ROLE"] as const

test("five backend codes are part of the shared enum and each has a status mapping", () => {
  for (const code of NEW_CODES) assert.ok(stableDataQueryErrorCodeSchema.safeParse(code).success, code)
  for (const code of stableDataQueryErrorCodeSchema.options) assert.ok(code in stableErrorStatus, code)
  assert.equal(stableErrorStatus.NOT_FOUND, 404)
  assert.equal(stableErrorStatus.CONFLICT, 409)
  assert.equal(stableErrorStatus.RATE_LIMITED, 429)
  assert.equal(stableErrorStatus.INVALID_CREDENTIALS, 401)
  assert.equal(stableErrorStatus.READ_ONLY_ROLE, 403)
  // null = 同一个码可能配 400/405/410，BFF 不二次判定
  assert.equal(stableErrorStatus.INVALID_REQUEST, null)
})

test("retryable is decided by the code, not hard-coded false", () => {
  for (const code of ["SOURCE_UNAVAILABLE", "UPSTREAM_TIMEOUT", "RATE_LIMITED"]) assert.equal(isRetryableErrorCode(code), true, code)
  for (const code of ["NOT_FOUND", "CONFLICT", "INVALID_CREDENTIALS", "READ_ONLY_ROLE", "FORBIDDEN", "INTERNAL_ERROR"]) {
    assert.equal(isRetryableErrorCode(code), false, code)
  }
})

test("every code that reaches a user has Chinese copy, and the two enforced ones win over upstream text", () => {
  assert.equal(stableErrorCopy("RATE_LIMITED"), "操作太频繁，15 分钟后再试")
  // 限速 / 只读身份：上游那句说不清「等多久」「找谁开」，以我们的为准
  assert.equal(resolveErrorMessage("RATE_LIMITED", "Too many requests"), "操作太频繁，15 分钟后再试")
  // 契约 v1.9.14 冻结原文；改这句要先改契约
  assert.equal(resolveErrorMessage("READ_ONLY_ROLE", "read only"), "演示空间只读，想用真数据找管理员开户")
  // 其余码上游更贴场景：同是 INVALID_CREDENTIALS，改密页要的是「当前密码不正确」
  assert.equal(resolveErrorMessage("INVALID_CREDENTIALS", "当前密码不正确"), "当前密码不正确")
  assert.equal(resolveErrorMessage("INVALID_CREDENTIALS"), "用户名或密码错误")
  // 没映射也没上游文案时，给一句人话，不显「未知错误」
  assert.equal(resolveErrorMessage("VIEW_UNSUPPORTED"), "这一步没成功，稍后再试")
})

const environment = {
  NODE_ENV: "production",
  KA_DATA_BACKEND_ORIGIN: "https://ka-data.internal.example",
  KA_DATA_SERVICE_TOKEN: "stable-codes-service-secret-000000",
}

async function forwardError(code: string, status: number) {
  return forwardToBackend(new Request("http://localhost/api/internal/me/counts", {
    headers: { cookie: "ka_session=stable-codes-session-0000000000001" },
  }), {
    path: "/api/v1/me/counts", method: "GET", dataSchema: meCountsSchema, environment,
    requestId: () => "req-codes",
    fetchImpl: async () => Response.json(
      { ok: false, error: { code, message: "upstream said so", retryable: code === "RATE_LIMITED", requestId: "req-codes" } },
      { status, headers: { "x-request-id": "req-codes" } },
    ),
  })
}

test("the forwarder passes 404/409/429 through instead of turning them into 502", async () => {
  for (const [code, status] of [["NOT_FOUND", 404], ["CONFLICT", 409], ["RATE_LIMITED", 429]] as const) {
    const result = await forwardError(code, status)
    assert.equal(result.status, status, code)
    assert.equal((result.body as { error: { code: string } }).error.code, code)
  }
})

test("the forwarder still rejects a code/status pair that contradicts itself", async () => {
  const result = await forwardError("NOT_FOUND", 409)
  assert.equal(result.status, 502)
})
