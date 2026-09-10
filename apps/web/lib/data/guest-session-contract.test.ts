import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { guestLoginRequestSchema, loginRequestSchema, sessionHttpResponseSchema, sessionViewSchema } from "./session-contracts.ts"

// F8-12（契约 v1.9.6 + v1.9.12 改口）：访客会话。这两份 fixture 是 arch 从后端导出的，
// schema 是 strict 的——少认一个字段就是真实模式下整条会话解析失败、用户卡在登录页。
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`../../../../packages/contract/fixtures/${name}`, import.meta.url), "utf8"))
}

test("the guest session fixture parses: viewer role, demo team workspace, guest identity", () => {
  const parsed = sessionHttpResponseSchema.parse(fixture("session-http/guest.json"))
  assert.equal(parsed.ok, true)
  const view = sessionViewSchema.parse((parsed as { data: unknown }).data)
  assert.equal(view.activeWorkspace.role, "viewer")
  // v1.9.12 改口：演示空间不是新 kind，是 team + isDemo
  assert.equal(view.activeWorkspace.kind, "team")
  assert.equal(view.activeWorkspace.isDemo, true)
  assert.equal(view.identity.provider, "guest")
  // 访客只有演示空间一个，空间切换器自然只剩它
  assert.equal(view.workspaces.length, 1)
})

test("the guest login fixture parses, including its TTL", () => {
  const view = sessionViewSchema.parse((fixture("auth/login-guest.json") as { data: unknown }).data)
  assert.equal(view.expiresAt, "2026-09-05T11:15:00.000+08:00")
})

test("普通会话没有 isDemo / provider 也要照旧过", () => {
  const view = sessionViewSchema.parse((fixture("session-http/personal.json") as { data: unknown }).data)
  assert.equal(view.activeWorkspace.isDemo, undefined)
  assert.equal(view.identity.provider, undefined)
})

test("login accepts both shapes and nothing else", () => {
  assert.equal(loginRequestSchema.safeParse({ provider: "guest" }).success, true)
  assert.equal(loginRequestSchema.safeParse({ provider: "internal_test", username: "wangwu", password: "x" }).success, true)
  // 访客请求不许夹带凭证或别的字段（strict），否则等于给匿名会话开了参数口子
  assert.equal(guestLoginRequestSchema.safeParse({ provider: "guest", username: "admin" }).success, false)
  assert.equal(loginRequestSchema.safeParse({ provider: "buc" }).success, false)
})

test("v1.9.14 identity.mustChangePassword parses and老形会话不带它也照旧过", () => {
  const view = sessionViewSchema.parse((fixture("session-http/personal-v1914-must-change-password.json") as { data: unknown }).data)
  assert.equal(view.identity.mustChangePassword, true)
  assert.equal(view.identity.provider, "internal_test")
  assert.equal(view.activeWorkspace.isDemo, false)
  // be2 Q-032 落地前 personal.json 还是老形，必填的话联调环境会整条会话解析失败
  const old = sessionViewSchema.parse((fixture("session-http/personal.json") as { data: unknown }).data)
  assert.equal(old.identity.mustChangePassword, undefined)
})
