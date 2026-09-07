import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PersistentChangeSetFollowUps } from "../src/changeset-follow-up.js";

const ws = "00000000-0000-4000-8000-000000000001", id = "00000000-0000-4000-8000-000000000002", owner = "00000000-0000-4000-8000-000000000003";
const at = new Date("2026-09-06T10:00:00Z"), input = { workspaceId: ws, changeSetId: id, successfulItemIds: [1, 2] };
function setup(options: { parent?: Record<string, unknown>; item?: Record<string, unknown>; failInsert?: boolean; missing?: boolean; actorMissing?: boolean } = {}) {
  const parent = { id, workspace_id: ws, kind: "personal", media: "KUAISHOU", account_id: "synthetic", initiator: owner, credential_owner_user_id: owner, status: "success", executed_at: at, ...options.parent };
  const items = [1, 2].map((n) => ({ id: n, workspace_id: ws, media: "KUAISHOU", account_id: "synthetic", item_status: "success", ...options.item }));
  const jobs = new Map<string, unknown[]>();
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("FROM changeset_items")) return { rows: items, rowCount: items.length };
    if (sql.includes("FROM changesets")) return { rows: options.missing ? [] : [parent], rowCount: options.missing ? 0 : 1 };
    if (sql.includes("FROM users")) return { rows: options.actorMissing ? [] : [{ id: owner }], rowCount: options.actorMissing ? 0 : 1 };
    if (sql.includes("INSERT INTO jobs")) {
      if (options.failInsert) throw new Error("synthetic insert error");
      if (jobs.has(params[0] as string)) return { rows: [], rowCount: 0 };
      jobs.set(params[0] as string, params);
      return { rows: [{ id: params[0] }], rowCount: 1 };
    }
    if (sql.includes("FROM jobs")) return { rows: jobs.has(params[0] as string) ? [{ id: params[0] }] : [], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  // pool.query must never be used: all enqueues belong to the locked transaction.
  const pool = { connect, query: vi.fn(() => { throw new Error("escaped transaction"); }) } as unknown as Pool;
  return { scheduler: new PersistentChangeSetFollowUps(pool, { firstCheckDelayMs: 86_400_000 }), pool, connect, query, release, jobs };
}
describe("durable T1 scheduling SQL boundary", () => {
  it("binds original owner and schedules one stable job per successful item", async () => {
    const context = setup();
    await context.scheduler.scheduleT1(input);
    await context.scheduler.scheduleT1({ ...input, successfulItemIds: [2, 1] });
    expect(context.jobs.size).toBe(2);
    for (const args of context.jobs.values()) {
      expect(args[0]).toMatch(/^[0-9a-f-]{36}$/);
      expect(args[1]).toBe(ws); expect(args[2]).toBe("t1_recycle"); expect(args[5]).toBe(owner);
      expect(args[7]).toEqual(new Date("2026-09-07T10:00:00Z"));
      expect(args[3]).toMatchObject({ workspaceId: ws, changeSetId: id, initiatorUserId: owner, credentialOwnerUserId: owner, media: "KUAISHOU", accountId: "synthetic", executedAt: at.toISOString() });
    }
    expect(context.query.mock.calls.filter(([sql]) => sql === "COMMIT")).toHaveLength(2);
  });
  it.each([[], [0], [1, 1], [Number.MAX_SAFE_INTEGER + 1], ["1"], Array(10001).fill(1)].map((ids) => ({ ids })))("rejects malformed nonempty item scope", async ({ ids }) => {
    const context = setup();
    if (ids.length === 0) await expect(context.scheduler.scheduleT1({ ...input, successfulItemIds: [] })).resolves.toBeUndefined();
    else await expect(context.scheduler.scheduleT1({ ...input, successfulItemIds: ids } as never)).rejects.toThrow();
    expect(context.connect).not.toHaveBeenCalled();
  });
  it.each([{ workspaceId: "bad" }, { changeSetId: "bad" }])("rejects malformed scope before DB %j", async (scope) => {
    const context = setup();
    await expect(context.scheduler.scheduleT1({ ...input, ...scope })).rejects.toThrow();
    expect(context.connect).not.toHaveBeenCalled();
  });
  it("rejects a sparse item array before opening a transaction", async () => {
    const context = setup();
    await expect(context.scheduler.scheduleT1({ ...input, successfulItemIds: new Array(1) })).rejects.toThrow();
    expect(context.connect).not.toHaveBeenCalled();
  });
  it("freezes requested scope before awaiting the database", async () => {
    const context = setup(), request = { ...input, successfulItemIds: [1, 2] };
    const pending = context.scheduler.scheduleT1(request);
    request.workspaceId = "other"; request.successfulItemIds[0] = 999;
    await pending;
    expect([...context.jobs.values()].map((args) => (args[3] as { itemId: number }).itemId)).toEqual([1, 2]);
  });
  it.each([{ kind: "team" }, { media: null }, { workspace_id: "other" }, { id: "other" }, { status: "unknown" }, { executed_at: null }, { executed_at: new Date(NaN) }, { credential_owner_user_id: null }])("rejects unusable persisted parent %j", async (parent) => {
    const context = setup({ parent });
    await expect(context.scheduler.scheduleT1(input)).rejects.toThrow();
    expect(context.jobs.size).toBe(0);
    expect(context.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
  });
  it.each([{ workspace_id: "other" }, { media: "TENCENT" }, { account_id: "other" }, { item_status: "failed" }, { id: 9 }])("rejects non-success or mismatched item %j", async (item) => {
    const context = setup({ item });
    await expect(context.scheduler.scheduleT1(input)).rejects.toThrow();
    expect(context.jobs.size).toBe(0);
  });
  it.each([{ missing: true }, { actorMissing: true }, { failInsert: true }])("rolls back failure %j", async (options) => {
    const context = setup(options);
    await expect(context.scheduler.scheduleT1(input)).rejects.toThrow();
    expect(context.query.mock.calls.at(-1)![0]).toBe("ROLLBACK");
    expect(context.release).toHaveBeenCalledOnce();
  });
  it.each([0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER])("requires a bounded explicit server delay %s", (delay) => {
    expect(() => new PersistentChangeSetFollowUps({} as Pool, { firstCheckDelayMs: delay })).toThrow();
  });
});
