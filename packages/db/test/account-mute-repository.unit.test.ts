import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { AccountMuteRepository } from "../src/account-mute-repository.js";

const workspaceId = "00000000-0000-4000-8000-000000000091";
const userId = "00000000-0000-4000-8000-000000000092";
const auth: ApprovedWorkspaceAuthContext = { workspaceId, userId, role: "optimizer", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "account-1", accessLevel: "read" }] } };
const target = { media: "KUAISHOU", accountId: "account-1" };
const input = { ...target, mutedUntil: "2026-09-09", reasonChip: "已知波动" };
function setup() {
  const row = { workspace_id: workspaceId, media: target.media, account_id: target.accountId,
    muted_until: input.mutedUntil, muted_by: userId, reason_chip: input.reasonChip,
    created_at: new Date("2026-09-06T00:00:00Z") };
  const query = vi.fn(async (sql: string, _values?: unknown[]) => {
    void _values;
    if (sql.includes("FOR SHARE")) return { rows: [{ allowed: true }] };
    if (sql.includes("account_mutes")) return { rows: [row] };
    return { rows: [] };
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return { repo: new AccountMuteRepository({ connect } as unknown as Pool), query, connect, release, row };
}

describe("account mute trusted storage boundary", () => {
  it.each([
    { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } },
    { ...auth, scope: { kind: "explicit_accounts", accounts: [] } },
    { ...auth, scope: { kind: "explicit_accounts", accounts: [{ ...target, media: "TENCENT", accessLevel: "read" }] } },
    { ...auth, userId: "invalid" },
  ])("rejects disallowed context before connecting", async (context) => {
    const { repo, connect } = setup();
    await expect(repo.set(context as ApprovedWorkspaceAuthContext, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(connect).not.toHaveBeenCalled();
  });
  it.each(["2026-02-30", "2026-13-01", "2026-1-01", "", null, 7])("rejects invalid explicit date %j", async (date) => {
    const { repo, connect } = setup();
    await expect(repo.set(auth, { ...input, mutedUntil: date as string })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(connect).not.toHaveBeenCalled();
  });
  it.each([{ ...input, reasonChip: 7 }, { ...input, reasonChip: "x".repeat(4097) },
    { ...input, workspaceId }, { ...input, mutedBy: userId }, { ...input, media: "' OR 1=1" }])(
    "rejects malformed or self-reported routing input", async (value) => {
      const { repo, connect } = setup();
      await expect(repo.set(auth, value as typeof input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
      expect(connect).not.toHaveBeenCalled();
    });
  it("locks current authority and parameterizes one three-key upsert", async () => {
    const { repo, query, release } = setup();
    expect(await repo.set(auth, input)).toMatchObject({ workspaceId, ...input, mutedBy: userId });
    const lock = query.mock.calls.find(([sql]) => sql.includes("FOR SHARE"))!;
    expect(lock[0]).toContain("workspace.kind = 'personal'");
    for (const table of ["account_access_grants", "workspace_memberships", "auth_identities", "users"]) expect(lock[0]).toContain(table);
    expect(lock[1]).toEqual([workspaceId, userId, target.media, target.accountId, "optimizer"]);
    const write = query.mock.calls.find(([sql]) => sql.includes("INSERT INTO account_mutes"))!;
    expect(write[0]).toContain("ON CONFLICT (workspace_id, media, account_id)");
    expect(write[0]).not.toContain(input.reasonChip);
    expect(write[1]).toEqual([workspaceId, target.media, target.accountId, input.mutedUntil, userId, input.reasonChip]);
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });
  it.each([{ rows: [] }, { rows: [{ allowed: true }, { allowed: true }] }])("rejects absent/ambiguous live authority before mutation", async ({ rows }) => {
    const { repo, query } = setup();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows } as never);
    await expect(repo.set(auth, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT INTO account_mutes"))).toBe(false);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
  });
  it.each([{ workspace_id: "00000000-0000-4000-8000-000000000099" }, { media: "TENCENT" },
    { muted_until: "2026-02-30" }, { reason_chip: 3 }, { created_at: new Date(NaN) }, { muted_by: "invalid" }])(
    "rejects invalid DB output before commit", async (change) => {
      const { repo, row, query } = setup(); Object.assign(row, change);
      await expect(repo.set(auth, input)).rejects.toMatchObject({ code: "INVALID_RESULT" });
      expect(query).not.toHaveBeenCalledWith("COMMIT"); expect(query).toHaveBeenCalledWith("ROLLBACK");
    });
  it("rejects empty or mismatching upsert result rather than claiming success", async () => {
    const { repo, query } = setup();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ allowed: true }] } as never)
      .mockResolvedValueOnce({ rows: [] });
    await expect(repo.set(auth, input)).rejects.toMatchObject({ code: "INVALID_RESULT" });
  });
  it.each([{ muted_until: "2026-09-10" }, { muted_by: workspaceId }, { reason_chip: "unexpected" }])(
    "rolls back an otherwise valid row that does not prove this write", async (change) => {
      const { repo, row, query } = setup(); Object.assign(row, change);
      await expect(repo.set(auth, input)).rejects.toMatchObject({ code: "INVALID_RESULT" });
      expect(query).toHaveBeenCalledWith("ROLLBACK"); expect(query).not.toHaveBeenCalledWith("COMMIT");
    });
  it("snapshots scope and arguments before waiting for the pool", async () => {
    const { repo, connect, query } = setup();
    const context = structuredClone(auth), requested = { ...input };
    const promise = repo.set(context, requested);
    context.workspaceId = "00000000-0000-4000-8000-000000000099";
    requested.media = "TENCENT"; requested.mutedUntil = "2026-09-10";
    expect(await promise).toMatchObject({ workspaceId, ...input });
    expect(connect).toHaveBeenCalledOnce();
    expect(query.mock.calls.find(([sql]) => sql.includes("INSERT INTO account_mutes"))?.[1]?.slice(0, 4))
      .toEqual([workspaceId, input.media, input.accountId, input.mutedUntil]);
  });
  it("allows explicit leap date and null reason without imposing a day conversion policy", async () => {
    const { repo, row } = setup(); Object.assign(row, { muted_until: "2028-02-29", reason_chip: null });
    expect(await repo.set(auth, { ...input, mutedUntil: "2028-02-29", reasonChip: null })).toMatchObject({ mutedUntil: "2028-02-29", reasonChip: null });
  });
  it("reads only the authorized tuple and keeps historical date unchanged", async () => {
    const { repo, query } = setup();
    expect(await repo.find(auth, target)).toMatchObject({ workspaceId, ...target, mutedUntil: input.mutedUntil });
    expect(query.mock.calls.find(([sql]) => sql.includes("FROM account_mutes"))?.[1]).toEqual([workspaceId, target.media, target.accountId]);
    expect(query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
  });
  it("returns null for genuinely missing mute after authorization", async () => {
    const { repo, query } = setup();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ allowed: true }] } as never).mockResolvedValueOnce({ rows: [] });
    expect(await repo.find(auth, target)).toBeNull(); expect(query).toHaveBeenCalledWith("COMMIT");
  });
  it("preserves transaction failures even when rollback fails, and releases", async () => {
    const { repo, query, release } = setup(); const failure = new Error("db failure");
    query.mockRejectedValueOnce(failure).mockRejectedValueOnce(new Error("rollback"));
    await expect(repo.set(auth, input)).rejects.toBe(failure); expect(release).toHaveBeenCalledOnce();
  });
});
