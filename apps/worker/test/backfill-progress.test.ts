import { describe, expect, it, vi } from "vitest";
import { refreshBackfillJobProgress } from "../src/backfill/progress.js";

describe("backfill terminal callbacks", () => {
  it("refreshes all three stages and coordinator from their persisted terminal event", async () => {
    const batches = { refreshProgress: vi.fn() };
    for (const jobType of ["backfill_historical", "backfill_day", "canonical_merge", "data_quality_check"]) {
      await refreshBackfillJobProgress(batches, { jobType, workspaceId: "ws", payload: { backfillId: 7 } });
    }
    expect(batches.refreshProgress).toHaveBeenCalledTimes(4);
    expect(batches.refreshProgress).toHaveBeenLastCalledWith("ws", 7);
  });
  it("ignores ordinary jobs and malformed batch references", async () => {
    const batches = { refreshProgress: vi.fn() };
    for (const id of [undefined, -1, 0, "7", 1.5, NaN]) {
      await refreshBackfillJobProgress(batches, { jobType: "canonical_merge", workspaceId: "ws", payload: { backfillId: id } });
    }
    await refreshBackfillJobProgress(batches, { jobType: "etl_full", workspaceId: "ws", payload: { backfillId: 7 } });
    expect(batches.refreshProgress).not.toHaveBeenCalled();
  });
});
