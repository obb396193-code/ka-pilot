import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { AdminMemberProvisioningRepository } from "../src/admin-member-provisioning-repository.js";
const identityId = "00000000-0000-4000-8000-000000000001";
const auth = { workspaceId: "00000000-0000-4000-8000-000000000002", userId: "00000000-0000-4000-8000-000000000003",
  role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
const row = { identity_id: identityId, user_id: auth.userId, role: "optimizer", is_active: true,
  display_name: "synthetic", provider: "internal_test", joined_at: "2026-09-10", grants_count: "0", last_seen_at: null, must_change_password: false };
function setup(rows: Record<string, unknown>[] = [row]) {
  const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT i.id") ? [{ id: identityId }]
    : sql.startsWith("SELECT m.workspace_id") ? [{ workspace_id: auth.workspaceId }]
      : sql.startsWith("SELECT m.identity_id") ? rows : [] }));
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release, on: vi.fn(), removeListener: vi.fn() }));
  return { query, release, connect, repository: new AdminMemberProvisioningRepository({ connect } as unknown as Pool) };
}
describe("global member boundary guards", () => {
  it.each([
    [{ code: "57014", message: "SQL and credentials" }, "UPSTREAM_TIMEOUT"],
    [{ code: "55P03", message: "lock owner" }, "UPSTREAM_TIMEOUT"],
    [{ code: "23505", detail: "provider_subject secret" }, "CONFLICT"],
    [new Error("private credentials"), "SOURCE_UNAVAILABLE"],
    [null, "SOURCE_UNAVAILABLE"], ["raw body", "SOURCE_UNAVAILABLE"],
  ] as const)("sanitizes connection/database error to %s %s", async (error, code) => {
    const s = setup(); s.connect.mockRejectedValueOnce(error);
    await expect(s.repository.read(auth)).rejects.toThrow(`Member provisioning: ${code}`);
  });
  it("uses bounded RR read and never selects credential values", async () => {
    const s = setup(); expect((await s.repository.read(auth)).items).toHaveLength(1);
    const statements = s.query.mock.calls.map(c => c[0]);
    expect(statements[0]).toContain("REPEATABLE READ READ ONLY");
    expect(statements.find(sql => sql.startsWith("SELECT m.identity_id"))).toContain("LIMIT 1001");
    expect(statements.join("\n")).not.toMatch(/password_salt|password_scrypt|token_hash|qihang_user_id|secret_ref/);
    expect(statements).toContain("COMMIT"); expect(s.release).toHaveBeenCalledOnce();
  });
  it.each([{ grants_count: "NaN" }, { grants_count: "9007199254740992" }, { joined_at: "2026-02-31" },
    { last_seen_at: "bad" }, { last_seen_at: new Date(NaN) }, { is_active: "false" }, { role: "owner" }])("invalid DB field %j fails closed", async patch => {
    const s = setup([{ ...row, ...patch }]);
    await expect(s.repository.read(auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(s.query.mock.calls.map(c => c[0])).toContain("ROLLBACK");
  });
  it("duplicate personal membership identities fail closed, not arbitrary first-row choice", async () => {
    await expect(setup([row, { ...row, user_id: identityId }]).repository.read(auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("viewer rejected even if a fake DB would return team admin", async () => {
    const s = setup(); await expect(s.repository.read({ ...auth, role: "viewer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s.connect).not.toHaveBeenCalled();
  });
});
