import { describe, expect, it } from "vitest";
import { adminMemberPatchRequestSchema, adminMemberReplaceGrantsRequestSchema } from "../src/admin-members.js";

describe("P193 strict membership mutation requests", () => {
  it("accepts one or both member fields", () => {
    for (const value of [{ role: "optimizer" }, { is_active: false }, { role: "lead", is_active: true }])
      expect(adminMemberPatchRequestSchema.parse(value)).toEqual(value);
  });
  it.each([{}, { role: "owner" }, { is_active: "false" }, { is_active: null }, { role: "admin", workspaceId: "foreign" }])("rejects invalid patch %j", value => {
    expect(adminMemberPatchRequestSchema.safeParse(value).success).toBe(false);
  });
  const item = { media: "KUAISHOU", accountId: "account-1", accessLevel: "read" };
  it("allows empty replacement and same accountId in separate media", () => {
    expect(adminMemberReplaceGrantsRequestSchema.parse({ items: [] })).toEqual({ items: [] });
    expect(adminMemberReplaceGrantsRequestSchema.parse({ items: [item, { ...item, media: "TENCENT" }] }).items).toHaveLength(2);
  });
  it.each([{ items: [item, item] }, { items: [{ ...item, grantedAt: "2026-09-13" }] },
    { items: [{ ...item, accessLevel: "owner" }] }, { items: [{ ...item, workspaceId: "foreign" }] },
    { items: [], scope: "all" }, { items: Array.from({ length: 1001 }, (_, i) => ({ ...item, accountId: String(i) })) },
  ])("rejects invalid grant replacement", value => {
    expect(adminMemberReplaceGrantsRequestSchema.safeParse(value).success).toBe(false);
  });
});
