import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dataQueryRequestSchema, sourceQueryResultSchema } from "../src/data-query-contract.js";
const authoritative = JSON.parse(readFileSync(new URL("../../contract/fixtures/data-query/dimension-v3-account.json", import.meta.url), "utf8")).data.source;
function source() {
  // The arch row fixture omits the required metadata fields. This test explicitly
  // supplies unknown synthetic lineage, not invented source freshness/version.
  return { ...structuredClone(authoritative), lineage: { ...structuredClone(authoritative.lineage),
    datasetVersion: null, queryTemplateVersion: "test-v1", metricVersion: "test-v1", dataAsOf: null,
    timezone: null, dayCut: null, metadataAvailability: "unknown",
    objectIdentity: { objectType: "account", joinKeys: ["workspace_id", "media", "account_id"] } } };
}
describe("dimension public envelope", () => {
  it("accepts registered syntax and the canonical source dimension property", () => {
    expect(dataQueryRequestSchema.parse({ queryId: "account.dimension", params: { date: "2026-09-01", dimensionType: "account" } }).queryId).toBe("account.dimension");
    expect(sourceQueryResultSchema.parse(source()).rows).toEqual(authoritative.rows);
  });
  it.each(["dimension", "window", "priceSource"])("rejects missing %s", (field) => {
    const value = source();
    if (field === "dimension") delete value.dimension;
    else if (field === "window") delete value.lineage.window;
    else delete value.rows[0].assessment.priceSource;
    expect(sourceQueryResultSchema.safeParse(value).success).toBe(false);
  });
  it("rejects dimension mismatch, duplicate account groups and wrong assessment source", () => {
    for (const mutate of [
      (value: ReturnType<typeof source>) => { value.dimension = "task"; },
      (value: ReturnType<typeof source>) => { value.rows[1] = value.rows[0]; },
      (value: ReturnType<typeof source>) => { value.lineage.workspaceKind = "team"; },
    ]) {
      const value = source(); mutate(value); expect(sourceQueryResultSchema.safeParse(value).success).toBe(false);
    }
  });
});
