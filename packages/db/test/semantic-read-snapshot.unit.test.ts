import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { withSemanticReadSnapshot } from "../src/semantic-read-snapshot.js";

function setup(failOn?: string) {
  const query = vi.fn(async (sql: string) => {
    if (sql === failOn) throw new Error("synthetic DB failure");
    return { rows: [] };
  });
  const release = vi.fn();
  const client = Object.assign(new EventEmitter(), { query, release });
  return { query, release, client, pool: { connect: vi.fn(async () => client) } };
}
describe("semantic read snapshot lifecycle", () => {
  it("connection loss is handled, never committed, and the broken client is destroyed", async () => {
    const s = setup();
    await expect(withSemanticReadSnapshot(s.pool as never, async () => {
      s.client.emit("error", new Error("synthetic disconnect"));
      return 1;
    })).rejects.toThrow("Semantic read connection was lost");
    expect(s.query).not.toHaveBeenCalledWith("COMMIT");
    expect(s.release).toHaveBeenCalledWith(true);
    expect(s.client.listenerCount("error")).toBe(0);
  });
  it("one checked-out connection owns RR/RO, bounded SQL and commit", async () => {
    const s = setup();
    expect(await withSemanticReadSnapshot(s.pool as never, async (connection) => {
      await connection.query("SELECT 1"); return 7;
    })).toBe(7);
    expect(s.pool.connect).toHaveBeenCalledTimes(1);
    expect(s.query.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SET LOCAL statement_timeout='15s'",
      "SET LOCAL lock_timeout='5s'", "SET LOCAL idle_in_transaction_session_timeout='15s'", "SELECT 1", "COMMIT",
    ]);
    expect(s.release).toHaveBeenCalledWith(false);
  });
  it("callback error rolls back and preserves the original error", async () => {
    const s = setup(), error = new Error("synthetic operation failed");
    await expect(withSemanticReadSnapshot(s.pool as never, async () => { throw error; })).rejects.toBe(error);
    expect(s.query).toHaveBeenLastCalledWith("ROLLBACK"); expect(s.release).toHaveBeenCalledWith(false);
  });
  it("rollback failure destroys the connection instead of reusing an open transaction", async () => {
    const s = setup("ROLLBACK"), error = new Error("original failure");
    await expect(withSemanticReadSnapshot(s.pool as never, async () => { throw error; })).rejects.toBe(error);
    expect(s.release).toHaveBeenCalledWith(true);
  });
  it.each(["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SET LOCAL statement_timeout='15s'", "COMMIT"])("releases after failure at %s", async (sql) => {
    const s = setup(sql);
    await expect(withSemanticReadSnapshot(s.pool as never, async () => 1)).rejects.toThrow("synthetic DB failure");
    expect(s.release).toHaveBeenCalledTimes(1); expect(s.query).toHaveBeenLastCalledWith("ROLLBACK");
  });
});
