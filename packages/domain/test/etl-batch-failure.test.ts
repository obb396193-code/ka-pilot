import { describe, expect, it } from "vitest";
import { etlBatchFailureEvidenceSchema, etlBatchFailureWarningSchema, etlBatchScopeSchema, recordEtlBatchFailureSchema } from "../src/etl-batch-failure.js";

const warning = { code: "BATCH_FAILED", resource: "account_realtime", ds: "2026-09-09", accountIds: ["synthetic-a"], fingerprint: "a".repeat(64) };
const scope = { workspaceId: "11111111-1111-4111-8111-111111111111", media: "KUAISHOU", accountIds: ["synthetic-a"], dateFrom: "2026-09-01", dateTo: "2026-09-09" };
describe("ETL batch failure strict internal/public contracts", () => {
  it("keeps ad request coverage private and rejects invalid/irrelevant filters", () => {
    const evidence = { ...warning, resource: "ad_realtime", media: "KUAISHOU", failedAt: "2026-09-09T00:00:00Z", filters: { hh: 14, adIds: ["ad-a"] } };
    expect(etlBatchFailureEvidenceSchema.parse(evidence)).toEqual(evidence);
    expect(etlBatchFailureWarningSchema.safeParse({ ...warning, filters: evidence.filters }).success).toBe(false);
    for (const filters of [{ hh: 25 }, { hh: "14" }, { hh: null }, { adIds: [] }, { adIds: ["a", "a"] }, { adIds: ["a\n"] }, { userId: "private" }]) {
      expect(etlBatchFailureEvidenceSchema.safeParse({ ...evidence, filters }).success).toBe(false);
    }
    expect(etlBatchFailureEvidenceSchema.safeParse({ ...evidence, resource: "account_realtime" }).success).toBe(false);
    const record = { workspaceId: scope.workspaceId, jobId: scope.workspaceId, leaseToken: scope.workspaceId, runId: "1", warning };
    expect(recordEtlBatchFailureSchema.safeParse({ ...record, filters: { hh: 1 } }).success).toBe(false);
    expect(recordEtlBatchFailureSchema.safeParse({ ...record, warning: { ...warning, resource: "ad_realtime" }, filters: { hh: 0 } }).success).toBe(true);
  });
  it("accepts the frozen warning and explicit trusted scope without changing their shape", () => {
    expect(etlBatchFailureWarningSchema.parse(warning)).toEqual(warning);
    expect(etlBatchScopeSchema.parse(scope)).toEqual(scope);
  });
  it.each([
    { userId: "synthetic-private" }, { resource: "account" }, { ds: "2026-02-31" },
    { accountIds: [] }, { accountIds: ["a", "a"] }, { accountIds: ["a\n"] },
    { accountIds: Array.from({ length: 1001 }, (_, n) => `a${n}`) }, { fingerprint: "abc" }, { code: "FAILED" },
  ])("rejects malformed/present-invalid warnings %j", patch => {
    expect(etlBatchFailureWarningSchema.safeParse({ ...warning, ...patch }).success).toBe(false);
  });
  it.each([
    { media: "" }, { media: "KUAISHOU\n" }, { workspaceId: "not-uuid" }, { role: "admin" },
    { dateFrom: "2026-09-10" }, { dateTo: "2026-02-31" }, { dateFrom: "2026-07-01" }, { accountIds: [] },
  ])("rejects unbounded/invalid internal scope %j", patch => {
    expect(etlBatchScopeSchema.safeParse({ ...scope, ...patch }).success).toBe(false);
  });
});
