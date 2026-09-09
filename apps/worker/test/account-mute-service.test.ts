import { AccountMuteRepositoryError, type AccountMuteRepository } from "@ka/db";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { describe, expect, it, vi } from "vitest";
import { AccountMuteService } from "../src/work-items/account-mute-service.js";

const workspaceId = "11111111-1111-4111-8111-111111111111", userId = "22222222-2222-4222-8222-222222222222", id = "33333333-3333-4333-8333-333333333333";
const target = { media: "KUAISHOU", accountId: "synthetic" };
const auth: ApprovedWorkspaceAuthContext = { workspaceId, userId, role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [{ ...target, accessLevel: "read" }] } };
function setup() {
  const row = { workspaceId, ...target, mutedUntil: "2026-09-09", reasonChip: "known", mutedBy: userId, createdAt: null };
  const store = { set: vi.fn(async () => row), ignoreAndMute: vi.fn(async () => row) };
  const service = new AccountMuteService(store, () => new Date("2026-09-08T03:00:00+08:00"));
  return { row, store, service };
}
describe("P096 trusted account mute commands", () => {
  it("maps server-clock expiry and calls only the standalone store mutation", async () => {
    const s = setup();
    expect(await s.service.mute(auth, target, { days: 1, reason_chip: "known" })).toEqual({ mutedUntil: "2026-09-09T03:00:00+08:00", scope: "notifications_and_p1p2" });
    expect(s.store.set).toHaveBeenCalledWith(auth, { ...target, mutedUntil: "2026-09-09", reasonChip: "known" });
    expect(s.store.ignoreAndMute).not.toHaveBeenCalled();
  });
  it("ignore+mute uses the atomic command, not separate transition/set commits", async () => {
    const s = setup(); s.row.reasonChip = null as unknown as string;
    expect(await s.service.ignoreAndMute(auth, id, { mute_days: 1 })).toMatchObject({ mutedUntil: "2026-09-09T03:00:00+08:00" });
    expect(s.store.ignoreAndMute).toHaveBeenCalledWith(auth, { workItemId: id, mutedUntil: "2026-09-09", reasonChip: null });
    expect(s.store.set).not.toHaveBeenCalled();
  });
  it.each([null, { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }, { ...auth, scope: { kind: "explicit_accounts", accounts: [] } }])("rejects context %j before mutations", async context => {
    const s = setup();
    await expect(s.service.mute(context, target, { days: 1, reason_chip: "known" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(s.service.ignoreAndMute(context, id, { mute_days: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(s.store.set).not.toHaveBeenCalled(); expect(s.store.ignoreAndMute).not.toHaveBeenCalled();
  });
  it("rejects same-ID other-media and all self-reported scope/expiry input", async () => {
    const s = setup();
    await expect(s.service.mute(auth, { ...target, media: "TENCENT" }, { days: 1, reason_chip: "known" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(s.service.mute(auth, target, { days: 1, reason_chip: "known", workspaceId })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(s.service.ignoreAndMute(auth, id, { mute_days: 1, mutedUntil: "2099-01-01" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(s.service.ignoreAndMute(auth, "bad", { mute_days: 1 })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(s.store.set).not.toHaveBeenCalled(); expect(s.store.ignoreAndMute).not.toHaveBeenCalled();
  });
  it.each(["FORBIDDEN", "INVALID_INPUT", "INVALID_RESULT", "NOT_FOUND", "INVALID_STATE"] as const)("maps controlled store error %s", async code => {
    const s = setup(); s.store.ignoreAndMute.mockRejectedValueOnce(new AccountMuteRepositoryError(code));
    const expected = code === "INVALID_INPUT" ? "INVALID_REQUEST" : code === "INVALID_RESULT" ? "UPSTREAM_INVALID_RESPONSE" : code;
    await expect(s.service.ignoreAndMute(auth, id, { mute_days: 1 })).rejects.toMatchObject({ code: expected });
  });
  it("sanitizes raw database failure without exposing SQL/details", async () => {
    const s = setup(); s.store.set.mockRejectedValueOnce(new Error("synthetic SQL password trace"));
    await expect(s.service.mute(auth, target, { days: 1, reason_chip: "known" })).rejects.toMatchObject({ code: "INTERNAL_ERROR", message: "Account mute INTERNAL_ERROR" });
  });
  it("invalid server clock cannot reach storage", async () => {
    const s = setup(), service = new AccountMuteService(s.store, () => new Date("bad"));
    await expect(service.mute(auth, target, { days: 1, reason_chip: "known" })).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    await expect(service.ignoreAndMute(auth, id, { mute_days: 1 })).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expect(s.store.set).not.toHaveBeenCalled(); expect(s.store.ignoreAndMute).not.toHaveBeenCalled();
  });
  it.each([{ workspaceId: id }, { media: "TENCENT" }, { accountId: "foreign" }, { mutedBy: id }, { mutedUntil: "2099-01-01" }, { reasonChip: "changed" }, { createdAt: "bad" }])("guards invalid store output %j", async patch => {
    const s = setup(); Object.assign(s.row, patch);
    await expect(s.service.mute(auth, target, { days: 1, reason_chip: "known" })).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("store cannot mutate the private authorization guard or caller state", async () => {
    const s = setup(), context = structuredClone(auth);
    const store: Pick<AccountMuteRepository, "set" | "ignoreAndMute"> = { ignoreAndMute: s.store.ignoreAndMute,
      async set(passed) { passed.workspaceId = id; return { ...s.row, workspaceId: id }; } };
    const service = new AccountMuteService(store, () => new Date("2026-09-08T03:00:00+08:00"));
    await expect(service.mute(context, target, { days: 1, reason_chip: "known" })).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(context).toEqual(auth);
  });
});
