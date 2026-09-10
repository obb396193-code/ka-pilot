import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adminMemberCreateRequestSchema, adminMemberCreatedResponseSchema,
  adminMemberResetPasswordRequestSchema, adminMemberResetPasswordResponseSchema,
  adminMembersV195ResponseSchema,
} from "../src/admin-members.js";

const load = (name: string) => {
  const value = JSON.parse(readFileSync(new URL(`../../contract/fixtures/admin/${name}.json`, import.meta.url), "utf8"));
  delete value.meta._note; // Documentation annotation is not a wire field.
  return value;
};
const request = { display_name: "测试成员", provider: "internal_test", provider_subject: "member.demo-01@example", role: "optimizer" };

describe("F-OS-004 strict command contract", () => {
  it("accepts internal-test generated/provided passwords and BUC without a password", () => {
    expect(adminMemberCreateRequestSchema.parse(request)).toEqual(request);
    expect(adminMemberCreateRequestSchema.safeParse({ ...request, initial_password: "synthetic-password-only" }).success).toBe(true);
    expect(adminMemberCreateRequestSchema.safeParse({ ...request, provider: "buc" }).success).toBe(true);
  });
  it.each([
    { provider_subject: "中文用户名" }, { provider_subject: "contains space" }, { provider_subject: "" },
    { provider_subject: "a".repeat(129) }, { provider_subject: "name\n" }, { provider: "guest" },
    { display_name: "" }, { display_name: "a".repeat(257) }, { role: "owner" }, { role: "viewer" },
    { initial_password: null }, { initial_password: "short" }, { initial_password: "a".repeat(1025) },
    { workspaceId: "client-workspace" }, { identityId: "client-identity" }, { scope: "all" },
    { is_active: true }, { provider: "buc", initial_password: "synthetic-password-only" },
  ])("rejects malformed or authority-bearing input %j", patch => {
    expect(adminMemberCreateRequestSchema.safeParse({ ...request, ...patch }).success).toBe(false);
  });
  it("accepts exact username/password length boundaries", () => {
    for (const length of [12, 1024]) expect(adminMemberCreateRequestSchema.safeParse({
      ...request, provider_subject: "a".repeat(128), initial_password: "x".repeat(length),
    }).success).toBe(true);
  });
  it("reset requires exactly an empty object", () => {
    expect(adminMemberResetPasswordRequestSchema.parse({})).toEqual({});
    for (const value of [null, [], undefined, { password: "injected" }, { identityId: "injected" }]) {
      expect(adminMemberResetPasswordRequestSchema.safeParse(value).success).toBe(false);
    }
  });
  it.each([
    ["member-created", adminMemberCreatedResponseSchema],
    ["member-reset-password", adminMemberResetPasswordResponseSchema],
    ["members-v195", adminMembersV195ResponseSchema],
  ] as const)("accepts authoritative %s including unknown freshness", (name, schema) => {
    const fixture = load(name);
    expect(schema.safeParse(fixture).success).toBe(true);
    fixture.meta.dataAsOf = null;
    expect(schema.safeParse(fixture).success).toBe(true);
  });
  it("requires password for created internal-test and forbids it for BUC", () => {
    const fixture = load("member-created");
    delete fixture.data.initialPassword;
    expect(adminMemberCreatedResponseSchema.safeParse(fixture).success).toBe(false);
    fixture.data.provider = "buc";
    fixture.data.mustChangePassword = false;
    expect(adminMemberCreatedResponseSchema.safeParse(fixture).success).toBe(true);
    fixture.data.initialPassword = "synthetic-password-only";
    expect(adminMemberCreatedResponseSchema.safeParse(fixture).success).toBe(false);
  });
  it.each([{ userId: "not-uuid" }, { joinedAt: "2026-02-31" }, { loginName: "invalid name" },
    { mustChangePassword: "true" }, { initialPassword: null }, { token: "not-allowed" }])("rejects invalid created output %j", patch => {
    const fixture = load("member-created");
    Object.assign(fixture.data, patch);
    expect(adminMemberCreatedResponseSchema.safeParse(fixture).success).toBe(false);
  });
  it("never accepts returned passwords on member listing", () => {
    const fixture = load("members-v195");
    fixture.data.items[0].initialPassword = "synthetic-password-only";
    expect(adminMembersV195ResponseSchema.safeParse(fixture).success).toBe(false);
  });
  it("list requires mustChangePassword and still rejects duplicate identities", () => {
    const fixture = load("members-v195");
    delete fixture.data.items[0].mustChangePassword;
    expect(adminMembersV195ResponseSchema.safeParse(fixture).success).toBe(false);
    const duplicate = load("members-v195"); duplicate.data.items.push(duplicate.data.items[0]);
    expect(adminMembersV195ResponseSchema.safeParse(duplicate).success).toBe(false);
  });
  it.each([{ identityId: "invalid" }, { sessionsRevoked: -1 }, { sessionsRevoked: 0.5 },
    { sessionsRevoked: Number.MAX_SAFE_INTEGER + 1 }, { initialPassword: "short" }, { hash: "not-allowed" }])("rejects invalid reset output %j", patch => {
    const fixture = load("member-reset-password"); Object.assign(fixture.data, patch);
    expect(adminMemberResetPasswordResponseSchema.safeParse(fixture).success).toBe(false);
  });
  it("accepts stable conflict and readonly errors without accepting diagnostic extras", () => {
    for (const code of ["CONFLICT", "READ_ONLY_ROLE", "UNAUTHORIZED", "INTERNAL_ERROR"]) {
      const value = { ok: false, error: { code, message: "Member request could not be completed", requestId: "r209", retryable: false } };
      expect(adminMemberCreatedResponseSchema.safeParse(value).success).toBe(true);
      expect(adminMemberResetPasswordResponseSchema.safeParse(value).success).toBe(true);
      expect(adminMemberCreatedResponseSchema.safeParse({ ...value, error: { ...value.error, password: "not-allowed" } }).success).toBe(false);
    }
  });
});
