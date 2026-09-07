import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sourceQueryResultSchema } from "../src/data-query-contract.js";

function source() {
  // Synthetic v1.7.4 candidate; direct arch parity tests remain unchanged and fail until P068 is resolved.
  const fixture = JSON.parse(readFileSync(new URL("../../contract/fixtures/data-query/summary-window-v3-green.json", import.meta.url), "utf8"));
  fixture.data.source.rows[0].assessment.priceSource = "history";
  return fixture.data.source;
}
describe("public window v3 boundary", () => {
  it("accepts the frozen v3 shape and refuses a v2 summary", () => {
    expect(sourceQueryResultSchema.safeParse(source()).success).toBe(true);
    const old = source(); old.rowSchemaVersion = "account.summary/v2"; delete old.rows[0].assessment;
    expect(sourceQueryResultSchema.safeParse(old).success).toBe(false);
  });
  it("requires a query window for v3 and rejects price source/workspace mismatch", () => {
    const without = source(); delete without.lineage.window;
    expect(sourceQueryResultSchema.safeParse(without).success).toBe(false);
    const mismatch = source(); mismatch.lineage.workspaceKind = "team";
    expect(sourceQueryResultSchema.safeParse(mismatch).success).toBe(false);
  });
  it("accepts only flat v3 trend metrics within the lineage window", () => {
    const row = source(); row.queryId = "account.trend"; row.rowSchemaVersion = "account.trend/v3";
    row.rows = [{ ds: "2026-09-01", metrics: row.rows[0].metrics }];
    expect(sourceQueryResultSchema.safeParse(row).success).toBe(true);
    row.rows[0].ds = "2026-08-31";
    expect(sourceQueryResultSchema.safeParse(row).success).toBe(false);
  });
});
