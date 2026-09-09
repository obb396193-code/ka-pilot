import { EventEmitter } from "node:events";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { workerOnceLock } from "../src/scheduling/worker-once-lock.js";

const workspaceId = "00000000-0000-4000-8000-000000000101";
function ports() {
  const client = Object.assign(new EventEmitter(), { query: vi.fn<(text: string, values?: unknown[]) => Promise<unknown>>(async () => ({ rows: [{ acquired: true }] })), release: vi.fn() });
  const pool = { connect: vi.fn(async () => client) }; return { client, pool, typed: pool as unknown as Pool };
}
describe("worker advisory lock ownership", () => {
  it("parameterizes a validated workspace key and releases only once", async () => {
    const p = ports(), control = new AbortController();
    const release = await workerOnceLock(p.typed, workspaceId)(control);
    expect(p.client.query.mock.calls[0]?.[1]).toEqual([`ka-worker-once:${workspaceId}`]);
    expect(p.client.release).not.toHaveBeenCalled(); await release?.(); await release?.();
    expect(p.client.release).toHaveBeenCalledExactlyOnceWith(true); expect(control.signal.aborted).toBe(false); expect(p.client.listenerCount("error")).toBe(0);
  });
  it.each(["error", "end"])("losing the connection via %s aborts the owning round", async (event) => {
    const p = ports(), control = new AbortController(); const release = await workerOnceLock(p.typed, workspaceId)(control);
    p.client.emit(event, new Error("synthetic-private-pg-error")); expect(control.signal.aborted).toBe(true); await release?.();
  });
  it("busy and malformed lock responses never leak a retained connection", async () => {
    for (const rows of [[{ acquired: false }], [], [{ acquired: "true" }]]) {
      const p = ports(); p.client.query.mockResolvedValue({ rows });
      const result = workerOnceLock(p.typed, workspaceId)(new AbortController());
      if (rows[0]?.acquired === false) await expect(result).resolves.toBeNull(); else await expect(result).rejects.toThrow("Worker lock failed");
      expect(p.client.release).toHaveBeenCalledExactlyOnceWith(true);
    }
  });
  it("query/unlock failures release broken clients; invalid keys never connect", async () => {
    const p = ports(); expect(() => workerOnceLock(p.typed, "invalid")).toThrow(); expect(p.pool.connect).not.toHaveBeenCalled();
    p.client.query.mockRejectedValueOnce(new Error("synthetic private"));
    await expect(workerOnceLock(p.typed, workspaceId)(new AbortController())).rejects.toThrow(); expect(p.client.release).toHaveBeenCalledTimes(1);
    const other = ports(); const release = await workerOnceLock(other.typed, workspaceId)(new AbortController());
    other.client.query.mockRejectedValueOnce(new Error("synthetic unlock")); await expect(release?.()).rejects.toThrow(); expect(other.client.release).toHaveBeenCalledExactlyOnceWith(true);
  });
});
