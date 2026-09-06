import { describe, expect, it, vi } from "vitest";
import { hashChangeSetDraft } from "@ka/domain";
import type { Pool } from "pg";
import { ChangeSetRepository } from "../src/changeset-repository.js";

const ws = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002", user = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-09-06T00:00:00Z"), ttl = "2026-09-07T00:00:00.000000Z";
const value = { type: "number" as const, value: 1 };
const item = { id: 1, workspace_id: ws, media: "KUAISHOU", account_id: "synthetic", target_type: "unit", target_id: "synthetic-unit", field: "bid", from_value: value, to_value: value, item_status: "failed", fail_reason: "synthetic failure" };
const hash = hashChangeSetDraft({ items: [{ target_type: item.target_type, target_id: item.target_id, field: item.field, from_value: value, to_value: value }], ttlExpireAt: ttl });
const input = { workspaceId: ws, changeSetId: id, now, currentValues: [{ targetType: "unit" as const, targetId: item.target_id, field: item.field, value }] };

function setup(options: { status?: string; failedRun?: boolean; preview?: boolean; authorized?: boolean; hash?: string; confirmHash?: string | null; resetCount?: number; missingUpdate?: boolean } = {}) {
  const header = { id, workspace_id: ws, media: "KUAISHOU", account_id: "synthetic", status: options.status ?? "failed", initiator: user, credential_owner_user_id: user,
    ttl_expire_at: new Date(ttl), ttl_expire_at_text: ttl, dry_run_hash: options.hash ?? hash, confirm_hash: "confirmHash" in options ? options.confirmHash : hash };
  const row = { ...item };
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM workspaces") || sql.includes("FROM users")) return { rows: options.authorized === false ? [] : [{ id: user }], rowCount: options.authorized === false ? 0 : 1 };
    if (sql.includes("FROM changeset_items")) return { rows: [row], rowCount: 1 };
    if (sql.includes("SELECT COALESCE(MAX(attempt)")) return { rows: [{ attempt: 2 }], rowCount: 1 };
    if (sql.includes("FROM execution_runs")) { const exists = sql.includes("r.status='failed'") ? options.failedRun !== false : options.preview !== false; return { rows: exists ? [{ id: "old-run" }] : [], rowCount: exists ? 1 : 0 }; }
    if (sql.includes("INSERT INTO execution_runs")) return { rows: [{ id: "attempt-2" }], rowCount: 1 };
    if (sql.includes("UPDATE changeset_items SET item_status='pending'")) { row.item_status = "pending"; row.fail_reason = null as unknown as string; return { rows: [], rowCount: options.resetCount ?? 1 }; }
    if (sql.includes("UPDATE changesets SET status='confirmed'") && options.missingUpdate) return { rows: [], rowCount: 0 };
    if (sql.includes("UPDATE changesets SET status='confirmed'")) header.status = "confirmed";
    if (sql.includes("UPDATE changesets SET status=$3")) header.status = params[2] as string;
    if (sql.includes("changesets")) return { rows: [header], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { repository: new ChangeSetRepository({ query, connect } as unknown as Pool), query, row, header };
}

describe("failed retry guarded flow (mock SQL)", () => {
  it("revalidates a failed execution, resets items once and begins the next attempt", async () => {
    const context = setup();
    await expect(context.repository.retry(input)).resolves.toMatchObject({ outcome: "confirmed", idempotent: false });
    expect(context.row.item_status).toBe("pending");
    await expect(context.repository.retry(input)).resolves.toMatchObject({ outcome: "confirmed", idempotent: true });
    expect(context.query.mock.calls.filter(([sql]) => sql.includes("UPDATE changeset_items SET item_status='pending'"))).toHaveLength(1);
    await expect(context.repository.beginExecution({ workspaceId: ws, changeSetId: id, startedAt: now, requestPayload: {} })).resolves.toMatchObject({ executionRunId: "attempt-2" });
    expect(context.query.mock.calls.find(([sql]) => sql.includes("INSERT INTO execution_runs"))![1]![1]).toBe(2);
  });
  it.each(["draft", "partial", "success", "unknown", "executing", "expired", "rolled_back"])("rejects retry from %s", async (status) => {
    await expect(setup({ status }).repository.retry(input)).rejects.toMatchObject({ code: "INVALID_STATE", statusCode: 409 });
  });
  it.each(["failed", "confirmed"])("requires a real completed failed run for %s", async (status) => {
    await expect(setup({ status, failedRun: false }).repository.retry(input)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it("keeps missing preview, stale hashes and revoked authorization closed", async () => {
    await expect(setup({ preview: false }).repository.retry(input)).rejects.toMatchObject({ code: "DRY_RUN_REQUIRED" });
    await expect(setup({ confirmHash: null }).repository.retry(input)).rejects.toMatchObject({ code: "FROM_VALUE_CHANGED" });
    await expect(setup({ hash: "0".repeat(64) }).repository.retry(input)).rejects.toMatchObject({ code: "FROM_VALUE_CHANGED" });
    await expect(setup({ authorized: false }).repository.retry(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("keeps a changed or expired attempt failed, without resetting its item evidence", async () => {
    const context = setup();
    await expect(context.repository.retry({ ...input, currentValues: [] })).resolves.toMatchObject({ outcome: "conflict" });
    await expect(context.repository.retry({ ...input, now: new Date(ttl) })).resolves.toEqual({ outcome: "expired" });
    expect(context.row.item_status).toBe("failed");
    expect(context.header.status).toBe("failed");
  });
  it.each([{ resetCount: 0 }, { missingUpdate: true }])("rolls back a failed partial persistence: %j", async (options) => {
    const context = setup(options);
    await expect(context.repository.retry(input)).rejects.toThrow();
    expect(context.query.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(context.query.mock.calls.some(([sql]) => sql === "COMMIT")).toBe(false);
    // Fake pool proves transaction commands, not physical rollback; PG tests cover persisted state.
  });
});
