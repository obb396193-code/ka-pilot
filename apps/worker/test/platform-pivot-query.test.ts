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
  it("filters daily task membership before recomputing metrics even when neither axis is task", async () => {
    const result = await new PlatformPivotQuery({ read: async () => snapshot() }).query({ ...input, dimA: "biz", dimB: "account", taskIds: ["a"] });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ metrics: { cashCost: { value: 10 }, realConversion: { value: 1 }, ratios: { cashCpa: { value: 10, state: "finite" } }, costSpace: { value: 10 } } });
    expect(result.cellCoverage.cells).toBe(1);
    // Source lineage is still about the complete authorized read, not the filtered result rows.
    expect(result.observation.expectedAccountDays).toBe(2);
  });
  it("empty selector means no filter; nonmatching task yields no cells without borrowing data", async () => {
    const query = new PlatformPivotQuery({ read: async () => snapshot() });
    expect((await query.query({ ...input, taskIds: [] })).rows).toHaveLength(2);
    const empty = await query.query({ ...input, taskIds: ["absent"] });
    expect(empty.rows).toEqual([]); expect(empty.cellCoverage).toEqual({ cells: 0, withData: 0, undeterminable: 0 });
  });
  it("a task filter cannot conceal an invalid excluded source member", async () => {
    const raw = snapshot(); raw.members[1]!.media = "TENCENT";
    await expect(new PlatformPivotQuery({ read: async () => raw }).query({ ...input, taskIds: ["a"] }))
      .rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
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

/**
 * v1.9.34 ⑦：两条轴开放到命名维度（optimizer/goal/placement）与任意清洗段 `segment:<key>`。
 * 标签从注入的读取器来，与 `account.dimension` 同一份 `loadAccountLabels`。
 */
describe("PlatformPivotQuery labelled axes", () => {
  const two = { ...auth, scope: { kind: "explicit_accounts", accounts: [
    { media: "KUAISHOU", accountId: "same", accessLevel: "read" },
    { media: "KUAISHOU", accountId: "other", accessLevel: "read" }] } };
  function pair() {
    const mine = member("2026-09-01", "a", 10, 1);
    const theirs = { ...member("2026-09-01", "a", 90, 3), accountId: "other", accountName: "other" };
    return { window: { ...window, to: "2026-09-01" }, members: [mine, theirs],
      observation: { expectedAccountDays: 2, observedAccountDays: 2, observedAccounts: 2, missingComputedAt: 0,
        earliestComputedAt: "2026-09-01T02:00:00.000Z", latestComputedAt: "2026-09-01T02:00:00.000Z" } };
  }
  const labelled = { ...input, auth: two, window: { ...window, to: "2026-09-01" } };
  const labels = (rows: Record<string, Record<string, string | null>>) =>
    ({ read: async () => new Map(Object.entries(rows)) });

  it("groups both axes by naming labels instead of account identity", async () => {
    const result = await new PlatformPivotQuery({ read: async () => pair() }, labels({
      "KUAISHOU:same": { optimizer: "张三", goal: "拉新" },
      "KUAISHOU:other": { optimizer: "李四", goal: "拉新" },
    })).query({ ...labelled, dimA: "optimizer", dimB: "goal" });
    expect(result.rows.map(row => [row.a.key, row.b.key, row.metrics.cashCost.value]))
      .toEqual([["张三", "拉新", 10], ["李四", "拉新", 90]]);
    // 轴的 label 就是值本身，不另起一套显示名——两者分叉时前端会显示一个查不到的名字。
    expect(result.rows[0]?.a).toEqual({ key: "张三", label: "张三" });
  });

  it("pivots by an arbitrary cleaning segment", async () => {
    const result = await new PlatformPivotQuery({ read: async () => pair() }, labels({
      "KUAISHOU:same": { "segment:city": "杭州" },
      "KUAISHOU:other": { "segment:city": "杭州" },
    })).query({ ...labelled, dimA: "segment:city", dimB: "account" });
    expect(result.rows.map(row => [row.a.key, row.b.key])).toEqual([["杭州", "KUAISHOU:same"], ["杭州", "KUAISHOU:other"]]);
  });

  it("keeps an unlabelled account as its own null bucket instead of dropping or guessing it", async () => {
    const result = await new PlatformPivotQuery({ read: async () => pair() }, labels({
      "KUAISHOU:same": { optimizer: "张三" },
    })).query({ ...labelled, dimA: "optimizer", dimB: "goal" });
    // 没标注的那户照样成行（key/label 都是 null），花的 90 块不会凭空消失，
    // 也不会被塞进「张三」——两种都会让某个人的成本凭空多出来或少掉。
    expect(result.rows.map(row => [row.a.key, row.b.key, row.metrics.cashCost.value]))
      .toEqual([["张三", null, 10], [null, null, 90]]);
    expect(result.cellCoverage).toEqual({ cells: 2, withData: 2, undeterminable: 0 });
  });

  it("reads labels for the authorized scope, never for whatever the snapshot returned", async () => {
    const read = vi.fn(async () => new Map());
    await new PlatformPivotQuery({ read: async () => pair() }, { read })
      .query({ ...labelled, dimA: "optimizer", dimB: "account" });
    expect(read).toHaveBeenCalledWith({ workspaceId: ws, accounts: [
      { media: "KUAISHOU", accountId: "same" }, { media: "KUAISHOU", accountId: "other" }] });
  });

  it("skips the label read entirely for the three fact dimensions", async () => {
    const read = vi.fn(async () => new Map());
    await new PlatformPivotQuery({ read: async () => pair() }, { read }).query({ ...labelled, dimA: "biz", dimB: "task" });
    expect(read).not.toHaveBeenCalled();
  });

  it.each(["ubp", "bid_tool", "agent_type", "resource_position", "deduction_range"])(
    "refuses %s even with a labels reader wired, rather than returning one empty bucket", async dimA => {
      // 这几个在 dimensionTypeSchema 里合法，但没有任何解析器产出——放行的后果不是报错，
      // 是一张「所有账户归一个空桶」的透视表，看上去完全正常。
      const read = vi.fn();
      await expect(new PlatformPivotQuery({ read }, labels({})).query({ ...labelled, dimA }))
        .rejects.toMatchObject({ code: "DIMENSION_UNSUPPORTED" });
      expect(read).not.toHaveBeenCalled();
    });

  it.each(["segment:bad-key", "segment:", `segment:${"x".repeat(65)}`])(
    "rejects a malformed segment name %s at the input schema", async dimA => {
      const read = vi.fn();
      await expect(new PlatformPivotQuery({ read }, labels({})).query({ ...labelled, dimA })).rejects.toThrow();
      expect(read).not.toHaveBeenCalled();
    });
});
