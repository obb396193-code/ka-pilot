import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { adminMembersResponseSchema, adminMemberGrantsResponseSchema } from "../src/admin-members.js";
const load = (name: string) => { const x = JSON.parse(readFileSync(new URL(`../../contract/fixtures/admin/${name}.json`, import.meta.url), "utf8")); delete x.meta._note; return x; };
describe("admin member and grant canonical boundary", () => {
  it.each([["members", adminMembersResponseSchema], ["grants", adminMemberGrantsResponseSchema]] as const)("accepts authoritative %s and unknown data time", (name, schema) => {
    const f = load(name); expect(schema.safeParse(f).success).toBe(true); f.meta.dataAsOf = null; expect(schema.safeParse(f).success).toBe(true);
  });
  it.each([{ identityId: "bad" }, { userId: "bad" }, { displayName: null }, { provider: "other" }, { isActive: "false" }, { joinedAt: "2026-02-31" }, { grantsCount: -1 }, { lastSeenAt: "yesterday" }, { token: "secret" }])("rejects member field %j", patch => {
    const f = load("members"); f.data.items = [{ ...f.data.items[0], ...patch }]; expect(adminMembersResponseSchema.safeParse(f).success).toBe(false);
  });
  it.each([{ media: "other" }, { accountId: "" }, { accessLevel: "owner" }, { grantedAt: "2026-02-31" }, { token: "secret" }])("rejects grant field %j", patch => {
    const f = load("grants"); f.data.items = [{ ...f.data.items[0], ...patch }]; expect(adminMemberGrantsResponseSchema.safeParse(f).success).toBe(false);
  });
  it("rejects duplicates but preserves equal account IDs across media", () => {
    const m = load("members"); m.data.items.push(m.data.items[0]); expect(adminMembersResponseSchema.safeParse(m).success).toBe(false);
    const g = load("grants"); g.data.items = [g.data.items[0], { ...g.data.items[0], media: "TENCENT" }]; expect(adminMemberGrantsResponseSchema.safeParse(g).success).toBe(true);
    g.data.items.push(g.data.items[0]); expect(adminMemberGrantsResponseSchema.safeParse(g).success).toBe(false);
  });
});
