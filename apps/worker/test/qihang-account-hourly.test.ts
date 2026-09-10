import { describe, expect, it, vi } from "vitest";
import { QihangClient, type QihangQuery } from "../src/qihang/client.js";
import { createQihangObservation } from "../src/qihang/observation.js";
import { replayRequestParams } from "../src/etl/replay-params.js";
import { toEtlQueryObservation } from "../src/etl/query-observation.js";
import { batchFailureWarning } from "../src/etl/batch-failure.js";
import { QihangProtocolError, RetryExhaustedError } from "../src/qihang/errors.js";

const base = { resource: "account_realtime" as const, userId: "synthetic-private",
  media: "KUAISHOU", accountIds: ["synthetic-a"], ds: "2026-09-09" };
describe("account realtime cumulative hour transport", () => {
  it.each([0, 13, 23, 24, "0", "13", "23", "24"])("passes validated hh=%s to the account source and audit observation", async hh => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ successful: true, data: [] })));
    const query = { ...base, hh };
    const result = await new QihangClient({ fetchFn }).query(query);
    const url = new URL(fetchFn.mock.calls[0]![0] as string);
    expect(url.searchParams.get("resource")).toBe("account_realtime");
    expect(url.searchParams.get("ds")).toBe("20260909");
    expect(url.searchParams.get("hh")).toBe(String(hh));
    expect(toEtlQueryObservation(query, result.observation!)).toMatchObject({ hh, ds: base.ds, rowCount: 0 });
    expect(replayRequestParams(query)).toEqual({ media: base.media, accountIds: base.accountIds, ds: base.ds, hh });
    expect(JSON.stringify(toEtlQueryObservation(query, result.observation!))).not.toContain(base.userId);
  });
  it.each([-1, 25, 1.5, "-1", "25", "1.5", "", "invalid", null, true])("rejects invalid hh=%s before fetch", async hh => {
    const fetchFn = vi.fn<typeof fetch>();
    await expect(new QihangClient({ fetchFn, maxRetries: 0 }).query({ ...base, hh } as QihangQuery)).rejects.toThrow(/hh.*0.*24/);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("keeps existing day-only calls unchanged", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ successful: true, data: [] })));
    const result = await new QihangClient({ fetchFn }).query(base);
    expect(new URL(fetchFn.mock.calls[0]![0] as string).searchParams.has("hh")).toBe(false);
    expect(toEtlQueryObservation(base, result.observation!)).not.toHaveProperty("hh");
  });
  it("preserves offline intervals and ad hours without adding dimensions to metadata discovery", () => {
    const inputs: QihangQuery[] = [
      { resource: "account_offline", userId: base.userId, beginDate: base.ds, endDate: base.ds },
      { ...base, resource: "ad_realtime", hh: 13 },
      { resource: "account", userId: base.userId },
    ];
    const dimensions = [{ beginDate: base.ds, endDate: base.ds }, { ds: base.ds, hh: 13 }, {}];
    inputs.forEach((query, index) => {
      const observation = createQihangObservation(query.resource, [], new Date("2026-09-09T00:00:00Z"));
      expect(toEtlQueryObservation(query, observation)).toEqual({ ...observation, ...dimensions[index] });
    });
  });
  it("does not silently erase account hour coverage into a daily failure warning", () => {
    const error = new RetryExhaustedError(4, { cause: new QihangProtocolError("synthetic") });
    expect(batchFailureWarning("11111111-1111-4111-8111-111111111111", { ...base, hh: 12 } as QihangQuery, error)).toBeNull();
    expect(batchFailureWarning("11111111-1111-4111-8111-111111111111", base, error)?.code).toBe("BATCH_FAILED");
  });
});
