import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { hashChangeSetDraft } from "@ka/domain";
import { ChangeSetRepository } from "../src/changeset-repository.js";

const ws = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002", user = "00000000-0000-4000-8000-000000000003";
const now = new Date("2026-09-06T00:00:00Z"), ttl = "2026-09-07T00:00:00.000001Z";
const value = { type: "number" as const, value: 1 };
const item = { id: 1, workspace_id: ws, media: "KUAISHOU", account_id: "synthetic", target_type: "unit", target_id: "synthetic-unit", field: "bid", from_value: value, to_value: value, item_status: "pending", fail_reason: null };
const hash = hashChangeSetDraft({ items: [{ target_type: item.target_type, target_id: item.target_id, field: item.field, from_value: value, to_value: value }], ttlExpireAt: ttl });
const currentValues = [{ targetType: "unit" as const, targetId: item.target_id, field: item.field, value }];

function setup(options: { status?: string; hash?: string | null; evidence?: boolean; ttl?: string; confirmHash?: string | null; missingRun?: boolean; updateFails?: boolean } = {}) {
  const header = { id, workspace_id: ws, media: "KUAISHOU", account_id: "synthetic", status: options.status ?? "draft", initiator: user, credential_owner_user_id: user,
    ttl_expire_at: new Date(options.ttl ?? ttl), ttl_expire_at_text: options.ttl ?? ttl, dry_run_hash: options.hash ?? null, confirm_hash: options.confirmHash ?? null };
  let evidence = options.evidence ?? false;
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM workspaces") || sql.includes("FROM users")) return { rows: [{ id: user }], rowCount: 1 };
    if (sql.includes("FROM changeset_items")) return { rows: [item], rowCount: 1 };
    if (sql.includes("SELECT COALESCE(MAX(attempt)")) return { rows: [{ attempt: 1 }], rowCount: 1 };
    if (sql.includes("FROM execution_runs")) return { rows: evidence ? [{ id: "successful-preview" }] : [], rowCount: evidence ? 1 : 0 };
    if (sql.includes("INSERT INTO execution_runs")) { evidence = true; return { rows: options.missingRun ? [] : [{ id: "new-preview" }], rowCount: options.missingRun ? 0 : 1 }; }
    if (sql.includes("UPDATE changesets SET dry_run_hash")) { header.dry_run_hash = params[2] as string | null; header.confirm_hash = null; return { rows: [header], rowCount: options.updateFails ? 0 : 1 }; }
    if (sql.includes("UPDATE changesets SET status='confirmed'")) { header.status = "confirmed"; header.confirm_hash = params[2] as string; }
    if (sql.includes("changesets")) return { rows: [header], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  const repository = new ChangeSetRepository({ query, connect } as unknown as Pool);
  return { repository, query, header, release, connect };
}

describe("changeset dry-run hard gate (mock SQL)", () => {
  const result = { workspaceId: ws, changeSetId: id, now, expectedHash: hash, items: [{ itemId: 1, status: "success" as const }] };
  it("prepares the actual DB microsecond TTL and persists a matching preview before confirmation", async () => {
    const context = setup();
    expect((await context.repository.prepareDryRun({ workspaceId: ws, changeSetId: id, now })).hash).toBe(hash);
    await expect(context.repository.recordDryRun(result)).resolves.toMatchObject({ status: "success", hash });
    await expect(context.repository.confirm({ workspaceId: ws, changeSetId: id, now, currentValues, expectedHash: hash })).resolves.toMatchObject({ outcome: "confirmed", idempotent: false });
    expect(context.header.confirm_hash).toBe(hash);
    await expect(context.repository.confirm({ workspaceId: ws, changeSetId: id, now, currentValues, expectedHash: hash })).resolves.toMatchObject({ idempotent: true });
    const proof = context.query.mock.calls.find(([sql]) => sql.includes("r.request_payload->>"))!;
    expect(proof[0]).toContain("c.workspace_id=$1");
    expect(proof[0]).toContain("r.dry_run=true");
    expect(proof[0]).toContain("r.finished_at IS NOT NULL");
    expect(proof[1]).toEqual([ws, id, hash]);
  });
  it.each(["failed", "unknown"] as const)("invalidates a previous successful preview after %s preflight", async (status) => {
    const context = setup({ hash, evidence: true });
    await expect(context.repository.recordDryRun({ ...result, items: [{ itemId: 1, status }] })).resolves.toMatchObject({ status });
    expect(context.header.dry_run_hash).toBeNull();
    await expect(context.repository.confirm({ workspaceId: ws, changeSetId: id, now, currentValues })).rejects.toMatchObject({ code: "DRY_RUN_REQUIRED" });
  });
  it("rejects a stale submitted result without storing any new successful evidence", async () => {
    const context = setup({ ttl: "2026-09-07T00:00:00.000002Z" });
    await expect(context.repository.recordDryRun(result)).rejects.toMatchObject({ code: "FROM_VALUE_CHANGED" });
    expect(context.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO execution_runs"))).toBe(false);
  });
  it.each([{ items: [{ itemId: 2, status: "success" as const }] }, { items: [{ itemId: 1, status: "success" as const }, { itemId: 1, status: "success" as const }] }])("requires exact result coverage", async ({ items }) => {
    const context = setup();
    await expect(context.repository.recordDryRun({ ...result, items })).rejects.toThrow("exactly once");
    expect(context.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
  });
  it.each(["success", "failed", "unknown", "confirmed"])("does not preview an invalid state %s", async (status) => {
    const context = setup({ status });
    await expect(context.repository.prepareDryRun({ workspaceId: ws, changeSetId: id, now })).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(context.repository.recordDryRun(result)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it.each([{ missingRun: true }, { updateFails: true }])("rolls back if result and draft could not both be persisted", async (options) => {
    const context = setup(options);
    await expect(context.repository.recordDryRun(result)).rejects.toThrow();
    expect(context.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
    expect(context.release).toHaveBeenCalledOnce();
  });
  it("rejects malformed result/hash/clock before DB access", async () => {
    const context = setup();
    await expect(context.repository.recordDryRun({ ...result, expectedHash: "bad" })).rejects.toThrow("Invalid dry-run hash");
    await expect(context.repository.recordDryRun({ ...result, items: [{ itemId: 1, status: "invented" }] } as never)).rejects.toThrow();
    await expect(context.repository.prepareDryRun({ workspaceId: ws, changeSetId: id, now: new Date(NaN) })).rejects.toThrow("valid clock");
    await expect(context.repository.confirm({ workspaceId: ws, changeSetId: id, now: new Date(NaN), currentValues })).rejects.toThrow("valid clock");
    expect(context.connect).not.toHaveBeenCalled();
  });
  it("requires matching confirmation evidence again before beginning execution", async () => {
    const context = setup({ status: "confirmed", hash, confirmHash: hash });
    await expect(context.repository.beginExecution({ workspaceId: ws, changeSetId: id, startedAt: now, requestPayload: {} })).rejects.toMatchObject({ code: "DRY_RUN_REQUIRED" });
    expect(context.query.mock.calls.some(([sql]) => sql.includes("INSERT INTO execution_runs"))).toBe(false);
  });
  it("does not fabricate raw timestamp metadata from a Date", async () => {
    const context = setup();
    context.header.ttl_expire_at_text = null as unknown as string;
    await expect(context.repository.prepareDryRun({ workspaceId: ws, changeSetId: id, now })).rejects.toThrow("expiration metadata");
  });
  it("rejects a changed confirmation hash before beginning execution", async () => {
    await expect(setup({ status: "confirmed", hash, confirmHash: "0".repeat(64), evidence: true }).repository.beginExecution({ workspaceId: ws, changeSetId: id, startedAt: now, requestPayload: {} })).rejects.toMatchObject({ code: "FROM_VALUE_CHANGED" });
  });
  it("keeps actual execution attempt counting separate from preview attempts", async () => {
    const context = setup({ status: "confirmed", hash, confirmHash: hash, evidence: true });
    await expect(context.repository.beginExecution({ workspaceId: ws, changeSetId: id, startedAt: now, requestPayload: {} })).resolves.toMatchObject({ directive: "execute" });
    expect(context.query.mock.calls.find(([sql]) => sql.includes("SELECT COALESCE(MAX(attempt)"))![0]).toContain("dry_run=false");
  });
  it("requires a running non-dry-run row when persisting actual execution results", async () => {
    const context = setup({ status: "executing" });
    await expect(context.repository.completeExecution({ workspaceId: ws, changeSetId: id, executionRunId: "preview-not-execution", finishedAt: now,
      resultPayload: {}, items: [{ itemId: 1, status: "success" }] })).rejects.toThrow("execution run");
    const update = context.query.mock.calls.find(([sql]) => sql.includes("UPDATE execution_runs"))!;
    expect(update[0]).toContain("dry_run=false AND status='running'");
    expect(context.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
  });
  it("rejects a caller-bound old preview even when the server has a newer successful one", async () => {
    await expect(setup({ hash, evidence: true }).repository.confirm({ workspaceId: ws, changeSetId: id, now, currentValues, expectedHash: "0".repeat(64) })).rejects.toMatchObject({ code: "FROM_VALUE_CHANGED" });
  });
  it.each([{ hash: null, evidence: false }, { hash, evidence: false }])("requires a successful persisted preview before confirm", async (options) => {
    const context = setup(options);
    await expect(context.repository.confirm({ workspaceId: ws, changeSetId: id, now, currentValues })).rejects.toMatchObject({ code: "DRY_RUN_REQUIRED", statusCode: 409 });
    expect(context.header.status).toBe("draft");
    expect(context.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
  });
  it("rejects a stale preview hash", async () => {
    await expect(setup({ hash: "0".repeat(64), evidence: true }).repository.confirm({ workspaceId: ws, changeSetId: id, now, currentValues })).rejects.toMatchObject({ code: "FROM_VALUE_CHANGED" });
  });
  it("rechecks successful evidence even for confirmed replay", async () => {
    await expect(setup({ status: "confirmed", hash, confirmHash: hash }).repository.confirm({ workspaceId: ws, changeSetId: id, now, currentValues })).rejects.toMatchObject({ code: "DRY_RUN_REQUIRED" });
  });
  it("does not let an expired terminal status turn into expired", async () => {
    const context = setup({ status: "success", ttl: "2026-09-05T00:00:00Z" });
    await expect(context.repository.confirm({ workspaceId: ws, changeSetId: id, now, currentValues })).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect(context.query.mock.calls.some(([sql]) => sql.includes("SET status='expired'"))).toBe(false);
  });
});
