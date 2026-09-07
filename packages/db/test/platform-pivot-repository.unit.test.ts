import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { PlatformPivotRepository, PlatformPivotContractError } from "../src/platform-pivot-repository.js";

const ws = "00000000-0000-4000-8000-000000000001";
const auth = { workspaceId: ws, userId: "00000000-0000-4000-8000-000000000002", role: "optimizer",
  workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
const window = { from: "2026-09-01", to: "2026-09-01", preset: "custom" };
function row() {
  return { workspace_id: ws, media: "KUAISHOU", account_id: "same", ds: "2026-09-01", observed: true,
    account_name: "synthetic", task_id: "task-1", task_name: "task", biz_name: "biz",
    cost: "40", cash_cost: "20", exposure: "100", click: "10", conversion: "2", real_conversion: "1",
    wake_uv: null, potential_uv: null, price_id: "9007199254740993", price: "30", effective_date: "2026-09-01",
    computed_at: new Date("2026-09-01T02:00:00Z"),
  };
}
function fake(rows: unknown[] = [row()], failure?: Error) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = Object.assign(new EventEmitter(), { release: vi.fn(),
    query: vi.fn(async (sql: string, values?: unknown[]) => {
      calls.push({ sql, ...(values ? { values } : {}) });
      if (sql.includes("platform-pivot-members") && failure) throw failure;
      return { rows: sql.includes("platform-pivot-members") ? rows : [] };
    }),
  });
  const connect = vi.fn(async () => client);
  return { repository: new PlatformPivotRepository({ connect } as never), calls, client, connect };
}

describe("PlatformPivotRepository boundary", () => {
  it("reads facts and historical price in one RR/RO query with bound tuples", async () => {
    const f = fake(); const result = await f.repository.read(auth, window);
    expect(result.members[0]).toMatchObject({ workspaceId: ws, media: "KUAISHOU", accountId: "same", observed: true,
      taskId: "task-1", taskName: "task", bizName: "biz", accountName: "synthetic",
      metrics: { cashCost: { value: 20, availability: "available" } },
      assessment: { price: { value: 30, versionKey: "9007199254740993", effectiveDate: "2026-09-01" } },
    });
    expect(result.observation).toEqual({ expectedAccountDays: 1, observedAccountDays: 1, observedAccounts: 1,
      missingComputedAt: 0, earliestComputedAt: "2026-09-01T02:00:00.000Z", latestComputedAt: "2026-09-01T02:00:00.000Z" });
    expect(f.calls[0]?.sql).toBe("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    expect(f.calls.at(-1)?.sql).toBe("COMMIT");
    const query = f.calls.filter(c => c.sql.includes("platform-pivot-members"));
    expect(query).toHaveLength(1);
    expect(query[0]?.values).toEqual([ws, window.from, window.to, JSON.stringify([{ media: "KUAISHOU", account_id: "same" }])]);
    expect(query[0]?.sql).not.toContain("same");
    expect(query[0]?.sql).toContain("LIMIT 10001");
    expect(query[0]?.sql).toContain("price.effective_date <= expected.ds");
    expect(f.client.release).toHaveBeenCalledOnce();
  });
  it.each([
    [], [row(), row()], [{ ...row(), workspace_id: "00000000-0000-4000-8000-000000000003" }],
    [{ ...row(), media: "TENCENT" }], [{ ...row(), account_id: "other" }], [{ ...row(), ds: "2026-09-02" }],
    [{ ...row(), ds: "2026-02-31" }], [{ ...row(), cost: "NaN" }], [{ ...row(), cost: true }],
    [{ ...row(), price: undefined }], [{ ...row(), price_id: null }], [{ ...row(), effective_date: "2026-09-02" }],
    [{ ...row(), observed: "true" }], [{ ...row(), observed: false }], [{ ...row(), computed_at: "invalid-secret" }],
    [{ ...row(), account_name: [] }], [{ ...row(), sql: "private" }],
  ].map(rows => [rows]))("fails closed for malformed or incomplete source %#", async rows => {
    const f = fake(rows);
    await expect(f.repository.read(auth, window)).rejects.toBeInstanceOf(PlatformPivotContractError);
    expect(f.calls.at(-1)?.sql).toBe("ROLLBACK"); expect(f.client.release).toHaveBeenCalledOnce();
  });
  it("retains a missing account-day with unknown metrics and no invented clock", async () => {
    const result = await fake([{ ...row(), observed: false, account_name: null, task_id: null, task_name: null, biz_name: null,
      cost: null, cash_cost: null, exposure: null, click: null, conversion: null, real_conversion: null,
      price_id: null, price: null, effective_date: null, computed_at: null }]).repository.read(auth, window);
    expect(result.members[0]).toMatchObject({ observed: false, accountName: null, taskId: null, computedAt: null,
      metrics: { cashCost: { value: null, availability: "missing" } }, assessment: { price: null } });
    expect(result.observation).toEqual({ expectedAccountDays: 1, observedAccountDays: 0, observedAccounts: 0,
      missingComputedAt: 0, earliestComputedAt: null, latestComputedAt: null });
  });
  it("counts missing source timestamps without substituting response time", async () => {
    const result = await fake([{ ...row(), computed_at: null }]).repository.read(auth, window);
    expect(result.observation).toMatchObject({ observedAccountDays: 1, missingComputedAt: 1,
      earliestComputedAt: null, latestComputedAt: null });
  });
  it("counts union objects rather than account-days and preserves a real timestamp range", async () => {
    const result = await fake([row(), { ...row(), ds: "2026-09-02", computed_at: "2026-09-02T02:00:00Z" }])
      .repository.read(auth, { ...window, to: "2026-09-02" });
    expect(result.observation).toEqual({ expectedAccountDays: 2, observedAccountDays: 2, observedAccounts: 1,
      missingComputedAt: 0, earliestComputedAt: "2026-09-01T02:00:00.000Z", latestComputedAt: "2026-09-02T02:00:00.000Z" });
  });
  it("allows empty grants only as an empty result", async () => {
    const empty = { ...auth, scope: { kind: "explicit_accounts", accounts: [] } };
    const result = await fake([]).repository.read(empty, window);
    expect(result.members).toEqual([]); expect(result.observation.expectedAccountDays).toBe(0);
    await expect(fake().repository.read(empty, window)).rejects.toBeInstanceOf(PlatformPivotContractError);
  });
  it("does not replace a transport failure with a contract failure", async () => {
    const error = new Error("connection failure"), f = fake([], error);
    await expect(f.repository.read(auth, window)).rejects.toBe(error);
    expect(f.calls.at(-1)?.sql).toBe("ROLLBACK"); expect(f.client.release).toHaveBeenCalledOnce();
  });
  it.each([
    { ...row(), cost: "" }, { ...row(), cost: "Infinity" }, { ...row(), cost: undefined },
    { ...row(), exposure: "9007199254740992" }, { ...row(), conversion: "0.1" },
    { ...row(), computed_at: new Date(NaN) }, { ...row(), computed_at: "2026-02-31T02:00:00Z" },
    { ...row(), task_id: "" }, { ...row(), biz_name: "" }, { ...row(), price_id: "bad" },
    { ...row(), price: "NaN" }, null, [], "private",
  ].map(bad => [bad]))("rejects present-invalid evidence %#", async bad => {
    await expect(fake([bad]).repository.read(auth, window)).rejects.toBeInstanceOf(PlatformPivotContractError);
  });
  it("keeps zero-denominator ratio semantics instead of producing NaN", async () => {
    const result = await fake([{ ...row(), real_conversion: 0, click: 0, exposure: 0 }]).repository.read(auth, window);
    expect(result.members[0]?.metrics.ratios.cashCpa).toEqual({ state: "infinite", value: null });
    expect(result.members[0]?.metrics.ratios.ctr).toEqual({ state: "undefined", value: null });
  });
  it("rejects an exact 16 MiB response and the SQL overflow sentinel", async () => {
    const rows = [row()];
    rows[0]!.account_name += "x".repeat(16 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(rows)));
    expect(Buffer.byteLength(JSON.stringify(rows))).toBe(16 * 1024 * 1024);
    await expect(fake(rows).repository.read(auth, window)).rejects.toBeInstanceOf(PlatformPivotContractError);
    await expect(fake(Array.from({ length: 10001 }, row)).repository.read(auth, window)).rejects.toBeInstanceOf(PlatformPivotContractError);
  });
  it("accepts exactly 10000 members when every expected tuple-day is proven present", async () => {
    const accounts = Array.from({ length: 1000 }, (_, i) => ({ media: "KUAISHOU", accountId: `a${i}`, accessLevel: "read" }));
    const rows = accounts.flatMap(a => Array.from({ length: 10 }, (_, d) => ({ ...row(), account_id: a.accountId,
      ds: `2026-09-${String(d + 1).padStart(2, "0")}` })));
    const result = await fake(rows).repository.read({ ...auth, scope: { kind: "explicit_accounts", accounts } }, { ...window, to: "2026-09-10" });
    expect(result.members).toHaveLength(10000);
    expect(result.observation).toMatchObject({ expectedAccountDays: 10000, observedAccountDays: 10000, observedAccounts: 1000 });
  }, 30000);
  it("rejects unserializable output with a fixed safe error", async () => {
    await expect(fake([{ ...row(), cost: 1n }]).repository.read(auth, window)).rejects.toThrow("Invalid platform pivot account-day evidence");
  });
  it.each([
    [{ ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } }, window],
    [{ ...auth, scope: { ...auth.scope, accounts: [auth.scope.accounts[0], auth.scope.accounts[0]] } }, window],
    [auth, { ...window, to: "2026-10-02" }],
    [{ ...auth, scope: { kind: "explicit_accounts", accounts: Array.from({ length: 500 }, (_, i) =>
      ({ media: "KUAISHOU", accountId: `a${i}`, accessLevel: "read" })) } }, { ...window, to: "2026-09-30" }],
  ])("rejects unsupported scope or budgets before connecting %#", async (input, range) => {
    const f = fake(); await expect(f.repository.read(input, range)).rejects.toThrow(); expect(f.connect).not.toHaveBeenCalled();
  });
});
