import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  query: vi.fn(), end: vi.fn(), enqueue: vi.fn(), recover: vi.fn(),
  processOnce: vi.fn(), createPool: vi.fn(), scopes: [] as unknown[],
}));
vi.mock("@ka/db", async (original) => ({
  ...await original<typeof import("@ka/db")>(),
  createPool: mock.createPool,
  JobRepository: class {
    constructor(_pool: unknown, scope: unknown) { mock.scopes.push(scope); }
    enqueue = mock.enqueue;
    recoverStaleLeases = mock.recover;
  },
}));
vi.mock("../src/jobs/consumer.js", () => ({ JobConsumer: class { processOnce = mock.processOnce; } }));
import { executeSessionCleanupOnce } from "../src/auth/session-cleanup-once.js";

const config = {
  databaseUrl: "postgres://synthetic:synthetic@127.0.0.1:55432/ka_fixture_test",
  workspaceId: "00000000-0000-4000-8000-000000000002",
  runId: "00000000-0000-4000-8000-000000000003", maxMs: 1000,
};
beforeEach(() => {
  vi.clearAllMocks(); mock.scopes.length = 0;
  mock.createPool.mockReturnValue({ query: mock.query, end: mock.end });
  mock.query.mockImplementation(async (sql: string) => sql.includes("FROM workspaces")
    ? { rowCount: 1, rows: [{ id: config.workspaceId }] }
    : { rowCount: 1, rows: [{ status: "queued" }] });
  mock.end.mockResolvedValue(undefined); mock.enqueue.mockResolvedValue(config.runId);
  mock.recover.mockResolvedValue(0); mock.processOnce.mockResolvedValue(false);
});
describe("session cleanup bounded executor fault contract", () => {
  it("rejects unknown inputs before opening a pool", async () => {
    await expect(executeSessionCleanupOnce({ ...config, cutoff: "2099-01-01" })).rejects.toThrow("Session cleanup failed");
    expect(mock.createPool).not.toHaveBeenCalled();
  });
  it("uses only the configured workspace and maintenance job type; returns pending without available work", async () => {
    expect(await executeSessionCleanupOnce(config)).toBe("pending");
    expect(mock.scopes).toEqual([{ workspaceId: config.workspaceId, jobTypes: ["auth_session_cleanup"] }]);
    expect(mock.enqueue).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: config.workspaceId, jobType: "auth_session_cleanup", payload: {}, credentialOwnerUserId: null }));
    expect(mock.recover).toHaveBeenCalledWith(1); expect(mock.end).toHaveBeenCalledOnce();
  });
  it("does not consume more than ten other pending maintenance jobs", async () => {
    mock.processOnce.mockResolvedValue(true);
    expect(await executeSessionCleanupOnce(config)).toBe("pending");
    expect(mock.processOnce).toHaveBeenCalledTimes(10);
  });
  it("stops once its own job completes", async () => {
    let statusReads = 0;
    mock.query.mockImplementation(async (sql: string) => sql.includes("FROM workspaces")
      ? { rowCount: 1, rows: [] } : { rows: [{ status: ++statusReads === 1 ? "queued" : "done" }] });
    mock.processOnce.mockResolvedValue(true);
    expect(await executeSessionCleanupOnce(config)).toBe("completed");
    expect(mock.processOnce).toHaveBeenCalledOnce();
  });
  it("does not claim another job when the idempotent run already completed", async () => {
    mock.query.mockResolvedValue({ rowCount: 1, rows: [{ status: "done" }] });
    expect(await executeSessionCleanupOnce(config)).toBe("completed");
    expect(mock.recover).not.toHaveBeenCalled(); expect(mock.processOnce).not.toHaveBeenCalled();
  });
  it.each(["failed", "blocked_auth", "invented"])("sanitizes a %s job status", async (status) => {
    mock.query.mockResolvedValue({ rowCount: 1, rows: [{ status }] });
    await expect(executeSessionCleanupOnce(config)).rejects.toThrow("Session cleanup failed");
    expect(mock.processOnce).not.toHaveBeenCalled(); expect(mock.end).toHaveBeenCalledOnce();
  });
  it.each([{ rows: [] }, { rows: [{ status: "done" }, { status: "done" }] }])("refuses missing/duplicate job results", async ({ rows }) => {
    mock.query.mockResolvedValue({ rowCount: 1, rows });
    await expect(executeSessionCleanupOnce(config)).rejects.toThrow("Session cleanup failed");
    expect(mock.end).toHaveBeenCalledOnce();
  });
  it("refuses unknown workspace before enqueue", async () => {
    mock.query.mockResolvedValue({ rowCount: 0, rows: [] });
    await expect(executeSessionCleanupOnce(config)).rejects.toThrow("Session cleanup failed");
    expect(mock.enqueue).not.toHaveBeenCalled(); expect(mock.end).toHaveBeenCalledOnce();
  });
  it.each(["query", "enqueue", "recover", "processOnce", "end"])("sanitizes %s errors and closes the pool", async (method) => {
    mock[method as "query"].mockRejectedValue(new Error("private database URL or token"));
    await expect(executeSessionCleanupOnce(config)).rejects.toThrow("Session cleanup failed");
    expect(mock.end).toHaveBeenCalledOnce();
  });
});
