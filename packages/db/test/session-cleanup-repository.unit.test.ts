import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { LostJobLeaseError } from "../src/job-repository.js";
import { SessionCleanupRepository, SessionCleanupError } from "../src/session-cleanup-repository.js";

const lease = { id: "00000000-0000-4000-8000-000000000001", workspaceId: "00000000-0000-4000-8000-000000000002", leaseToken: "00000000-0000-4000-8000-000000000003" };
function setup() {
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("SELECT id FROM jobs")) return { rows: [{ id: lease.id }], rowCount: 1 };
    if (sql.startsWith("WITH authorized")) return { rows: [{ lease_valid: true, deleted_count: 2 }], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  const client = Object.assign(new EventEmitter(), { query, release });
  const pool = { connect: vi.fn(async () => client) };
  return { query, release, client, pool, repository: new SessionCleanupRepository(pool as never) };
}

describe("session retention transaction and boundary", () => {
  it.each(["sync", "async"])("sanitizes %s connection acquisition failure", async (kind) => {
    const s = setup();
    if (kind === "sync") s.pool.connect.mockImplementation(() => { throw new Error("private connection secret"); });
    else s.pool.connect.mockRejectedValue(new Error("private connection secret"));
    await expect(s.repository.cleanupBatch(lease)).rejects.toThrow("Session cleanup failed");
    expect(s.query).not.toHaveBeenCalled();
  });
  it("locks the scoped live lease before bounded session deletion and only returns a count", async () => {
    const s = setup();
    expect(await s.repository.cleanupBatch(lease)).toEqual({ deletedCount: 2 });
    const sql = s.query.mock.calls.map(([statement]) => statement);
    expect(sql[0]).toBe("BEGIN");
    expect(sql.at(-1)).toBe("COMMIT");
    expect(sql.find((statement) => statement.startsWith("SELECT id FROM jobs"))).toContain("FOR UPDATE");
    expect(sql.find((statement) => statement.startsWith("WITH authorized"))).toContain("LIMIT 1000");
    expect(sql.join("\n")).toContain("SKIP LOCKED");
    expect(sql.join("\n")).toContain("CURRENT_TIMESTAMP - interval '720 hours'");
    expect(sql.join("\n")).not.toContain("<= CURRENT_TIMESTAMP");
    expect(s.release).toHaveBeenCalledWith(false);
  });
  it.each([null, {}, { ...lease, workspaceId: "bad" }, { ...lease, cutoff: "2099-01-01" }, { ...lease, leaseToken: null }])(
    "rejects invalid or widened input before connection", async (input) => {
      const s = setup(); await expect(s.repository.cleanupBatch(input)).rejects.toBeInstanceOf(SessionCleanupError);
      expect(s.pool.connect).not.toHaveBeenCalled();
    },
  );
  it("does not delete anything when the first lease lock fails", async () => {
    const s = setup(); s.query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    await expect(s.repository.cleanupBatch(lease)).rejects.toBeInstanceOf(LostJobLeaseError);
    expect(s.query.mock.calls.some(([sql]) => sql.startsWith("WITH authorized"))).toBe(false);
    expect(s.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
  it("rechecks expiration after obtaining the job lock", async () => {
    const s = setup(), original = s.query.getMockImplementation()!;
    s.query.mockImplementation(async (sql) => sql.startsWith("WITH authorized")
      ? { rows: [{ lease_valid: false, deleted_count: 0 }], rowCount: 1 } as never : original(sql));
    await expect(s.repository.cleanupBatch(lease)).rejects.toBeInstanceOf(LostJobLeaseError);
    expect(s.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
  it.each([-1, 1001, "2", Number.NaN])("rejects invalid returned count %s before commit", async (count) => {
    const s = setup(), original = s.query.getMockImplementation()!;
    s.query.mockImplementation(async (sql) => sql.startsWith("WITH authorized")
      ? { rows: [{ lease_valid: true, deleted_count: count }], rowCount: 1 } as never : original(sql));
    await expect(s.repository.cleanupBatch(lease)).rejects.toBeInstanceOf(SessionCleanupError);
    expect(s.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
  it.each(["BEGIN", "SET LOCAL statement_timeout='5s'", "COMMIT"])("sanitizes DB errors at %s", async (failure) => {
    const s = setup(), original = s.query.getMockImplementation()!;
    s.query.mockImplementation(async (sql) => { if (sql === failure) throw new Error("private SQL secret"); return original(sql); });
    await expect(s.repository.cleanupBatch(lease)).rejects.toThrow("Session cleanup failed");
    expect(s.query).toHaveBeenLastCalledWith("ROLLBACK"); expect(s.release).toHaveBeenCalledOnce();
  });
  it("destroys a connection if rollback fails", async () => {
    const s = setup(); s.query.mockRejectedValue(new Error("private SQL secret"));
    await expect(s.repository.cleanupBatch(lease)).rejects.toThrow("Session cleanup failed");
    expect(s.release).toHaveBeenCalledWith(true);
  });
  it("handles a connection error without committing or reusing it", async () => {
    const s = setup(), original = s.query.getMockImplementation()!;
    s.query.mockImplementation(async (sql) => { if (sql.startsWith("WITH authorized")) s.client.emit("error", new Error("private disconnect")); return original(sql); });
    await expect(s.repository.cleanupBatch(lease)).rejects.toThrow("Session cleanup failed");
    expect(s.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
    expect(s.release).toHaveBeenCalledWith(true); expect(s.client.listenerCount("error")).toBe(0);
  });
});
