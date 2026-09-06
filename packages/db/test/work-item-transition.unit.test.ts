import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { WorkItemRepository } from "../src/work-item-repository.js";

const workspaceId = "00000000-0000-4000-8000-000000000081";
const workItemId = "00000000-0000-4000-8000-000000000082";
const base = { workspaceId, workItemId, action: "reject" as const };
function setup(status = "processing", updateReturnsRow = true) {
  const row = { id: workItemId, workspace_id: workspaceId, status, reject_reason: null,
    type: "diagnosis", media: "KUAISHOU", account_id: "account-1", task_id: null,
    rule_id: "11", severity: "P1", title: "合成诊断", evidence_snapshot: {}, diagnosis: null,
    ignore_reason: null, muted_until: null, assignee: null, creator: null,
    acceptance_criteria: null, sla_due: null, t1_result: null,
    created_at: new Date("2026-09-06T00:00:00Z"), resolved_at: null };
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("FOR UPDATE")) return { rows: [row] };
    if (sql.includes("UPDATE work_items")) return { rows: updateReturnsRow ? [{ ...row, status: params?.[2], reject_reason: params?.[5] }] : [] };
    return { rows: [] };
  });
  const release = vi.fn();
  const connect = vi.fn(async () => ({ query, release }));
  return { repo: new WorkItemRepository({ connect, query } as unknown as Pool), query, connect, release, row };
}

describe("work item rejection transaction boundary", () => {
  it.each([undefined, null, "", " \n\t ", 7, false, {}])("rejects invalid reason %j before a DB connection", async (reason) => {
    const { repo, connect } = setup();
    await expect(repo.transition({ ...base, rejectReason: reason as string })).rejects.toThrow(/reason/i);
    expect(connect).not.toHaveBeenCalled();
  });
  it.each(["open", "escalated", "done", "ignored", "expired", "external_handled", "rejected"])(
    "locks and rolls back %s without mutation", async (status) => {
      const { repo, query, release } = setup(status);
      await expect(repo.transition({ ...base, rejectReason: "证据不足" })).rejects.toThrow(/transition/);
      expect(query.mock.calls.some(([sql]) => sql.includes("FOR UPDATE"))).toBe(true);
      expect(query.mock.calls.some(([sql]) => sql.includes("UPDATE work_items"))).toBe(false);
      expect(query).toHaveBeenCalledWith("ROLLBACK");
      expect(query).not.toHaveBeenCalledWith("COMMIT");
      expect(release).toHaveBeenCalledOnce();
    },
  );
  it("persists the exact valid reason with a tuple-scoped conditional update", async () => {
    const { repo, query, release } = setup();
    const reason = "已核对：不采纳这条建议";
    expect(await repo.transition({ ...base, rejectReason: reason })).toMatchObject({ status: "rejected", rejectReason: reason });
    const update = query.mock.calls.find(([sql]) => sql.includes("UPDATE work_items"))!;
    expect(update[0]).toContain("workspace_id = $1 AND id = $2 AND status = $8");
    expect(update[1]).toEqual([workspaceId, workItemId, "rejected", null, null, reason, true, "processing"]);
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(query).not.toHaveBeenCalledWith("ROLLBACK");
    expect(release).toHaveBeenCalledOnce();
  });
  it("rolls back before commit when UPDATE returns no row", async () => {
    const { repo, query, release } = setup("processing", false);
    await expect(repo.transition({ ...base, rejectReason: "证据不足" })).rejects.toThrow(/concurrently/);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });
  it("does not require a reject reason for a different valid action", async () => {
    const { repo } = setup("open");
    expect(await repo.transition({ workspaceId, workItemId, action: "start_processing" })).toMatchObject({ status: "processing" });
  });
  it("rolls back a missing locked row without updating", async () => {
    const { repo, query, release } = setup();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await expect(repo.transition({ ...base, rejectReason: "证据不足" })).rejects.toThrow(/not found/);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });
  it("preserves the original failure even when rollback itself fails", async () => {
    const { repo, query, release } = setup();
    const failure = new Error("transaction unavailable");
    query.mockRejectedValueOnce(failure).mockRejectedValueOnce(new Error("rollback unavailable"));
    await expect(repo.transition({ ...base, rejectReason: "证据不足" })).rejects.toBe(failure);
    expect(release).toHaveBeenCalledOnce();
  });
});

// Existing create/find paths share record mapping and transaction helpers with
// transition. These tests cover that regression surface, not R010 dedupe delivery.
describe("shared work item repository helper regressions", () => {
  const alert = { workspaceId, type: "diagnosis" as const, media: "KUAISHOU", accountId: "account-1",
    ruleId: 11, severity: "P1" as const, title: "合成诊断", evidenceSnapshot: {} };
  it("inserts and commits a new scoped alert after the advisory lock", async () => {
    const { repo, query, row } = setup("open");
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [row] });
    expect(await repo.createOrMergeAlert(alert)).toMatchObject({ disposition: "created", workItem: { workspaceId, id: workItemId } });
    expect(query.mock.calls[1]?.[0]).toContain("pg_advisory_xact_lock");
    expect(query.mock.calls[3]?.[0]).toContain("INSERT INTO work_items");
    expect(query.mock.calls[3]?.[1]?.slice(0, 4)).toEqual([workspaceId, "diagnosis", "KUAISHOU", "account-1"]);
    expect(query).toHaveBeenCalledWith("COMMIT");
  });
  it("keeps same-severity merging transactional", async () => {
    const { repo, query, row } = setup("open");
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [row] });
    expect(await repo.createOrMergeAlert({ ...alert, diagnosis: {} })).toMatchObject({ disposition: "merged" });
    expect(query).toHaveBeenCalledWith("COMMIT");
  });
  it("rolls back failed insertion and rejects invalid input before connecting", async () => {
    const { repo, query, connect } = setup();
    await expect(repo.createOrMergeAlert({ ...alert, accountId: "" })).rejects.toThrow(/required/);
    expect(connect).not.toHaveBeenCalled();
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
    await expect(repo.createOrMergeAlert(alert)).rejects.toThrow(/create work item/);
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
  });
  it("finds by workspace and id, preserving missing rows", async () => {
    const { repo, query, row } = setup();
    query.mockResolvedValueOnce({ rows: [row] });
    expect(await repo.find(workspaceId, workItemId)).toMatchObject({ workspaceId, id: workItemId });
    expect(query.mock.calls[0]?.[1]).toEqual([workspaceId, workItemId]);
    expect(await repo.find(workspaceId, workItemId)).toBeNull();
  });
});
