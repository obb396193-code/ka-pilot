import { describe, expect, it, vi } from "vitest";
import { runWorkerOnceDiagnosis } from "../src/scheduling/worker-once-diagnose.js";
import { formatWorkerOnceFailure } from "../src/scheduling/worker-once-failure.js";
const env = { DATABASE_URL: "postgres://synthetic-private", WORKER_ONCE_WORKSPACE_ID: "00000000-0000-4000-8000-000000000001", WORKER_ONCE_MEDIA: "KUAISHOU", QIHANG_BASE_URL: "https://synthetic.invalid/get_data" };
const snapshot = { workspace: { exists: true, active: true, kind: "personal" },
  actors: { activeLinked: 1, missingQihangIdentity: 1, missingGrants: 0 },
  queue: { total: 1, queuedDue: 0, queuedWaiting: 0, blockedIdentity: 1, blockedOther: 0, exhausted: 0, leasedActive: 0, leaseExpired: 0, done: 0, failed: 0, unclassified: 0 } };
function fixture() {
  const read = vi.fn().mockResolvedValue(snapshot), close = vi.fn(), write = vi.fn();
  return { env, args: [], read, close, write, open: vi.fn(() => ({ read, close })) };
}
describe("read-only once diagnostic boundary", () => {
  it("reports presence only, not qihang connectivity or ETL success", async () => {
    const f = fixture(); await runWorkerOnceDiagnosis(f);
    const result = JSON.parse(f.write.mock.calls[0]![0]);
    expect(result).toMatchObject({ ...snapshot, diagnosticOnly: true, readOnly: true, checks: { qihangNetwork: "not_checked", upstreamData: "not_checked", credentials: "presence_only" } });
    expect(JSON.stringify(result)).not.toContain("synthetic-private"); expect(f.close).toHaveBeenCalledTimes(1);
  });
  it("rejects browser-like scope arguments before opening DB", async () => {
    const f = fixture(); await expect(runWorkerOnceDiagnosis({ ...f, args: ["--workspace", "private"] })).rejects.toMatchObject({ code: "INVALID_CONFIG" });
    expect(f.open).not.toHaveBeenCalled();
  });
  it("rejects leaking or invalid repository output", async () => {
    const f = fixture(); f.read.mockResolvedValue({ ...snapshot, qihang_user_id: "synthetic-private" });
    const error = await runWorkerOnceDiagnosis(f).catch(error => error);
    expect(formatWorkerOnceFailure(error)).toBe("Worker once failed [DIAGNOSTIC_FAILED]\n");
    expect(f.write).not.toHaveBeenCalled(); expect(f.close).toHaveBeenCalledTimes(1);
  });
  it("suppresses private driver errors and still closes", async () => {
    const f = fixture(); f.read.mockRejectedValue(new Error(env.DATABASE_URL));
    await expect(runWorkerOnceDiagnosis(f)).rejects.toMatchObject({ code: "DIAGNOSTIC_FAILED" });
    expect(f.close).toHaveBeenCalledTimes(1); expect(f.write).not.toHaveBeenCalled();
  });
  it("rejects contradictory counts rather than presenting invented health", async () => {
    const f = fixture(); f.read.mockResolvedValue({ ...snapshot, queue: { ...snapshot.queue, total: 0 } });
    await expect(runWorkerOnceDiagnosis(f)).rejects.toMatchObject({ code: "DIAGNOSTIC_FAILED" }); expect(f.write).not.toHaveBeenCalled();
  });
});
