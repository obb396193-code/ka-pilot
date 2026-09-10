import type { Pool } from "pg";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { describe, expect, it, vi } from "vitest";
import { AccountMuteRepository } from "../src/account-mute-repository.js";

const workspaceId = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222";
const workItemId = "33333333-3333-4333-8333-333333333333";
const auth: ApprovedWorkspaceAuthContext = { workspaceId, userId, role: "optimizer", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "synthetic", accessLevel: "read" }] } };
const input = { workItemId, mutedUntil: "2026-09-09", reasonChip: "known" };
function setup() {
  const item = { id: workItemId, workspace_id: workspaceId, media: "KUAISHOU", account_id: "synthetic", status: "open" };
  const mute = { workspace_id: workspaceId, media: "KUAISHOU", account_id: "synthetic", muted_until: input.mutedUntil,
    muted_by: userId, reason_chip: input.reasonChip, created_at: new Date("2026-09-08T00:00:00Z") };
  const query = vi.fn(async (sql: string, _args?: unknown[]) => {
    void _args;
    if (sql.includes("FOR UPDATE")) return { rows: [item] };
    if (sql.includes("FOR SHARE")) return { rows: [{ allowed: true }] };
    if (sql.includes("UPDATE work_items")) return { rows: [{ ...item, status: "ignored" }] };
    if (sql.includes("INSERT INTO account_mutes")) return { rows: [mute] };
    return { rows: [] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { item, mute, query, release, connect, repo: new AccountMuteRepository({ connect } as unknown as Pool) };
}
describe("ignore + account mute atomic boundary", () => {
  it("locks real work-item tuple and authority, then performs both writes in one transaction", async () => {
    const s = setup(); expect(await s.repo.ignoreAndMute(auth, input)).toMatchObject({ workspaceId, mutedUntil: input.mutedUntil });
    const sql = s.query.mock.calls.map(([sql]) => sql);
    expect(sql.filter(sql => sql === "BEGIN")).toHaveLength(1);
    expect(sql.indexOf("COMMIT")).toBeGreaterThan(sql.findIndex(sql => sql.includes("INSERT INTO account_mutes")));
    const update = s.query.mock.calls.find(([sql]) => sql.includes("UPDATE work_items"))!;
    expect(update[0]).not.toContain("muted_until"); expect(update[1]).toContain("known");
    expect(s.release).toHaveBeenCalledOnce();
  });
  it.each(["team", "empty", "user"])("rejects %s before connect", async mode => {
    const s = setup(), forged = structuredClone(auth);
    if (mode === "user") forged.userId = "invalid";
    else if (mode === "empty") forged.scope = { kind: "explicit_accounts", accounts: [] };
    else Object.assign(forged, { workspaceKind: "team", scope: { kind: "team_workspace_readonly" } });
    await expect(s.repo.ignoreAndMute(forged, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s.connect).not.toHaveBeenCalled();
  });
  it.each([{ workItemId: "bad" }, { mutedUntil: "2026-02-31" }, { reasonChip: 2 }, { media: "TENCENT" }])("rejects malformed input %j", async patch => {
    const s = setup(); await expect(s.repo.ignoreAndMute(auth, { ...input, ...patch } as typeof input)).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(s.connect).not.toHaveBeenCalled();
  });
  it.each([{ workspace_id: "other" }, { id: userId }, { media: "TENCENT" }, { account_id: "other" }, { media: null }, { status: "ignored" }])("refuses scope/state %j before either write", async patch => {
    const s = setup(); Object.assign(s.item, patch);
    await expect(s.repo.ignoreAndMute(auth, input)).rejects.toBeInstanceOf(Error);
    expect(s.query.mock.calls.some(([sql]) => sql.startsWith("UPDATE") || sql.includes("INSERT INTO account_mutes"))).toBe(false);
    expect(s.query).toHaveBeenCalledWith("ROLLBACK");
  });
  it("bad mute result rolls back the preceding ignored update", async () => {
    const s = setup(); s.mute.media = "TENCENT";
    await expect(s.repo.ignoreAndMute(auth, input)).rejects.toMatchObject({ code: "INVALID_RESULT" });
    expect(s.query.mock.calls.some(([sql]) => sql.includes("UPDATE work_items"))).toBe(true);
    expect(s.query).toHaveBeenCalledWith("ROLLBACK"); expect(s.query).not.toHaveBeenCalledWith("COMMIT");
  });
  it.each(["missing", "duplicate", "update_empty", "update_wrong_tuple"])("fails closed on row boundary %s", async mode => {
    const s = setup(), original = s.query.getMockImplementation()!;
    s.query.mockImplementation(async (sql, args) => {
      if (sql.includes("FOR UPDATE") && mode === "missing") return { rows: [] };
      if (sql.includes("FOR UPDATE") && mode === "duplicate") return { rows: [s.item, s.item] };
      if (sql.includes("UPDATE work_items") && mode === "update_empty") return { rows: [] };
      if (sql.includes("UPDATE work_items") && mode === "update_wrong_tuple") return { rows: [{ ...s.item, media: "TENCENT", status: "ignored" }] };
      return original(sql, args);
    });
    await expect(s.repo.ignoreAndMute(auth, input)).rejects.toMatchObject({ code: mode === "missing" ? "NOT_FOUND" : "INVALID_RESULT" });
    expect(s.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO account_mutes"))).toBe(false);
    expect(s.query).toHaveBeenCalledWith("ROLLBACK"); expect(s.release).toHaveBeenCalledOnce();
  });
  it("snapshots arguments and authorization before the pool await", async () => {
    const s = setup(), context = structuredClone(auth), args = { ...input };
    const result = s.repo.ignoreAndMute(context, args); context.workspaceId = userId; args.workItemId = userId; args.mutedUntil = "2099-01-01";
    expect(await result).toMatchObject({ workspaceId, mutedUntil: input.mutedUntil });
    expect(s.query.mock.calls.find(([sql]) => sql.includes("FOR UPDATE"))?.[1]).toEqual([
      workspaceId, workItemId, "explicit_accounts", '[{"media":"KUAISHOU","account_id":"synthetic"}]',
    ]);
  });
});
