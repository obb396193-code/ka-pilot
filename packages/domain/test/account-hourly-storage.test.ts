import { describe, expect, it } from "vitest";
import { accountHourlyStorageBatchSchema } from "../src/account-hourly-storage.js";
import { sourceUtcOffsetFor } from "../src/account-hourly-sample.js";

const ws = "00000000-0000-4000-8000-000000000001";
const row = { workspaceId: ws, media: "KUAISHOU", accountId: "a", ds: "2026-09-10", hh: 9,
  cost: 0, exposure: null, click: null, conversion: null, realConversion: null, budget: null,
  lastSyncTime: "2026-09-10T02:02:00Z", sampledAt: "2026-09-10T02:05:00Z", complete: true, sourceRunId: "1" };
const input = () => ({ workspaceId: ws, jobId: ws, leaseToken: ws, runId: "1", media: "KUAISHOU",
  accountIds: ["a", "b"], ds: row.ds, hh: 9, sampledAt: row.sampledAt, sourceUtcOffset: "+08:00",
  rows: [row], rawRows: [{ account_id: "a", ds: "20260910", account_cost: 0, last_sync_time: "2026-09-10 10:02:00" }] });

describe("private hourly persistence boundary", () => {
  it("keeps zero distinct from null and permits an absent requested account", () => {
    expect(accountHourlyStorageBatchSchema.parse(input()).rows).toEqual([row]);
  });
  it.each([
    { workspaceId: "00000000-0000-4000-8000-000000000002" }, { media: "TENCENT" }, { accountId: "c" },
    { ds: "2026-09-09" }, { hh: 8 }, { cost: NaN }, { cost: Infinity }, { cost: -1 }, { cost: "0" },
    { exposure: 1.5 }, { exposure: Number.MAX_SAFE_INTEGER + 1 }, { complete: false }, { complete: "false" },
    { sourceRunId: "2" }, { sampledAt: "2026-09-10T02:04:59Z" }, { lastSyncTime: "2026-02-31T00:00:00Z" },
  ])("rejects malformed or escaped normalized row %j", patch => {
    expect(accountHourlyStorageBatchSchema.safeParse({ ...input(), rows: [{ ...row, ...patch }] }).success).toBe(false);
  });
  it.each([
    { hh: 24 }, { ds: "2026-02-31" }, { runId: "9223372036854775808" }, { accountIds: [] },
    { accountIds: ["a", "a"] }, { sourceUtcOffset: "+15:00" }, { rows: [row, row] },
    { rawRows: [] }, { rawRows: [{ account_id: "c", ds: row.ds }] },
    { rawRows: [{ account_id: "a", ds: "20260909" }] }, { rawRows: [{ account_id: "a", ds: row.ds, media: "TENCENT" }] },
    { accountIds: Array.from({ length: 51 }, (_, n) => String(n)) }, { extra: "not-allowed" },
  ])("rejects invalid context or mismatched raw set %j", patch => {
    expect(accountHourlyStorageBatchSchema.safeParse({ ...input(), ...patch }).success).toBe(false);
  });
  it("accepts equivalent ISO timestamp offsets without relaxing sample identity", () => {
    expect(accountHourlyStorageBatchSchema.safeParse({ ...input(), rows: [{ ...row, sampledAt: "2026-09-10T10:05:00+08:00" }] }).success).toBe(true);
  });
  it("permits early samples only with complete=false", () => {
    const sampledAt = "2026-09-10T02:04:59Z";
    expect(accountHourlyStorageBatchSchema.safeParse({ ...input(), sampledAt, rows: [{ ...row, sampledAt, complete: false }] }).success).toBe(true);
  });
  it("rejects normalized metrics or timestamps that contradict the same raw evidence", () => {
    expect(accountHourlyStorageBatchSchema.safeParse({ ...input(), rows: [{ ...row, cost: 99 }] }).success).toBe(false);
    expect(accountHourlyStorageBatchSchema.safeParse({ ...input(), rows: [{ ...row, lastSyncTime: "2026-09-10T01:59:00Z" }] }).success).toBe(false);
  });
});

/**
 * v1.9.47（Q-042）：按天算出源时区的 UTC 偏移。
 *
 * 采样要拿它判断「这个小时过完了没有」（`complete`）。配一个固定偏移在有夏令时的地区
 * 会在切换日当天把整整一小时判错，而 `complete=false` 的行会被下一轮覆盖——
 * 判错就意味着一个已定格的小时被当成还在变，或者反过来。
 */
describe("v1.9.47 source UTC offset for a business date", () => {
  it("follows daylight saving instead of pinning one number", () => {
    expect(sourceUtcOffsetFor("America/New_York", "2026-01-15")).toBe("-05:00");
    expect(sourceUtcOffsetFor("America/New_York", "2026-07-15")).toBe("-04:00");
  });

  it("handles whole, half and zero offsets", () => {
    expect(sourceUtcOffsetFor("Asia/Shanghai", "2026-09-12")).toBe("+08:00");
    expect(sourceUtcOffsetFor("Asia/Kolkata", "2026-09-12")).toBe("+05:30");
    expect(sourceUtcOffsetFor("UTC", "2026-09-12")).toBe("+00:00");
  });

  it("returns null rather than guessing when the zone is absent or unusable", () => {
    // 没配就别采——用服务器本地时区蒙一个，会把 complete 判错且没人看得出来。
    expect(sourceUtcOffsetFor(null, "2026-09-12")).toBeNull();
    expect(sourceUtcOffsetFor("Not/AZone", "2026-09-12")).toBeNull();
    expect(sourceUtcOffsetFor("Asia/Shanghai", "not-a-date")).toBeNull();
  });

  it("produces a value the storage contract accepts", () => {
    // 形状要能过 accountHourlyStorageBatchSchema 的 sourceUtcOffset 正则，否则采了也写不进去。
    for (const zone of ["Asia/Shanghai", "Asia/Kolkata", "UTC", "America/New_York"]) {
      expect(sourceUtcOffsetFor(zone, "2026-09-12"))
        .toMatch(/^[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00)$/);
    }
  });
});
