import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dataQueryRequestSchema, sourceQueryResultSchema } from "../src/data-query-contract.js";
const authoritative = JSON.parse(readFileSync(new URL("../../contract/fixtures/data-query/dimension-v3-account.json", import.meta.url), "utf8")).data.source;
function source() {
  // arch 56fd109 now supplies the complete canonical source envelope.
  return structuredClone(authoritative);
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
