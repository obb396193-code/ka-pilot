import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { assertExecutionRunBinding, enqueueConfirmedExecution, findConfirmedExecution, startConfirmedExecution } from "../src/changeset-execution-queue.js";

const header = { id: "cs", workspace_id: "ws", media: "KUAISHOU", account_id: "synthetic", initiator: "user", credential_owner_user_id: "owner" };
const hash = "a".repeat(64), now = new Date("2026-09-06T10:00Z");
function setup(options: { missingRun?: boolean; missingJob?: boolean; badHash?: boolean; status?: string; enqueueFail?: boolean; updateFail?: boolean } = {}) {
  const row = { id: "run-1", changeset_id: header.id, attempt: 1, status: options.status ?? "pending", dry_run: false, started_at: null as Date | null, finished_at: null,
    request_payload: { workspace_id: header.workspace_id, confirm_hash: options.badHash ? "b".repeat(64) : hash, initiator_user_id: header.initiator, credential_owner_user_id: header.credential_owner_user_id, media: header.media, account_id: header.account_id } };
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    if (sql.includes("MAX(")) return { rows: [{ attempt: 1 }], rowCount: 1 };
    if (sql.includes("FROM jobs")) return { rows: options.missingJob ? [] : [{ id: row.id }] };
    if (sql.includes("UPDATE execution_runs")) { row.status = "running"; row.started_at = args[2] as Date; return { rows: options.updateFail ? [] : [row], rowCount: options.updateFail ? 0 : 1 }; }
    return { rows: options.missingRun ? [] : [row], rowCount: options.missingRun ? 0 : 1 };
  });
  const client = { query } as unknown as PoolClient;
  const enqueue = vi.fn(async () => { if (options.enqueueFail) throw new Error("queue unavailable"); return row.id; });
  return { client, query, jobs: { enqueue }, row };
}
describe("confirmed execution and outbox atomic building blocks", () => {
  it("binds only the latest scoped actual attempt for job redelivery", async () => {
    const c = setup();
    await expect(assertExecutionRunBinding(c.client, header, "run-1")).resolves.toBeUndefined();
    for (const id of ["", "old-run"]) await expect(assertExecutionRunBinding(c.client, header, id)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(assertExecutionRunBinding(setup({ missingRun: true }).client, header, "run-1")).rejects.toThrow();
    expect(c.query.mock.calls[0]![0]).toContain("c.workspace_id=$1");
    expect(c.query.mock.calls[0]![0]).toContain("ORDER BY r.attempt DESC,r.id DESC LIMIT 1");
  });
  it("enqueues the pending run with the same id and immutable actor/account/hash scope", async () => {
    const c = setup();
    await expect(enqueueConfirmedExecution(c.client, c.jobs, header, hash, now)).resolves.toMatchObject({ id: "run-1", attempt: 1, status: "pending", startedAt: null });
    expect(c.jobs.enqueue).toHaveBeenCalledWith(expect.objectContaining({ id: "run-1", jobType: "changeset_execute", workspaceId: "ws", credentialOwnerUserId: "owner", payload: expect.objectContaining({ executionRunId: "run-1", changeSetId: "cs", confirmHash: hash, initiatorUserId: "user", media: "KUAISHOU" }) }), c.client);
  });
  it("finds the existing run and job without creating another", async () => {
    const c = setup();
    await expect(findConfirmedExecution(c.client, header, hash)).resolves.toMatchObject({ id: "run-1" });
    expect(c.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
  });
  it.each(["workspace_id", "media", "account_id", "initiator_user_id", "credential_owner_user_id"])("rejects mismatched confirmed metadata %s", async (key) => {
    const c = setup();
    (c.row.request_payload as Record<string, unknown>)[key] = "other";
    await expect(findConfirmedExecution(c.client, header, hash)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it("rejects invalid pending timestamps and header scope", async () => {
    const c = setup(); c.row.started_at = now;
    await expect(findConfirmedExecution(c.client, header, hash)).rejects.toThrow();
    c.row.started_at = new Date(NaN);
    await expect(findConfirmedExecution(c.client, header, hash)).rejects.toThrow();
    await expect(enqueueConfirmedExecution(c.client, c.jobs, { ...header, account_id: null }, hash, now)).rejects.toThrow();
    expect(c.jobs.enqueue).not.toHaveBeenCalled();
  });
  it.each([{ missingRun: true }, { missingJob: true }, { badHash: true }])("fails closed on missing or mismatched replay evidence %j", async (options) => {
    await expect(findConfirmedExecution(setup(options).client, header, hash)).rejects.toThrow();
  });
  it("reuses the pending run on execution start", async () => {
    const c = setup();
    await expect(startConfirmedExecution(c.client, header, hash, now, { idempotency_key: "cs" }, "run-1")).resolves.toMatchObject({ id: "run-1", status: "running", startedAt: now });
    expect(c.query.mock.calls.some(([sql]) => sql.includes("INSERT"))).toBe(false);
    expect(c.query.mock.calls.find(([sql]) => sql.includes("UPDATE execution_runs"))![1]![3]).toBe(JSON.stringify({ execution_context: { idempotency_key: "cs" } }));
  });
  it.each(["running", "success", "failed", "unknown"])("does not start a %s run", async (status) => {
    await expect(startConfirmedExecution(setup({ status }).client, header, hash, now, {})).rejects.toMatchObject({ code: "INVALID_STATE" });
  });
  it("rejects an older job id and failed persistence", async () => {
    await expect(startConfirmedExecution(setup().client, header, hash, now, {}, "old-run")).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(startConfirmedExecution(setup({ updateFail: true }).client, header, hash, now, {})).rejects.toThrow();
    const c = setup({ enqueueFail: true });
    await expect(enqueueConfirmedExecution(c.client, c.jobs, header, hash, now)).rejects.toThrow("queue unavailable");
  });
});
