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
    // 空间性质与考核价来源必须对得上。v1.9.41 重导后这份 fixture 是**个人空间**的真响应
    // （pivot2 只有个人/platform 这一条路，`platform-data-source.pivot` 与 `query-service`
    // 两处都挡 team），价来自 history；把它改标成 team 就与 ka_daily 的口径对不上了。
    const mismatch = await source(); mismatch.lineage.workspaceKind = "team";
    expect(sourceQueryResultSchema.safeParse(mismatch).success).toBe(false);
  });
  it("rejects duplicate cells and present-invalid metrics", async () => {
    const input = await source(); input.rows.push(structuredClone(input.rows[0])); input.returnedRowCount++;
    expect(sourceQueryResultSchema.safeParse(input).success).toBe(false);
    const invalid = await source(); invalid.rows[0].metrics.cost.value = "not-a-number";
    expect(sourceQueryResultSchema.safeParse(invalid).success).toBe(false);
  });
  it("requires finite bounded cell coverage without inferring it from source rows", async () => {
    const input = { ok: true, data: { mode: "platform", source: await source() },
      // v1.9.41 重导后这份 fixture 是两格、都有数、没有不可判定的格子的真响应。
      meta: { cellCoverage: { cells: 2, withData: 2, undeterminable: 0 } } };
    expect(dataQueryResponseSchema.safeParse(input).success).toBe(true);
    expect(dataQueryResponseSchema.safeParse({ ok: true, data: input.data }).success).toBe(false);
    // 格数对不上行数、有数的格多过总格数、凭空多出不可判定的格子、类型不对：一律拒。
    // 这些数字**必须由响应自己的行推出来**，不能让调用方随手填一个覆盖度。
    for (const coverage of [{ cells: 3, withData: 2, undeterminable: 0 }, { cells: 2, withData: 3, undeterminable: 0 },
      { cells: 2, withData: 2, undeterminable: 1 }, { cells: 2, withData: "2", undeterminable: 0 }]) {
      expect(dataQueryResponseSchema.safeParse({ ...input, meta: { cellCoverage: coverage } }).success).toBe(false);
    }
  });
});
