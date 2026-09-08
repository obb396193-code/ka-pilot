import { describe, expect, it, vi } from "vitest";
import { metricValue } from "@ka/domain";
import { PlatformPivotQuery, createPlatformPivotQuery } from "../src/data/platform-pivot-query.js";
import { PlatformPivotContractError } from "@ka/db";

const ws = "00000000-0000-4000-8000-000000000001";
const window = { from: "2026-09-01", to: "2026-09-02", preset: "custom" };
const auth = { workspaceId: ws, userId: "00000000-0000-4000-8000-000000000002", role: "optimizer", workspaceKind: "personal",
  scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "same", accessLevel: "read" }] } };
const input = { auth, window, dimA: "account", dimB: "task" };
function member(ds: string, task: string | null, cash: number | null, conversion: number | null) {
  const divide = (a: number | null, b: number | null) => a === null || b === null || b === 0
    ? { value: null, state: "undefined" } : { value: a / b, state: "finite" };
  return { workspaceId: ws, media: "KUAISHOU", accountId: "same", observed: cash !== null,
    accountName: "synthetic", taskId: task, taskName: task, bizName: task === null ? null : "biz",
    computedAt: cash === null ? null : `${ds}T02:00:00.000Z`, assessment: { ds, cashCost: metricValue(cash), realConversion: metricValue(conversion),
      price: { value: 20, versionKey: "1", effectiveDate: "2026-09-01" } },
    metrics: { cost: metricValue(cash), cashCost: metricValue(cash), realConversion: metricValue(conversion),
      exposure: metricValue(null), click: metricValue(null), conversion: metricValue(null), costSpace: metricValue(null),
      wakeUv: metricValue(null), potentialUv: metricValue(null), ratios: { ctr: divide(null, null), cvr: divide(null, null),
        realCpa: divide(cash, conversion), cashCpa: divide(cash, conversion), gap: divide(null, null),
        potentialRate: divide(null, null), biConversionRate: divide(null, null) } },
  };
}
function snapshot() {
  return { window, members: [member("2026-09-01", "a", 10, 1), member("2026-09-02", "b", 90, 3)],
    observation: { expectedAccountDays: 2, observedAccountDays: 2, observedAccounts: 1, missingComputedAt: 0,
      earliestComputedAt: "2026-09-01T02:00:00.000Z", latestComputedAt: "2026-09-02T02:00:00.000Z" } };
}
describe("PlatformPivotQuery", () => {
  it("partitions actual daily task membership without duplicating an account window", async () => {
    const read = vi.fn(async () => snapshot());
    const result = await new PlatformPivotQuery({ read }).query(input);
    expect(result.rows.map(r => [r.a.key, r.b.key, r.metrics.cashCost.value, r.metrics.costSpace.value]))
      .toEqual([["KUAISHOU:same", "a", 10, 10], ["KUAISHOU:same", "b", 90, -30]]);
    expect(result.cellCoverage).toEqual({ cells: 2, withData: 2, undeterminable: 0 });
    expect(read).toHaveBeenCalledWith(auth, window);
  });
  it("recomputes weighted CPA after combining cells", async () => {
    const result = await new PlatformPivotQuery({ read: async () => snapshot() }).query({ ...input, dimA: "biz", dimB: "account" });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.metrics.cashCost.value).toBe(100);
    expect(result.rows[0]?.metrics.ratios.cashCpa).toEqual({ value: 25, state: "finite" });
    expect(result.rows[0]?.metrics.costSpace.value).toBe(-20);
  });
  it("retains missing cells and reports undeterminable separately from observed cells", async () => {
    const missing = member("2026-09-02", null, null, null);
    const raw = { ...snapshot(), members: [snapshot().members[0], missing], observation: { ...snapshot().observation,
      observedAccountDays: 1, latestComputedAt: "2026-09-01T02:00:00.000Z" } };
    const result = await new PlatformPivotQuery({ read: async () => raw }).query({ ...input, dimA: "task", dimB: "biz" });
    expect(result.rows[1]).toMatchObject({ a: { key: null, label: null }, b: { key: null, label: null }, assessment: { onTarget: null } });
    expect(result.cellCoverage).toEqual({ cells: 2, withData: 1, undeterminable: 1 });
  });
  it("allows observed facts with unknown timestamps but never invents one", async () => {
    const raw = snapshot(); raw.members.forEach(m => { m.computedAt = null; });
    const result = await new PlatformPivotQuery({ read: async () => ({ ...raw, observation: { ...raw.observation,
      missingComputedAt: 2, earliestComputedAt: null, latestComputedAt: null } }) }).query(input);
    expect(result.observation).toMatchObject({ missingComputedAt: 2, earliestComputedAt: null, latestComputedAt: null });
  });
  it.each(["ubp", "bid_tool", "agent_type", "resource_position", "deduction_range"])("does not query unsupported %s", async dimA => {
    const read = vi.fn(); await expect(new PlatformPivotQuery({ read }).query({ ...input, dimA })).rejects.toMatchObject({ code: "DIMENSION_UNSUPPORTED" });
    expect(read).not.toHaveBeenCalled();
  });
  it("does not pass team context to personal canonical reader", async () => {
    const read = vi.fn();
    await expect(new PlatformPivotQuery({ read }).query({ ...input, auth: { ...auth, workspaceKind: "team", scope: { kind: "team_workspace_readonly" } } }))
      .rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(read).not.toHaveBeenCalled();
  });
  it.each([
    { ...input, window: { ...window, to: "2026-10-15" } },
    { ...input, auth: { ...auth, scope: { ...auth.scope, accounts: [...auth.scope.accounts, ...auth.scope.accounts] } } },
    { ...input, scope: "browser-override" },
  ])("rejects invalid input before read %#", async request => {
    const read = vi.fn(); await expect(new PlatformPivotQuery({ read }).query(request)).rejects.toThrow(); expect(read).not.toHaveBeenCalled();
  });
  it.each([
    (s: ReturnType<typeof snapshot>) => ({ ...s, window: { ...s.window, to: "2026-09-03" } }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, observation: { ...s.observation, observedAccounts: 2 } }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, observation: { ...s.observation, latestComputedAt: "2026-09-03T00:00:00Z" } }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, members: [s.members[0], s.members[0]] }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, members: [s.members[0]] }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, members: s.members.map(m => ({ ...m, workspaceId: "00000000-0000-4000-8000-000000000009" })) }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, members: s.members.map(m => ({ ...m, media: "TENCENT" })) }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, members: s.members.map(m => ({ ...m, accountId: "foreign" })) }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, members: s.members.map(m => ({ ...m, observed: false })) }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, members: s.members.map(m => ({ ...m, metrics: { ...m.metrics, cashCost: metricValue(1) } })) }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, members: s.members.map(m => ({ ...m, computedAt: "2026-02-31T00:00:00Z" })) }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, members: s.members.map(m => ({ ...m, taskName: "secret", taskId: [] })) }),
    (s: ReturnType<typeof snapshot>) => ({ ...s, privateSql: "secret" }),
  ])("maps inconsistent/malicious source to a fixed contract error %#", async change => {
    await expect(new PlatformPivotQuery({ read: async () => change(snapshot()) }).query(input))
      .rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE", message: "Invalid pivot source evidence" });
  });
  it("rejects conflicting labels for one axis key, including across different cells", async () => {
    const raw = snapshot(); raw.members[1]!.accountName = "different";
    await expect(new PlatformPivotQuery({ read: async () => raw }).query(input)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    raw.members[1]!.taskId = "a";
    await expect(new PlatformPivotQuery({ read: async () => raw }).query(input)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("maps repository contract failures but preserves transport error identity", async () => {
    await expect(new PlatformPivotQuery({ read: async () => { throw new PlatformPivotContractError(); } }).query(input))
      .rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    const error = new Error("connection failed");
    await expect(new PlatformPivotQuery({ read: async () => { throw error; } }).query(input)).rejects.toBe(error);
  });
  it("reader cannot mutate the trusted workspace/window used to validate its own output", async () => {
    const read = vi.fn(async (scope: unknown, range: unknown) => {
      (scope as { workspaceId: string }).workspaceId = "00000000-0000-4000-8000-000000000009";
      (range as { to: string }).to = "2026-09-03";
      return { ...snapshot(), members: snapshot().members.map(m => ({ ...m, workspaceId: (scope as { workspaceId: string }).workspaceId })) };
    });
    await expect(new PlatformPivotQuery({ read }).query(input)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    expect(auth.workspaceId).toBe(ws); expect(window.to).toBe("2026-09-02");
  });
  it.each([null, { members: null }, { members: Array.from({ length: 10001 }, () => null) }, { members: [], n: 1n }])("rejects unbounded or unserializable reader output %#", async raw => {
      await expect(new PlatformPivotQuery({ read: async () => raw }).query(input)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    });
  it("rejects exact16MiB before parsing the source tree", async () => {
    const raw = { ...snapshot(), padding: "" };
    raw.padding = "x".repeat(16 * 1024 * 1024 - Buffer.byteLength(JSON.stringify(raw)));
    expect(Buffer.byteLength(JSON.stringify(raw))).toBe(16 * 1024 * 1024);
    await expect(new PlatformPivotQuery({ read: async () => raw }).query(input)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
  it("factory actually uses the bounded RR/RO repository; empty grant stays empty", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const client = { query, on: vi.fn(), removeListener: vi.fn(), release: vi.fn() };
    const result = await createPlatformPivotQuery({ connect: async () => client } as never)
      .query({ ...input, auth: { ...auth, scope: { kind: "explicit_accounts", accounts: [] } } });
    expect(query.mock.calls[0]).toEqual(["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"]);
    expect(result.rows).toEqual([]); expect(result.cellCoverage).toEqual({ cells: 0, withData: 0, undeterminable: 0 });
    expect(client.release).toHaveBeenCalledOnce();
  });
});
