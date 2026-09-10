import { describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@ka/db";
import type { QihangQuery } from "../src/qihang/client.js";
import { partialExecution, accountQueryBatches, queryWithBatchFailure } from "../src/etl/partial-query.js";
import { RetryExhaustedError } from "../src/qihang/errors.js";
const ws = "11111111-1111-4111-8111-111111111111", id = "22222222-2222-4222-8222-222222222222";
const query: QihangQuery = { resource: "account_realtime", userId: "synthetic", media: "KUAISHOU", accountIds: ["a"], ds: "2026-09-10" };
function setup() {
  const failures = { record: vi.fn().mockResolvedValue({ recorded: true }) };
  const job = { workspaceId: ws, id, leaseToken: id } as JobRecord;
  const execution = partialExecution(job, { workspaceId: ws, media: "KUAISHOU", accountIds: ["a"], dateFrom: "2026-09-10", dateTo: "2026-09-10" }, failures)!;
  return { execution, failures, job };
}
describe("partial-query safety boundary", () => {
  it("without explicit recorder preserves fail-stop and without metadata batching", async () => {
    expect(partialExecution({} as JobRecord, {})).toBeUndefined(); expect(accountQueryBatches(query)).toEqual([query]);
    const error = new RetryExhaustedError(4), port = { query: vi.fn().mockRejectedValue(error) };
    await expect(queryWithBatchFailure(port, query, "123")).rejects.toBe(error);
    const metadata: QihangQuery = { resource: "account", userId: "synthetic" }, s = setup();
    expect(accountQueryBatches(metadata, s.execution)).toEqual([metadata]);
    await expect(queryWithBatchFailure(port, metadata, "123", s.execution)).rejects.toBe(error);
    expect(s.failures.record).not.toHaveBeenCalled();
  });
  it("freezes independent scope, rejects identity mismatch and absent explicit accounts", () => {
    const s = setup();
    expect(() => partialExecution({ ...s.job, workspaceId: id }, s.execution.scope, s.failures)).toThrow();
    expect(() => accountQueryBatches({ ...query, accountIds: [] }, s.execution)).toThrow();
  });
  it.each([{ media: "TENCENT" }, { accountIds: [] }, { accountIds: ["foreign"] }, { ds: "2026-09-09" }, { ds: "2026-09-11" }])("bad query %j is rejected before source", async patch => {
    const s = setup(), port = { query: vi.fn() };
    await expect(queryWithBatchFailure(port, { ...query, ...patch }, "123", s.execution)).rejects.toThrow("escaped");
    expect(port.query).not.toHaveBeenCalled(); expect(s.failures.record).not.toHaveBeenCalled();
  });
  it.each([{ account_id: "foreign" }, { media: "TENCENT" }, { ds: "2026-02-31" }, { ds: "20260909" }])("bad source row %j is not recorded as retryable failure", async patch => {
    const s = setup(), port = { query: vi.fn().mockResolvedValue({ rows: [{ account_id: "a", ds: "20260910", ...patch }], envelope: {} }) };
    await expect(queryWithBatchFailure(port, query, "123", s.execution)).rejects.toThrow("escaped"); expect(s.failures.record).not.toHaveBeenCalled();
  });
  it("accepts compact-day rows, only offline single-day queries, and retains private ad filters", async () => {
    const s = setup(), success = { rows: [{ account_id: "a", ds: "20260910", media: "KUAISHOU" }], envelope: {} }, port = { query: vi.fn().mockResolvedValue(success) };
    expect(await queryWithBatchFailure(port, query, "123", s.execution)).toBe(success);
    const offline: QihangQuery = { resource: "account_offline", userId: "synthetic", media: "KUAISHOU", accountIds: ["a"], beginDate: "2026-09-10", endDate: "2026-09-11" };
    await expect(queryWithBatchFailure(port, offline, "123", s.execution)).rejects.toThrow("escaped");
    const ad: QihangQuery = { ...query, resource: "ad_realtime", hh: "2", adIds: ["ad-a"] };
    expect(accountQueryBatches(ad, s.execution)).toEqual([ad]);
    port.query.mockRejectedValue(new RetryExhaustedError(4, { cause: new TypeError("network") }));
    expect(await queryWithBatchFailure(port, ad, "123", s.execution)).toBeNull();
    expect(s.failures.record).toHaveBeenCalledWith(expect.objectContaining({ filters: { hh: 2, adIds: ["ad-a"] } }));
  });
  it("hourly account failure is fail-stop until separate hourly coverage exists", async () => {
    const s = setup(), error = new RetryExhaustedError(4), port = { query: vi.fn().mockRejectedValue(error) };
    await expect(queryWithBatchFailure(port, { ...query, hh: 3 }, "123", s.execution)).rejects.toBe(error);
    expect(s.failures.record).not.toHaveBeenCalled();
  });
  it("requested ad IDs cannot be widened by returned source rows", async () => {
    const s = setup(), port = { query: vi.fn().mockResolvedValue({ rows: [{ account_id: "a", ad_id: "foreign", ds: "20260910" }], envelope: {} }) };
    await expect(queryWithBatchFailure(port, { ...query, resource: "ad_realtime", adIds: ["wanted"] }, "123", s.execution)).rejects.toThrow("escaped");
    expect(s.failures.record).not.toHaveBeenCalled();
  });
});
