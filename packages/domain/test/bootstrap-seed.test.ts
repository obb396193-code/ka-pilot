import { describe, expect, it } from "vitest";

import { parseBootstrapSeed } from "../src/bootstrap-seed.js";

const identity = "00000000-0000-4000-8000-000000000001";
const workspace = "00000000-0000-4000-8000-000000000002";
const user = "00000000-0000-4000-8000-000000000003";
function fixture() {
  return {
    identities: [{ id: identity, display_name: "测试身份" }],
    workspaces: [{ id: workspace, kind: "personal", name: "测试空间" }],
    memberships: [{ identity_id: identity, workspace_id: workspace, user_id: user, role: "optimizer" }],
    grants: [{ workspace_id: workspace, media: "KUAISHOU", account_id: "synthetic-1", user_id: user }],
  };
}

describe("bootstrap seed strict input", () => {
  it("preserves only frozen fields; does not add access levels or secrets", () => {
    expect(parseBootstrapSeed(fixture())).toEqual(fixture());
  });
  it("permits explicit empty grants and an entirely empty seed without defaults", () => {
    expect(parseBootstrapSeed({ ...fixture(), grants: [] }).grants).toEqual([]);
    expect(parseBootstrapSeed({ identities: [], workspaces: [], memberships: [], grants: [] })).toEqual({ identities: [], workspaces: [], memberships: [], grants: [] });
  });
  it("preserves optional generated IDs for the transactional resolver", () => {
    const value = fixture();
    expect(parseBootstrapSeed({ ...value, workspaces: [{ kind: "team", name: "团队" }], memberships: [{ identity_id: identity, workspace_id: workspace, role: "lead" }] }).memberships[0]?.user_id).toBeUndefined();
  });
  it("allows identical repeated identities to be replayed idempotently", () => {
    const value = fixture();
    expect(parseBootstrapSeed({ ...value, identities: [...value.identities, ...value.identities] }).identities).toHaveLength(2);
  });
  it.each(["password", "token", "secret", "scope", "access_level"])("rejects extra top-level %s", (key) => {
    expect(() => parseBootstrapSeed({ ...fixture(), [key]: "private" })).toThrow("Invalid bootstrap seed");
  });
  it.each(["identities", "workspaces", "memberships", "grants"] as const)("rejects nested secrets in %s", (key) => {
    const value = fixture();
    expect(() => parseBootstrapSeed({ ...value, [key]: [{ ...value[key][0], password: "do-not-leak" }] })).toThrow(/^Invalid bootstrap seed$/);
  });
  it.each([undefined, null, "{}", {}, { ...fixture(), grants: "all_accounts_in_workspace" }])("rejects missing/legacy input %j", (value) => {
    expect(() => parseBootstrapSeed(value)).toThrow(/^Invalid bootstrap seed$/);
  });
  it.each(["readonly", "owner", "EXECUTE"])("does not invent auth role %s", (role) => {
    expect(() => parseBootstrapSeed({ ...fixture(), memberships: [{ ...fixture().memberships[0], role }] })).toThrow();
  });
  it.each(["", "   ", "line\nbreak", "\u0000"])("rejects blank/control display names %j", (display_name) => {
    expect(() => parseBootstrapSeed({ ...fixture(), identities: [{ id: identity, display_name }] })).toThrow();
  });
  it.each([
    { ...fixture().grants[0], media: "kuaishou" },
    { ...fixture().grants[0], account_id: "bad id" },
    { ...fixture().grants[0], user_id: "not-uuid" },
    { ...fixture().grants[0], access_level: "execute" },
  ])("rejects invalid or escalated grant %j", (grant) => {
    expect(() => parseBootstrapSeed({ ...fixture(), grants: [grant] })).toThrow();
  });
  it("keeps same account ID across media/workspaces distinct", () => {
    const value = fixture();
    const second = { ...value.grants[0], media: "TENCENT" };
    const third = { ...value.grants[0], workspace_id: "00000000-0000-4000-8000-000000000004" };
    expect(parseBootstrapSeed({ ...value, grants: [...value.grants, second, third] }).grants).toHaveLength(3);
  });
  it.each(["identities", "workspaces", "memberships", "grants"] as const)("bounds %s input", (key) => {
    const value = fixture();
    expect(() => parseBootstrapSeed({ ...value, [key]: Array.from({ length: 1001 }, () => value[key][0]) })).toThrow();
  });
  it.each([
    { identities: [{ id: identity, display_name: "conflict" }] },
    { workspaces: [{ id: workspace, kind: "team", name: "conflict" }] },
    { memberships: [{ ...fixture().memberships[0], role: "admin" }] },
  ])("rejects conflicting duplicate keys %j", (duplicate) => {
    const value = fixture();
    const key = Object.keys(duplicate)[0] as "identities" | "workspaces" | "memberships";
    expect(() => parseBootstrapSeed({ ...value, [key]: [...value[key], ...duplicate[key]!] })).toThrow(/^Invalid bootstrap seed$/);
  });
});
