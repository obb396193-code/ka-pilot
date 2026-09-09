import { describe, expect, it } from "vitest";
import { etlBatchFailureWarningSchema, etlBatchScopeSchema } from "../src/etl-batch-failure.js";

const warning = { code: "BATCH_FAILED", resource: "account_realtime", ds: "2026-09-09", accountIds: ["synthetic-a"], fingerprint: "a".repeat(64) };
const scope = { workspaceId: "11111111-1111-4111-8111-111111111111", media: "KUAISHOU", accountIds: ["synthetic-a"], dateFrom: "2026-09-01", dateTo: "2026-09-09" };
describe("ETL batch failure strict internal/public contracts", () => {
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
