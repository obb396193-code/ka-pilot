import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { AdminMemberManagementRepository } from "../src/admin-member-management-repository.js";

// Synthetic identities. Mapper faults are not a substitute for the real PG suite.
const actorId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
const workspaceId = "00000000-0000-4000-8000-000000000003";
const userId = "00000000-0000-4000-8000-000000000004";
const auth = { workspaceId: actorId, userId: actorId, role: "optimizer", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: [] } };
const member = { workspace_id: workspaceId, identity_id: targetId, user_id: userId, role: "optimizer",
  is_active: true, display_name: "Synthetic", provider: "internal_test", joined_at: "2026-09-13",
  grants_count: "0", last_seen_at: null, must_change_password: false };
type Rows = Record<string, unknown>[];
function setup(overrides: { identity?: Rows; target?: Rows; members?: Rows; detail?: Rows; grants?: Rows } = {}) {
  const query = vi.fn(async (sql: string) => ({ rows:
    sql.startsWith("SELECT i.id") ? [{ id: actorId }]
    : sql.startsWith("SELECT m.workspace_id FROM") ? [{ workspace_id: actorId }]
    : sql.startsWith("SELECT id FROM auth_identities") ? overrides.identity ?? [{ id: targetId }]
    : sql.startsWith("SELECT m.workspace_id,m.identity_id") ? overrides.target ?? [{ workspace_id: workspaceId, identity_id: targetId, user_id: userId }]
    : sql.startsWith("SELECT identity_id FROM") ? overrides.members ?? [{ identity_id: targetId }]
    : sql.includes("p193-target-member") ? overrides.detail ?? [member]
    : sql.includes("p193-personal-grants") ? overrides.grants ?? [] : [] }));
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release, on: vi.fn(), removeListener: vi.fn() }));
  return { query, connect, release, repo: new AdminMemberManagementRepository({ connect } as unknown as Pool) };
}
describe("P193 identity-governance mapper boundaries", () => {
  it.each([
    { identity: [{ id: actorId }] }, { identity: [{ id: targetId }, { id: targetId }] },
    { target: [{ workspace_id: "bad", identity_id: targetId, user_id: userId }] },
    { target: [{ workspace_id: workspaceId, identity_id: actorId, user_id: userId }] },
    { target: [{ workspace_id: workspaceId, identity_id: targetId, user_id: "bad" }] },
  ])("rejects invalid target identity/tuple %j", async overrides => {
    const s = setup(overrides);
    await expect(s.repo.grants(auth, targetId)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(s.query.mock.calls.map(c => c[0])).toContain("ROLLBACK");
  });
  it.each([{ members: [] }, { members: [{ identity_id: actorId }] }])("rejects missing/mismatched personal owner %j", async ({ members }) => {
    await expect(setup({ members }).repo.grants(auth, targetId)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it.each([
    { workspace_id: actorId }, { identity_id: actorId }, { user_id: actorId }, { grants_count: "NaN" },
    { grants_count: "9007199254740992" }, { last_seen_at: "bad" }, { last_seen_at: new Date(NaN) },
    { role: "owner" }, { is_active: "false" }, { joined_at: "2026-02-31" },
  ])("patch refuses malformed stored metadata before writes %j", async patch => {
    const s = setup({ detail: [{ ...member, ...patch }] });
    await expect(s.repo.patch(auth, targetId, { role: "lead" })).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(s.query.mock.calls.some(c => c[0].startsWith("UPDATE"))).toBe(false);
  });
  it.each([{ detail: [] }, { detail: [member, member] }])("single target detail rejects missing/duplicate rows %j", async ({ detail }) => {
    await expect(setup({ detail }).repo.patch(auth, targetId, { role: "lead" })).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it.each([
    { workspace_id: actorId, identity_id: targetId },
    { workspace_id: workspaceId, identity_id: actorId },
    { workspace_id: workspaceId, identity_id: targetId, media: "KUAISHOU", account_id: "same", access_level: "owner", granted_at: "2026-09-13" },
  ])("rejects foreign/malformed grants %j", async row => {
    await expect(setup({ grants: [row] }).repo.grants(auth, targetId)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("rejects overflow before grant mapping", async () => {
    await expect(setup({ grants: Array.from({ length: 1001 }, () => ({})) }).repo.grants(auth, targetId)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
  it.each(["57014", "55P03", "40P01"])("sanitizes PG timeout/deadlock %s", async code => {
    const s = setup(); s.connect.mockRejectedValueOnce({ code, message: "private SQL token" });
    await expect(s.repo.grants(auth, targetId)).rejects.toThrow("Member provisioning: UPSTREAM_TIMEOUT");
  });
  it("sanitizes connection faults and releases the successful read snapshot", async () => {
    const s = setup(); s.connect.mockRejectedValueOnce(new Error("private SQL token"));
    await expect(s.repo.grants(auth, targetId)).rejects.toThrow("Member provisioning: SOURCE_UNAVAILABLE");
    expect(await s.repo.grants(auth, targetId)).toEqual({ workspaceId, data: { identityId: targetId, items: [] } });
    expect(s.release).toHaveBeenCalledOnce();
    expect(s.query.mock.calls.map(c => c[0])).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  });
});
