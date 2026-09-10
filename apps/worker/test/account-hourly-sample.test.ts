import { describe, expect, it } from "vitest";
import { normalizeAccountHourlySample } from "../src/etl/account-hourly-sample.js";
import { QihangClient } from "../src/qihang/client.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const row = { account_id: "a", ds: "20260909", account_cost: "12.5", account_exposure: "20",
  account_click: 2, account_conversion: "1", account_real_conversion: 0, account_budget: "100",
  last_sync_time: "2026-09-09 11:03:00" };
const input = () => ({ workspaceId, media: "KUAISHOU", accountIds: ["a", "b"], ds: "2026-09-09", hh: 10,
  sampledAt: "2026-09-09T11:05:00+08:00", sourceUtcOffset: "+08:00", sourceRunId: "9007199254740993", rows: [row] });

describe("account cumulative sample boundary / synthetic only", () => {
  it("maps real account fields, preserves missing accounts and never trusts upstream workspace", () => {
    const result = normalizeAccountHourlySample({ ...input(), rows: [{ ...row, workspace_id: "untrusted", media: "KUAISHOU" }] });
    expect(result).toEqual({ missingAccountIds: ["b"], rows: [{ workspaceId, media: "KUAISHOU", accountId: "a",
      ds: "2026-09-09", hh: 10, cost: 12.5, exposure: 20, click: 2, conversion: 1, realConversion: 0, budget: 100,
      lastSyncTime: "2026-09-09T03:03:00.000Z", sampledAt: "2026-09-09T03:05:00.000Z", complete: true,
      sourceRunId: "9007199254740993" }] });
  });
  it("keeps zero, null and absent metrics distinct; an empty response creates no rows", () => {
    const minimal = { account_id: "a", ds: "2026-09-09", last_sync_time: "2026-09-09T03:00:00Z", account_cost: 0, account_budget: null };
    expect(normalizeAccountHourlySample({ ...input(), rows: [minimal] }).rows[0]).toMatchObject({
      cost: 0, budget: null, exposure: null, click: null, conversion: null, realConversion: null });
    expect(normalizeAccountHourlySample({ ...input(), rows: [] })).toEqual({ rows: [], missingAccountIds: ["a", "b"] });
  });
  it("sorts output deterministically without mutating inputs or silently dropping valid accounts", () => {
    const rows = [{ ...row, account_id: "b" }, row];
    const before = JSON.stringify(rows);
    const result = normalizeAccountHourlySample({ ...input(), rows });
    expect(result.rows.map(item => item.accountId)).toEqual(["a", "b"]);
    expect(result.missingAccountIds).toEqual([]);
    expect(JSON.stringify(rows)).toBe(before);
    expect(Object.isFrozen(result.rows[0])).toBe(true);
  });
  it("consumes the real client envelope with the caller's observed sample time, never response-owned scope", async () => {
    const context = input();
    const client = new QihangClient({ now: () => new Date(context.sampledAt), fetchFn: async url => {
      expect(new URL(String(url)).searchParams.get("hh")).toBe("10");
      return new Response(JSON.stringify({ successful: true, data: [row] }));
    } });
    const response = await client.query({ resource: "account_realtime", userId: "synthetic-private", media: context.media,
      accountIds: context.accountIds, ds: context.ds, hh: context.hh });
    const result = normalizeAccountHourlySample({ ...context, sampledAt: response.observation!.observedAt, rows: response.rows });
    expect(result.rows[0]).toMatchObject({ cost: 12.5, complete: true, workspaceId, hh: 10 });
    expect(result.missingAccountIds).toEqual(["b"]);
  });
  it.each([
    ["2026-09-09T11:04:59+08:00", false], ["2026-09-09T11:05:00+08:00", true],
    ["2026-09-09T03:05:00Z", true],
  ])("uses supplied sample time at the hour-end plus five-minute boundary %s", (sampledAt, complete) => {
    expect(normalizeAccountHourlySample({ ...input(), sampledAt }).rows[0]?.complete).toBe(complete);
  });
  it("uses the source calendar day at midnight, not the 03:00 task business-day cutoff", () => {
    const result = normalizeAccountHourlySample({ ...input(), hh: 23, sampledAt: "2026-09-10T00:05:00+08:00" });
    expect(result.rows[0]).toMatchObject({ ds: "2026-09-09", hh: 23, complete: true });
    expect(normalizeAccountHourlySample({ ...input(), hh: 0, sampledAt: "2026-09-09T01:04:59+08:00" }).rows[0]?.complete).toBe(false);
  });
  it("does not infer source UTC offset and accepts safe numeric account IDs", () => {
    const result = normalizeAccountHourlySample({ ...input(), accountIds: ["42"], sourceUtcOffset: "+00:00",
      rows: [{ ...row, account_id: 42 }], sampledAt: "2026-09-09T11:05:00Z" });
    expect(result.rows[0]).toMatchObject({ accountId: "42", lastSyncTime: "2026-09-09T11:03:00.000Z", complete: true });
  });
  it.each([
    { hh: 24 }, { hh: -1 }, { hh: 1.5 }, { hh: "10" }, { accountIds: [] }, { accountIds: ["a", "a"] },
    { workspaceId: "invalid" }, { media: "" }, { ds: "2026-02-31" }, { sourceRunId: "0" },
    { sourceRunId: "9223372036854775808" }, { sourceRunId: 1 }, { sourceUtcOffset: undefined },
    { sourceUtcOffset: "+15:00" }, { sampledAt: "2026-02-31T11:05:00Z" }, { sampledAt: "2026-09-09 11:05:00" },
    { role: "admin" }, { rows: Array(10001).fill(row) },
  ].map((patch, index) => [index, patch] as const))("rejects malformed or unbounded trusted context #%s", (_index, patch) => {
    expect(() => normalizeAccountHourlySample({ ...input(), ...patch })).toThrow("Invalid account hourly sample");
  });
  it.each([
    { account_id: "other" }, { account_id: " a" }, { account_id: Number.MAX_SAFE_INTEGER + 1 },
    { media: "TENCENT" }, { ds: "20260908" }, { ds: null }, { ds: "20260231" },
    { last_sync_time: null }, { last_sync_time: "2026-02-31 12:00:00" }, { last_sync_time: "bad" },
    { account_cost: "" }, { account_cost: "NaN" }, { account_cost: Infinity }, { account_cost: true },
    { account_cost: {} }, { account_cost: -1 }, { account_cost: "1e309" }, { account_exposure: 1.5 },
    { account_click: "9007199254740993" }, { account_real_conversion: false },
  ])("rejects present-invalid or escaped source rows without revealing payload %j", patch => {
    const call = () => normalizeAccountHourlySample({ ...input(), rows: [{ ...row, ...patch, token: "synthetic-private" }] });
    expect(call).toThrow(/^Invalid account hourly sample$/);
  });
  it("rejects duplicate identities and malformed rows atomically", () => {
    for (const rows of [[row, row], [row, null], [row, []], [row, "bad"]])
      expect(() => normalizeAccountHourlySample({ ...input(), rows })).toThrow("Invalid account hourly sample");
  });
});
