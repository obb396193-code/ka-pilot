import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import type { ItemExecutionResult } from "@ka/domain";
import { ChangeSetRepository } from "../src/changeset-repository.js";

// Synthetic SQL port only: transaction commands and mapping, not real PG locking/rollback.
const ws = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002", actor = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-09-06T00:00:00Z");
const base = { workspaceId: ws, changeSetId: id, finishedAt: now, executionRunId: "synthetic-run", resultPayload: { synthetic: true } };

function setup(options: { status?: string; missing?: boolean; wrongScope?: boolean; runMissing?: boolean; rollbackFails?: boolean } = {}) {
  const header = { id, workspace_id: ws, media: "KUAISHOU", account_id: "synthetic", status: options.status ?? "executing",
    initiator: actor, credential_owner_user_id: actor, ttl_expire_at: new Date("2026-09-07T00:00:00Z"), executed_at: null as Date | null };
  const items = [1, 2].map((n) => ({ id: n, workspace_id: options.wrongScope ? "other-workspace" : ws,
    media: "KUAISHOU", account_id: "synthetic", target_type: "unit", target_id: `synthetic-${n}`, field: "bid",
    from_value: { type: "number", value: 1 }, to_value: { type: "number", value: 2 }, item_status: "pending", fail_reason: null as string | null }));
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql === "ROLLBACK" && options.rollbackFails) throw new Error("synthetic rollback failure");
    if (sql.includes("FROM workspaces") || sql.includes("FROM users")) return { rows: [{ id: actor }], rowCount: 1 };
    if (sql.includes("FROM changeset_items")) return { rows: items, rowCount: items.length };
    if (sql.includes("UPDATE changeset_items")) {
      const item = items.find((entry) => entry.id === params[1])!;
      item.item_status = params[2] as string;
      item.fail_reason = params[3] as string | null;
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("SELECT COALESCE(MAX(attempt)")) return { rows: [{ attempt: 2 }], rowCount: 1 };
    if (sql.includes("r.dry_run=false")) return { rows: [{ id: "actual-run", status: "unknown", started_at: now }], rowCount: 1 };
    if (sql.includes("FROM execution_runs")) return { rows: [{ id: base.executionRunId, status: "running", request_payload: { source_run_id: "actual-run", lease_until: new Date(now.getTime() + 60000).toISOString() } }], rowCount: 1 };
    if (sql.includes("FROM work_items")) return { rows: [{ id: "manual" }], rowCount: 1 };
    if (sql.includes("UPDATE execution_runs")) return { rows: [], rowCount: options.runMissing ? 0 : 1 };
    if (sql.includes("INSERT INTO execution_runs")) return { rows: [{ id: "synthetic-reconcile" }], rowCount: 1 };
    if (sql.includes("UPDATE changesets")) { header.status = params[2] as string; header.executed_at = params[3] as Date; }
    if (sql.includes("changesets")) return { rows: options.missing ? [] : [header], rowCount: options.missing ? 0 : 1 };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn();
  return { repository: new ChangeSetRepository({ query, connect: async () => ({ query, release }) } as unknown as Pool), query, release, items };
}

const outcomes: Array<{ status: string; results: ItemExecutionResult[] }> = [
  { status: "success", results: [{ itemId: 1, status: "success" }, { itemId: 2, status: "success" }] },
  { status: "partial", results: [{ itemId: 1, status: "success" }, { itemId: 2, status: "failed", failReason: "synthetic" }] },
  { status: "failed", results: [{ itemId: 1, status: "failed" }, { itemId: 2, status: "failed" }] },
  { status: "unknown", results: [{ itemId: 1, status: "unknown" }, { itemId: 2, status: "unknown" }] },
];

describe("changeset completion/reconciliation existing kernel", () => {
  it.each(["unknown", "success"])("checks authorization under the parent lock before read-back: %s", async (status) => {
    const context = setup({ status });
    await expect(context.repository.beginReconciliation({ workspaceId: ws, changeSetId: id, now, leaseMs: 60000 })).resolves.toEqual({ directive: status === "unknown" ? "waiting" : "not_needed" });
    expect(context.query.mock.calls.some(([sql]) => sql.includes("FROM changesets") && sql.includes("FOR UPDATE"))).toBe(true);
    expect(context.query.mock.calls.at(-1)![0]).toBe("COMMIT");
  });
  it("rolls back read-back claims with invalid child scope", async () => {
    const context = setup({ status: "unknown", wrongScope: true });
    await expect(context.repository.beginReconciliation({ workspaceId: ws, changeSetId: id, now, leaseMs: 60000 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(context.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
  });
  it.each(outcomes)("persists actual completion $status with full item coverage", async ({ status, results }) => {
    const context = setup();
    await expect(context.repository.completeExecution({ ...base, items: results })).resolves.toMatchObject({ status, executedAt: now });
    expect(context.query.mock.calls.filter(([sql]) => sql.includes("UPDATE changeset_items"))).toHaveLength(status === "unknown" ? 0 : 2);
    const run = context.query.mock.calls.find(([sql]) => sql.includes("UPDATE execution_runs"))!;
    expect(run[0]).toContain("dry_run=false AND status='running'");
    expect(run[1]).toEqual([base.executionRunId, id, status, JSON.stringify(base.resultPayload), now]);
    expect(context.query.mock.calls.at(-1)![0]).toBe("COMMIT");
    expect(context.release).toHaveBeenCalledOnce();
  });
  for (const from of ["unknown", "executing"]) {
    it.each(outcomes)(`maps ${from} read-back to $status without a media call`, async ({ status, results }) => {
      const context = setup({ status: from });
      await expect(context.repository.completeReconciliation({ ...base, items: results })).resolves.toMatchObject({ status });
      const audit = context.query.mock.calls.find(([sql]) => sql.includes("UPDATE execution_runs"))!;
      expect(audit[0]).toContain("dry_run=true");
      expect(audit[1]).toEqual([base.executionRunId, id, status, JSON.stringify(base.resultPayload), now]);
      expect(context.query.mock.calls.at(-1)![0]).toBe("COMMIT");
    });
  }
  it("rejects invalid starting states and preserves the original error if rollback fails", async () => {
    const context = setup({ status: "success", rollbackFails: true });
    await expect(context.repository.completeExecution({ ...base, items: outcomes[0]!.results })).rejects.toThrow("not executing");
    await expect(context.repository.completeReconciliation({ ...base, items: outcomes[0]!.results })).rejects.toThrow("does not require reconciliation");
    expect(context.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  });
  it("rejects missing/duplicate results and scope mismatch before any result write", async () => {
    for (const results of [[], [outcomes[0]!.results[0]!, outcomes[0]!.results[0]!]]) {
      const context = setup();
      await expect(context.repository.completeExecution({ ...base, items: results })).rejects.toThrow("exactly once");
      expect(context.query.mock.calls.some(([sql]) => sql.trimStart().startsWith("UPDATE "))).toBe(false);
    }
    await expect(setup({ wrongScope: true }).repository.completeReconciliation({ ...base, items: outcomes[0]!.results })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("rolls back rather than commit when no running actual execution was updated", async () => {
    const context = setup({ runMissing: true });
    await expect(context.repository.completeExecution({ ...base, items: outcomes[0]!.results })).rejects.toThrow("execution run");
    expect(context.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
    expect(context.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
  });
  it("keeps load and authorization wrappers workspace bound", async () => {
    const context = setup();
    await expect(context.repository.load(ws, id)).resolves.toMatchObject({ workspaceId: ws, id });
    await context.repository.assertExecutionAuthorized(ws, id);
    expect(context.query.mock.calls.filter(([sql]) => sql.includes("FROM changesets")).every(([, params]) => JSON.stringify(params) === JSON.stringify([ws, id]))).toBe(true);
    await expect(setup({ missing: true }).repository.get(ws, id)).rejects.toThrow("not found");
    const wrong = setup({ wrongScope: true });
    await expect(wrong.repository.assertExecutionAuthorized(ws, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(wrong.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
  });
});
