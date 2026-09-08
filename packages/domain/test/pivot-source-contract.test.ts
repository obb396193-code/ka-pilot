import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { dataQueryIdSchema, sourceQueryResultSchema, dataQueryResponseSchema } from "../src/data-query-contract.js";

async function source() {
  return JSON.parse(await readFile(new URL("../../contract/fixtures/data-query/pivot2.json", import.meta.url), "utf8")).data.source;
}
describe("pivot2 canonical source envelope", () => {
  it("admits the frozen Query ID and fixture source, not a source availability claim", async () => {
    expect(dataQueryIdSchema.safeParse("account.pivot2").success).toBe(true);
    const input = await source(); expect(sourceQueryResultSchema.parse(input)).toEqual(input);
  });
  it.each(["dimA", "dimB", "rowSchemaVersion"])("requires %s", async key => {
    const input = await source(); delete input[key]; expect(sourceQueryResultSchema.safeParse(input).success).toBe(false);
  });
  it("requires a window and the matching source of price", async () => {
    const input = await source(); delete input.lineage.window; expect(sourceQueryResultSchema.safeParse(input).success).toBe(false);
    const mismatch = await source(); mismatch.lineage.workspaceKind = "personal";
    expect(sourceQueryResultSchema.safeParse(mismatch).success).toBe(false);
  });
  it("rejects duplicate cells and present-invalid metrics", async () => {
    const input = await source(); input.rows.push(structuredClone(input.rows[0])); input.returnedRowCount++;
    expect(sourceQueryResultSchema.safeParse(input).success).toBe(false);
    const invalid = await source(); invalid.rows[0].metrics.cost.value = "not-a-number";
    expect(sourceQueryResultSchema.safeParse(invalid).success).toBe(false);
  });
  it("requires finite bounded cell coverage without inferring it from source rows", async () => {
    const input = { ok: true, data: { mode: "ka_data", source: await source() },
      meta: { cellCoverage: { cells: 3, withData: 2, undeterminable: 1 } } };
    expect(dataQueryResponseSchema.safeParse(input).success).toBe(true);
    expect(dataQueryResponseSchema.safeParse({ ok: true, data: input.data }).success).toBe(false);
    for (const coverage of [{ cells: 2, withData: 2, undeterminable: 1 }, { cells: 3, withData: 4, undeterminable: 1 },
      { cells: 3, withData: 2, undeterminable: 0 }, { cells: 3, withData: "2", undeterminable: 1 }]) {
      expect(dataQueryResponseSchema.safeParse({ ...input, meta: { cellCoverage: coverage } }).success).toBe(false);
    }
  });
});
