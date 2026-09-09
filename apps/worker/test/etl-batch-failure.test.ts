import { describe, expect, it } from "vitest";
import { batchFailureWarning } from "../src/etl/batch-failure.js";
import { BlockedAuthError, QihangBusinessError, QihangHttpError, QihangProtocolError, QihangResourceLimitError, QihangSuspectedTruncationError, RetryExhaustedError } from "../src/qihang/errors.js";
import type { QihangQuery } from "../src/qihang/client.js";
const workspaceId = "11111111-1111-4111-8111-111111111111";
const query: QihangQuery = { resource: "account_realtime", media: "KUAISHOU", userId: "synthetic-private-qid", ds: "2026-09-09", accountIds: ["b", "a"] };
const exhausted = () => new RetryExhaustedError(4, { cause: new QihangProtocolError("synthetic-private-body") });
describe("strict retry-exhausted batch warning mapper", () => {
  it("uses only public batch facts and stable scope-sensitive SHA, never raw error or qid", () => {
    const result = batchFailureWarning(workspaceId, query, exhausted());
    expect(result).toEqual({ code: "BATCH_FAILED", resource: "account_realtime", ds: "2026-09-09", accountIds: ["a", "b"], fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(JSON.stringify(result)).not.toContain("synthetic-private");
    expect(batchFailureWarning(workspaceId, { ...query, userId: "another", accountIds: ["a", "b"] }, exhausted())).toEqual(result);
    for (const changed of [{ ...query, media: "TENCENT" }, { ...query, ds: "2026-09-08" }])
      expect(batchFailureWarning(workspaceId, changed, exhausted())?.fingerprint).not.toBe(result?.fingerprint);
    expect(batchFailureWarning("22222222-2222-4222-8222-222222222222", query, exhausted())?.fingerprint).not.toBe(result?.fingerprint);
  });
  it.each([new Error("db failure"), new BlockedAuthError("private"), new QihangResourceLimitError("private"), new QihangSuspectedTruncationError(2000, 2000), new QihangBusinessError("ACL", "private")])("never swallows auth/limits/business/persistence errors", error => {
    expect(batchFailureWarning(workspaceId, query, error)).toBeNull();
    expect(batchFailureWarning(workspaceId, query, new RetryExhaustedError(4, { cause: error instanceof Error && error.constructor === Error ? new BlockedAuthError("private") : error }))).toBeNull();
  });
  it("accepts typed exhausted network and retryable HTTP but not nonretryable HTTP", () => {
    for (const cause of [new TypeError("fetch failed private"), new QihangHttpError(503, "private")])
      expect(batchFailureWarning(workspaceId, query, new RetryExhaustedError(4, { cause }))?.code).toBe("BATCH_FAILED");
    expect(batchFailureWarning(workspaceId, query, new RetryExhaustedError(4, { cause: new QihangHttpError(404, "private") }))).toBeNull();
  });
  it("requires explicit media/accounts and one real day; metadata discovery never becomes partial", () => {
    for (const patch of [{ media: undefined }, { accountIds: [] }, { ds: "2026-02-31" }])
      expect(() => batchFailureWarning(workspaceId, { ...query, ...patch } as QihangQuery, exhausted())).toThrow("Invalid ETL batch failure");
    expect(batchFailureWarning(workspaceId, { resource: "account", userId: "private", media: "KUAISHOU" }, exhausted())).toBeNull();
    expect(() => batchFailureWarning(workspaceId, { resource: "account_offline", userId: "private", media: "KUAISHOU", accountIds: ["a"], beginDate: "2026-09-01", endDate: "2026-09-09" }, exhausted())).toThrow();
  });
  it("supports one-day offline and preserves hh/adIds in the fingerprint only", () => {
    expect(batchFailureWarning(workspaceId, { resource: "account_offline", userId: "private", media: "KUAISHOU", accountIds: ["a"], beginDate: "2026-09-09", endDate: "2026-09-09" }, exhausted())?.ds).toBe("2026-09-09");
    const ad: QihangQuery = { ...query, resource: "ad_realtime", hh: 2, adIds: ["ad1"] };
    expect(batchFailureWarning(workspaceId, ad, exhausted())?.fingerprint).not.toBe(batchFailureWarning(workspaceId, { ...ad, hh: 3 }, exhausted())?.fingerprint);
    expect(batchFailureWarning(workspaceId, ad, exhausted())?.fingerprint).not.toBe(batchFailureWarning(workspaceId, { ...ad, adIds: ["ad2"] }, exhausted())?.fingerprint);
    expect(batchFailureWarning(workspaceId, { ...query, resource: "ad_realtime" }, exhausted())?.code).toBe("BATCH_FAILED");
    expect(batchFailureWarning(workspaceId, { ...ad, hh: "2" }, exhausted())).toEqual(batchFailureWarning(workspaceId, ad, exhausted()));
  });
  it.each([{ hh: 25 }, { hh: -1 }, { hh: 0.5 }, { adIds: "not-an-array" }, { adIds: ["\n"] }, { adIds: [42] }, { adIds: Array(1001).fill("ad") }])("invalid ad batch details are never recorded %j", patch => {
    expect(() => batchFailureWarning(workspaceId, { ...query, resource: "ad_realtime", ...patch } as QihangQuery, exhausted())).toThrow("Invalid ETL batch failure");
  });
});
