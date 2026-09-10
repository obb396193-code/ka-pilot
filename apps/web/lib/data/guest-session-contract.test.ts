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

test("普通会话也带上定形后的四字段（v1.9.15 之后三份 fixture 统一）", () => {
  // 这条原来断言 personal.json「没有 isDemo / provider」——那是 v1.9.15 定形之前的形状。
  // 定形后三份 session fixture 一致：identity 四件套 + 空间 isDemo，普通会话的
  // isDemo 是 false（不是缺省），provider 是 internal_test。
  const view = sessionViewSchema.parse((fixture("session-http/personal.json") as { data: unknown }).data)
  assert.equal(view.activeWorkspace.isDemo, false)
  assert.equal(view.identity.provider, "internal_test")
  assert.equal(view.identity.mustChangePassword, false)
})

test("login accepts both shapes and nothing else", () => {
  assert.equal(loginRequestSchema.safeParse({ provider: "guest" }).success, true)
  assert.equal(loginRequestSchema.safeParse({ provider: "internal_test", username: "wangwu", password: "x" }).success, true)
  // 访客请求不许夹带凭证或别的字段（strict），否则等于给匿名会话开了参数口子
  assert.equal(guestLoginRequestSchema.safeParse({ provider: "guest", username: "admin" }).success, false)
  assert.equal(loginRequestSchema.safeParse({ provider: "buc" }).success, false)
})

test("v1.9.14 identity.mustChangePassword=true parses；缺字段的老形会话不再接受（v1.9.20）", () => {
  const base = (fixture("session-http/personal.json") as { data: { identity: Record<string, unknown> } }).data
  const view = sessionViewSchema.parse({ ...base, identity: { ...base.identity, mustChangePassword: true } })
  assert.equal(view.identity.mustChangePassword, true)
  assert.equal(view.identity.provider, "internal_test")
  assert.equal(view.activeWorkspace.isDemo, false)
  // 字段并齐后收成必填（fe 在 F8-13 回执里预授权）：老形缺 mustChangePassword 必须被拦
  const { mustChangePassword: _omit, ...oldIdentity } = base.identity
  assert.equal(sessionViewSchema.safeParse({ ...base, identity: oldIdentity }).success, false)
})
