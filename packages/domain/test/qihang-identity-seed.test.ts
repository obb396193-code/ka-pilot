import { describe, expect, it } from "vitest";
import { qihangIdentitySeedSchema, qihangIdentitySeedResultSchema } from "../src/qihang-identity-seed.js";
const workspace_id = "00000000-0000-4000-8000-000000000001", user_id = "00000000-0000-4000-8000-000000000002";
const base = { workspace_id, user_id, qihang_user_id: "synthetic-qihang" };
describe("Qihang identity seed input/result", () => {
  it("accepts exactly one local user or identity selector", () => {
    expect(qihangIdentitySeedSchema.parse(base)).toEqual(base);
    expect(qihangIdentitySeedSchema.parse({ workspace_id, identity_id: user_id, qihang_user_id: "123456" })).toHaveProperty("identity_id", user_id);
  });
  it.each([
    { ...base, workspace_id: "bad" }, { ...base, identity_id: user_id }, { workspace_id, qihang_user_id: "synthetic" },
    { ...base, user_id: null }, { ...base, force: true }, { ...base, qihang_user_id: "" },
    { ...base, qihang_user_id: "a\nb" }, { ...base, qihang_user_id: " x " }, { ...base, qihang_user_id: "x".repeat(257) },
    { ...base, qihang_user_id: 123 }, { ...base, role: "admin" },
  ])("rejects malformed/private-input expansion", input => expect(qihangIdentitySeedSchema.safeParse(input).success).toBe(false));
  it("public command result can never echo the bound identity", () => {
    const output = { workspaceId: workspace_id, userId: user_id, status: "bound" };
    expect(qihangIdentitySeedResultSchema.parse(output)).toEqual(output);
    expect(qihangIdentitySeedResultSchema.safeParse({ ...output, qihang_user_id: base.qihang_user_id }).success).toBe(false);
  });
});
