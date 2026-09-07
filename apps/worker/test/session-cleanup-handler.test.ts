import { describe, expect, it, vi } from "vitest";
import { LostJobLeaseError, type JobRecord } from "@ka/db";
import { createSessionCleanupHandler } from "../src/auth/session-cleanup-handler.js";

const job = { id: "00000000-0000-4000-8000-000000000001", workspaceId: "00000000-0000-4000-8000-000000000002", leaseToken: "00000000-0000-4000-8000-000000000003", jobType: "auth_session_cleanup", payload: {}, credentialOwnerUserId: null } as JobRecord;
describe("server-only session cleanup handler", () => {
  it("uses only the leased job tuple, no payload authority or media credentials", async () => {
    const cleanupBatch = vi.fn(async () => ({ deletedCount: 1 }));
    await createSessionCleanupHandler({ cleanupBatch })(job);
    expect(cleanupBatch).toHaveBeenCalledExactlyOnceWith({ id: job.id, workspaceId: job.workspaceId, leaseToken: job.leaseToken });
  });
  it.each([{ payload: { cutoff: "2099-01-01" } }, { payload: { workspaceId: job.workspaceId } }, { jobType: "etl_full" }, { credentialOwnerUserId: job.id }, { workspaceId: null }, { leaseToken: null }])("rejects widened metadata before the repository", async (override) => {
    const cleanupBatch = vi.fn();
    await expect(createSessionCleanupHandler({ cleanupBatch })({ ...job, ...override })).rejects.toThrow("Session cleanup failed");
    expect(cleanupBatch).not.toHaveBeenCalled();
  });
  it("preserves lease loss but sanitizes arbitrary repository errors", async () => {
    const cleanupBatch = vi.fn().mockRejectedValueOnce(new Error("private SQL credential"));
    const handler = createSessionCleanupHandler({ cleanupBatch });
    await expect(handler(job)).rejects.toThrow("Session cleanup failed");
    const stale = new LostJobLeaseError(job.id); cleanupBatch.mockRejectedValueOnce(stale);
    await expect(handler(job)).rejects.toBe(stale);
  });
});
