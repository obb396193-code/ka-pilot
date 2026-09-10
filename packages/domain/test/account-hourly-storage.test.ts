import { describe, expect, it } from "vitest";
import { accountHourlyStorageBatchSchema } from "../src/account-hourly-storage.js";

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
