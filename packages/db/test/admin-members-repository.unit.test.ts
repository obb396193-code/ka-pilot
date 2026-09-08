import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { AdminMembersRepository } from "../src/admin-members-repository.js";
const auth = { workspaceId: "11111111-1111-4111-8111-111111111111", userId: "22222222-2222-4222-8222-222222222222", role: "admin", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
const id = "33333333-3333-4333-8333-333333333333";
const member = { workspace_id: auth.workspaceId, identity_id: id, user_id: auth.userId, role: "admin", is_active: true, display_name: "synthetic", provider: "internal_test", joined_at: "2026-09-08", grants_count: "1", last_seen_at: new Date("2026-09-08T01:00:00Z") };
const grant = { workspace_id: auth.workspaceId, identity_id: id, media: "KUAISHOU", account_id: "same", access_level: "read", granted_at: "2026-09-08" };
function setup(members: unknown[] = [member], grants: unknown[] = [grant], target: unknown[] = [{ workspace_id: auth.workspaceId, identity_id: id }]) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => { void values; return { rows: sql.includes("admin-member-grants") ? grants : sql.includes("admin-members") ? members : sql.startsWith("SELECT workspace_id") ? target : [] }; });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release, on: vi.fn(), removeListener: vi.fn() }));
  return { query, connect, repo: new AdminMembersRepository({ connect } as unknown as Pool) };
}
describe("admin members repository", () => {
  it.each(["optimizer", "operator", "lead"])("denies %s before connection", async role => { const s = setup(); await expect(s.repo.read({ ...auth, role })).rejects.toMatchObject({ code: "FORBIDDEN" }); expect(s.connect).not.toHaveBeenCalled(); });
  it("reads bound workspace in repeatable read, safe public fields only", async () => {
    const s = setup(); expect(await s.repo.read(auth)).toMatchObject({ workspaceId: auth.workspaceId, data: { items: [{ identityId: id, grantsCount: 1 }] } });
    expect(s.query.mock.calls[0]![0]).toContain("REPEATABLE READ READ ONLY");
    const q = s.query.mock.calls.find(c => c[0].includes("admin-members"))!; expect(q[1]).toEqual([auth.workspaceId]); expect(q[0]).toContain("LIMIT 1001"); expect(q[0]).not.toMatch(/provider_subject|token_hash|qihang_user_id|secret_ref/);
  });
  it("team never references grants SQL; empty configuration remains empty", async () => {
    const s = setup([{ ...member, grants_count: "0" }]); const team = { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } };
    expect((await s.repo.read(team)).data.items).toHaveLength(1); expect(await s.repo.read(team, id)).toMatchObject({ data: { identityId: id, items: [] } });
    expect(s.query.mock.calls.some(c => c[0].includes("account_access_grants"))).toBe(false);
    expect((await setup([]).repo.read(auth)).data.items).toEqual([]);
  });
  it("scopes target and grants together, safely handles unknown identity and invalid path", async () => {
    expect(await setup().repo.read(auth, id)).toMatchObject({ data: { identityId: id, items: [{ media: "KUAISHOU", accountId: "same" }] } });
    await expect(setup([], [], []).repo.read(auth, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const s = setup(); await expect(s.repo.read(auth, "bad")).rejects.toMatchObject({ code: "INVALID_REQUEST" }); expect(s.connect).not.toHaveBeenCalled();
  });
  it.each([{ workspace_id: "foreign" }, { grants_count: "NaN" }, { last_seen_at: "not-date" }, { display_name: null }, { role: "bad" }])("rejects invalid member %j", async patch => {
    await expect(setup([{ ...member, ...patch }]).repo.read(auth)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it.each([{ workspace_id: "foreign" }, { identity_id: auth.userId }, { access_level: "owner" }])("rejects invalid grant %j", async patch => {
    await expect(setup([], [{ ...grant, ...patch }]).repo.read(auth, id)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("rejects overflows and target scope mismatch", async () => {
    await expect(setup(Array(1001).fill(member)).repo.read(auth)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    await expect(setup([], Array(1001).fill(grant)).repo.read(auth, id)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
    await expect(setup([], [], [{ workspace_id: "foreign", identity_id: id }]).repo.read(auth, id)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("sanitizes database failures and timeout", async () => {
    for (const [e, code] of [[new Error("SQL secret"), "SOURCE_UNAVAILABLE"], [{ code: "57014" }, "UPSTREAM_TIMEOUT"]] as const) { const s = setup(); s.query.mockImplementation(async () => { throw e; }); await expect(s.repo.read(auth)).rejects.toThrow(`Member request: ${code}`); }
  });
});
