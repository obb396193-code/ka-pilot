import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { guestLoginRequestSchema, loginRequestSchema, sessionViewSchema, sessionWorkspaceSchema } from "./session-contracts.ts"

// F8-12（契约 v1.9.6 → v1.9.15 定形）：访客会话。
// schema 是 strict 的——少认一个字段就是真实模式下整条会话解析失败、用户卡在登录页。
function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`../../../../packages/contract/fixtures/${name}`, import.meta.url), "utf8"))
}
function identityOf(name: string): Record<string, unknown> {
  return ((fixture(name).data as Record<string, unknown>).identity) as Record<string, unknown>
}

test("访客的演示空间：viewer + team + isDemo（v1.9.12 改口，演示空间不是新 kind）", () => {
  const data = fixture("session-http/guest.json").data as { activeWorkspace: unknown; workspaces: unknown[] }
  const workspace = sessionWorkspaceSchema.parse(data.activeWorkspace)
  assert.equal(workspace.role, "viewer")
  assert.equal(workspace.kind, "team")
  assert.equal(workspace.isDemo, true)
  // 访客只有演示空间一个，空间切换器自然只剩它
  assert.equal(data.workspaces.length, 1)
})

test("identity 三字段（v1.9.14/v1.9.15）都是必填，缺一个就整条会话解析失败", () => {
  const guest = identityOf("session-http/guest.json")
  assert.equal(guest.provider, "guest")
  // ⚠️ 两份 guest fixture 目前**缺 mustChangePassword**，但后端确实会发
  //（packages/db/src/auth-repository.ts:271「buc/guest 没有密码行，自然是 false」）。
  // 已报 arch 补 fixture；这里补上再解析，等 fixture 补齐后本用例照旧过。
  const view = sessionViewSchema.parse({
    ...(fixture("session-http/guest.json").data as object),
    identity: { mustChangePassword: false, ...guest },
  })
  assert.equal(view.identity.mustChangePassword, false)
  // 少任何一个必填字段都必须被拦下
  for (const drop of ["id", "provider", "displayName", "mustChangePassword"]) {
    const broken = { mustChangePassword: false, ...guest } as Record<string, unknown>
    delete broken[drop]
    assert.equal(sessionViewSchema.safeParse({ ...(fixture("session-http/guest.json").data as object), identity: broken }).success, false, drop)
  }
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

test("v1.9.14 未改初始密码的会话：解析出 true，设置页据此出提示条", () => {
  // be2 Q-032 落地后 personal-v1914-*.json 已被并回并删除，现存三份 fixture 的 mustChangePassword 都是 false，
  // 所以这里用 personal.json 翻成 true 来锁「true 能解析出来」这条——否则整个提示条无人覆盖。
  const data = fixture("session-http/personal.json").data as { identity: Record<string, unknown> }
  const view = sessionViewSchema.parse({ ...data, identity: { ...data.identity, mustChangePassword: true } })
  assert.equal(view.identity.mustChangePassword, true)
})

test("login 只收两种形状，访客那支不许夹带凭证", () => {
  assert.equal(loginRequestSchema.safeParse({ provider: "guest" }).success, true)
  assert.equal(loginRequestSchema.safeParse({ provider: "internal_test", username: "wangwu", password: "x" }).success, true)
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
