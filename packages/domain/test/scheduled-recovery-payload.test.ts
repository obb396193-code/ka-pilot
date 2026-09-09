import { describe, expect, it } from "vitest";
import { approvedScheduledSyncPayload, scheduledQihangRecoveryRequestSchema, type ScheduledSyncAuthorizationSnapshot } from "../src/workspace-sync-scheduler.js";
const snapshot: ScheduledSyncAuthorizationSnapshot = {
  workspaceId: "00000000-0000-4000-8000-000000000001", userId: "00000000-0000-4000-8000-000000000002",
  identityId: "00000000-0000-4000-8000-000000000003", role: "optimizer",
  allowedAccounts: [{ media: "KUAISHOU", accountId: "synthetic", accessLevel: "read" }],
};
describe("shared scheduled payload for explicit identity recovery", () => {
  it.each(["etl_full", "etl_incr"] as const)("preserves original business date and exact tuples for %s", jobType => {
    const p = approvedScheduledSyncPayload(snapshot, jobType, "KUAISHOU", "2026-09-08");
    expect(p).toEqual({ workspaceId: snapshot.workspaceId, initiatorUserId: snapshot.userId, media: "KUAISHOU", businessDate: "2026-09-08",
      authorizationSnapshot: snapshot, accountIds: ["synthetic"], ...(jobType === "etl_full" ? { asOfDate: "2026-09-08" } : { ds: "2026-09-08", offlineReconcileDays: 1, focusAccountIds: [], adIds: [] }) });
  });
  it("rejects empty or cross-media scope", () => {
    expect(() => approvedScheduledSyncPayload({ ...snapshot, allowedAccounts: [] }, "etl_full", "KUAISHOU", "2026-09-08")).toThrow();
    expect(() => approvedScheduledSyncPayload(snapshot, "etl_full", "TENCENT", "2026-09-08")).toThrow();
  });
  it("rejects invalid calendar date and undeclared recovery fields", () => {
    expect(() => approvedScheduledSyncPayload(snapshot, "etl_full", "KUAISHOU", "2026-02-31")).toThrow();
    expect(scheduledQihangRecoveryRequestSchema.safeParse({ snapshot, media: "KUAISHOU", force: true }).success).toBe(false);
    expect(scheduledQihangRecoveryRequestSchema.safeParse({ snapshot: { ...snapshot, qihang_user_id: "private" }, media: "KUAISHOU" }).success).toBe(false);
  });
});
