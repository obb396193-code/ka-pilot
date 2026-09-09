import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { WorkerOnceDiagnosticsRepository } from "../src/worker-once-diagnostics-repository.js";
const workspaceId = "00000000-0000-4000-8000-000000000001";
function fixture() {
  const workspace: Record<string, unknown> = { kind: "personal", is_active: true };
  const actors: Record<string, unknown> = { active: "1", missing_identity: "0", missing_grants: "0" };
  const counts: Record<string, unknown> = { total: "0", due: "0", waiting: "0", blocked_identity: "0", blocked_other: "0", exhausted: "0", leased: "0", expired: "0", done: "0", failed: "0" };
  const query = vi.fn(async (sql: string) => ({ rows: sql.startsWith("SELECT kind") ? [workspace] : sql.includes("FROM users actor") ? [actors] : sql.includes("FROM jobs WHERE") ? [counts] : [] }));
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { workspace, actors, counts, query, release, connect, repository: new WorkerOnceDiagnosticsRepository({ connect } as unknown as Pool) };
}
describe("diagnostic DB fail-closed mapping", () => {
  it("rejects malformed identifiers before a connection", async () => {
    const f = fixture(); await expect(f.repository.read("bad-id", "KUAISHOU")).rejects.toThrow("Invalid diagnostic scope");
    await expect(f.repository.read(workspaceId, "KUAISHOU' OR true")).rejects.toThrow(); expect(f.connect).not.toHaveBeenCalled();
  });
  it.each([123, "-1", "9007199254740992", null])("rejects invalid present count %s", async value => {
    const f = fixture(); f.counts.total = value;
    await expect(f.repository.read(workspaceId, "KUAISHOU")).rejects.toThrow(/^Worker diagnostics database read failed$/);
    expect(f.query).toHaveBeenCalledWith("ROLLBACK"); expect(f.release).toHaveBeenCalledWith(false);
  });
  it("rejects invalid workspace metadata and contradictory counters", async () => {
    const f = fixture(); f.workspace.kind = "private-workspace";
    await expect(f.repository.read(workspaceId, "KUAISHOU")).rejects.toThrow("database read failed");
    f.workspace.kind = "personal"; f.counts.due = "1";
    await expect(f.repository.read(workspaceId, "KUAISHOU")).rejects.toThrow("database read failed");
  });
  it("sanitizes connection and rollback errors", async () => {
    const f = fixture(); f.connect.mockRejectedValueOnce(new Error("private-url"));
    await expect(f.repository.read(workspaceId, "KUAISHOU")).rejects.toThrow(/^Worker diagnostics database read failed$/);
    expect(f.release).not.toHaveBeenCalled(); f.query.mockRejectedValue(new Error("private-url"));
    await expect(f.repository.read(workspaceId, "KUAISHOU")).rejects.toThrow(/^Worker diagnostics database read failed$/);
    expect(f.release).toHaveBeenCalledWith(true);
  });
});
