import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { claimReconciliation, finishReconciliationClaim } from "../src/changeset-reconciliation.js";

const ws = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002", source = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-09-06T10:00:00Z"), header = { id, workspace_id: ws, media: "KUAISHOU", account_id: "synthetic", initiator: ws, status: "unknown" };
function setup(options: { actual?: boolean; actualStatus?: string; claim?: boolean; claimStatus?: string; expired?: boolean; wrongSource?: boolean; updateMissing?: boolean } = {}) {
  let exists = options.claim ?? false, status = options.claimStatus ?? "running";
  const manual = new Set<string>();
  const row = () => ({ id: "claim-1", status, started_at: now, request_payload: { reconcile: true, source_run_id: options.wrongSource ? "wrong" : source, lease_until: new Date(now.getTime() + (options.expired ? -1 : 60000)).toISOString() } });
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.includes("r.dry_run=false")) return { rows: options.actual === false ? [] : [{ id: source, status: options.actualStatus ?? "unknown", started_at: now }] };
    if (sql.trimStart().startsWith("SELECT") && sql.includes("FROM execution_runs")) return { rows: exists ? [row()] : [] };
    if (sql.includes("INSERT INTO execution_runs")) { exists = true; return { rows: [{ id: "claim-1" }], rowCount: 1 }; }
    if (sql.includes("UPDATE execution_runs")) { status = args[2] as string; return { rowCount: options.updateMissing ? 0 : 1, rows: [] }; }
    if (sql.includes("INSERT INTO work_items")) { manual.add(args[0] as string); return { rows: [], rowCount: 1 }; }
    if (sql.includes("FROM work_items")) return { rows: [{ id: [...manual][0] }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  return { client: { query } as unknown as PoolClient, query, manual };
}
describe("one-shot read-only reconciliation claim", () => {
  it("claims once then waits without another run", async () => {
    const c = setup();
    await expect(claimReconciliation(c.client, header, now, 60000)).resolves.toEqual({ directive: "reconcile", executionRunId: "claim-1" });
    await expect(claimReconciliation(c.client, header, now, 60000)).resolves.toEqual({ directive: "waiting" });
    expect(c.query.mock.calls.filter(([sql]) => sql.includes("INSERT INTO execution_runs"))).toHaveLength(1);
  });
  it("does not reconcile a currently running actual execution before its deadline", async () => {
    await expect(claimReconciliation(setup({ actualStatus: "running" }).client, { ...header, status: "executing" }, now, 60000)).resolves.toEqual({ directive: "waiting" });
  });
  it("marks a timed-out actual run unknown before claiming its read-back", async () => {
    const c = setup({ actualStatus: "running" });
    await expect(claimReconciliation(c.client, header, new Date(now.getTime() + 60001), 60000)).resolves.toMatchObject({ directive: "reconcile" });
    expect(c.query.mock.calls.some(([sql]) => sql.includes("status='running' AND dry_run=false"))).toBe(true);
  });
  it.each([0, 999, 3600001, NaN])("rejects invalid claim lease %s", async (lease) => {
    await expect(claimReconciliation(setup().client, header, now, lease)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it("times out a claim to one manual item and never claims again", async () => {
    const c = setup({ claim: true, expired: true });
    await expect(claimReconciliation(c.client, header, now, 60000)).resolves.toMatchObject({ directive: "manual_required" });
    await expect(claimReconciliation(c.client, header, now, 60000)).resolves.toMatchObject({ directive: "manual_required" });
    expect(c.manual.size).toBe(1);
    expect(c.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO execution_runs"))).toBe(false);
  });
  it.each([{ actual: false }, { actualStatus: "success" }])("rejects an unprovable actual execution %j", async (options) => {
    await expect(claimReconciliation(setup(options).client, header, now, 60000)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it.each([{ claim: false }, { claim: true, claimStatus: "unknown" }, { claim: true, expired: true }, { claim: true, wrongSource: true }, { claim: true, updateMissing: true }])("rejects absent/stale/foreign claim completion %j", async (options) => {
    await expect(finishReconciliationClaim(setup(options).client, header, "claim-1", now, "success", {})).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it("atomically persists unknown audit and manual evidence without upstream error text", async () => {
    const c = setup({ claim: true });
    await finishReconciliationClaim(c.client, header, "claim-1", now, "unknown", { unavailable: true });
    expect(c.manual.size).toBe(1);
    const insert = c.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO work_items"))!;
    expect(insert[0]).toContain("'agent_question'");
    expect(JSON.parse(insert[1]![5] as string)).toEqual({ changesetId: id, sourceRunId: source, reason: "reconciliation_unknown" });
  });
});
