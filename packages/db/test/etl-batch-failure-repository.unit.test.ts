import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { EtlBatchFailureRepository } from "../src/etl-batch-failure-repository.js";
const workspaceId = randomUUID(), jobId = randomUUID(), leaseToken = randomUUID();
const input = { workspaceId, jobId, leaseToken, runId: "9007199254740993", warning: {
  code: "BATCH_FAILED", resource: "ad_realtime", ds: "2026-09-09", accountIds: ["a"], fingerprint: "a".repeat(64),
} };
function fake(patch: Record<string, unknown> = {}) {
  const row = { attempts: 1, job_type: "etl_incr", media: "KUAISHOU", account_ids: ["a"], failed_at: new Date(),
    scope: { workspaceId, execution: { version: "etl-attempt/v1", workspaceId, jobId, jobType: "etl_incr", attempt: 1 },
      batchScope: { workspaceId, media: "KUAISHOU", accountIds: ["a"], dateFrom: "2026-09-09", dateTo: "2026-09-09" } }, ...patch };
  const query = vi.fn(async (sql: string) => ({ rows: sql.includes("SELECT") ? [row] : [], rowCount: 1 }));
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { row, query, release, connect, repo: new EtlBatchFailureRepository({ connect } as unknown as Pool) };
}
describe("batch ledger invalid response and rollback boundaries", () => {
  it("keeps exact int64 identifiers and does not persist caller-injected fields", async () => {
    const f = fake(); expect(await f.repo.record(input)).toEqual({ recorded: true });
    expect(f.query.mock.calls.some(([sql]) => sql.includes("FOR UPDATE OF r,j"))).toBe(true);
    expect(f.release).toHaveBeenCalledWith(false);
  });
  it.each(["0", "01", "9223372036854775808", "9007199254740993\n"])("rejects invalid run ID %s before DB", async runId => {
    const f = fake(); await expect(f.repo.record({ ...input, runId })).rejects.toThrow("ETL batch failure could not be recorded"); expect(f.connect).not.toHaveBeenCalled();
  });
  it.each([{ scope: null }, { failed_at: "invalid" }, { failed_at: new Date(NaN) }, { attempts: "1" }, { account_ids: [] }])("fails closed on invalid repository row %j", async patch => {
    const f = fake(patch); await expect(f.repo.record(input)).rejects.toThrow();
    expect(f.query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
  });
  it("destroys the connection when rollback itself fails and hides both driver errors", async () => {
    const f = fake(); f.query.mockImplementation(async () => { throw new Error("synthetic-private-driver"); });
    await expect(f.repo.record(input)).rejects.toThrow("ETL batch failure could not be recorded"); expect(f.release).toHaveBeenCalledWith(true);
  });
  it("sanitizes connect errors without attempting release on absent connection", async () => {
    const f = fake(); f.connect.mockRejectedValue(new Error("synthetic-private-driver"));
    await expect(f.repo.record(input)).rejects.toThrow("ETL batch failure could not be recorded"); expect(f.release).not.toHaveBeenCalled();
  });
});
