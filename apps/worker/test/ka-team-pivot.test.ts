// Synthetic, in-memory source only. No internal network or credentials.
import { describe, expect, it, vi } from "vitest";
import { dataQueryResponseSchema } from "@ka/domain";
import { accountLabelsFromHistory, type AccountLabelsAsOf } from "../src/data/account-labels.js";
import { KaDataClient } from "../src/data/ka-data-client.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";

/**
 * A3（arch 2026-09-13 执行序）：团队空间透视。事实来自 ka-data 成员网格，两根轴的值来自本库昵称解析行，
 * 按每个成员自己的业务日取归属。团队侧未实测，内网验；这里只用内存里的合成网格。
 */
const workspaceId = "00000000-0000-4000-8000-000000000091";
const scope = { workspaceId, userId: "00000000-0000-4000-8000-000000000092", scopeKind: "team_workspace_readonly" as const, accounts: [] };
const registry = createDataQueryRegistry();
const resolve = (dimA: string, dimB: string) =>
  registry.resolve("account.pivot2", { dimA, dimB, dateFrom: "2026-09-01", dateTo: "2026-09-02", media: "KUAISHOU" }, "ka_data");

const member = (ds: string, accountId: string, cash: number | null, conv: number | null = 1) =>
  ({ ds, media: "KUAISHOU", account_id: accountId, observed: 1, cost_yuan: 100, cash_yuan: cash, show: 1000, click: 10, conv, cash_assessment: 10 });
const grid = () => ["a", "b", "c"].flatMap((id) => [member("2026-09-01", id, 20), member("2026-09-02", id, 20)]);
const historyRow = (accountId: string, effectiveFrom: string, owner: string, city = "杭州") => ({
  workspaceId, media: "KUAISHOU", accountId, effectiveFrom,
  mappings: [{ key: "owner", mapsTo: "optimizer", pending: false }, { key: "city", mapsTo: null, pending: false }],
  parse: { ruleVersion: 1, status: "parsed" as const, override: null, conflicts: null, parsedAt: null, nameMatches: true,
    segments: { owner: { key: "owner", value: owner, mapsTo: "optimizer", taskIds: [] }, city: { key: "city", value: city, mapsTo: null, taskIds: [] } } },
});

function setup(rows: unknown[], labels?: AccountLabelsAsOf, envelope: Record<string, unknown> = {}) {
  const fetchFn = vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify({ backend: "sqlite", rowCount: rows.length, rows, ...envelope })));
  const read = vi.fn(async () => labels!);
  const client = new KaDataClient({ baseUrl: "https://ka.test.invalid", token: "synthetic", teamWorkspaceId: workspaceId, fetchFn,
    ...(labels === undefined ? {} : { labels: { read } }) });
  return { client, fetchFn, read };
}
const cells = (result: Awaited<ReturnType<KaDataClient["teamPivot"]>>) =>
  result.source.rows.map((row) => [(row.a as { key: string | null }).key, (row.b as { key: string | null }).key,
    (row.metrics as { cashCost: { value: number | null } }).cashCost.value]);

describe("A3 team pivot", () => {
  it("pivots team account-days by a named dimension against a cleaning segment", async () => {
    const { client, read } = setup(grid(), accountLabelsFromHistory([
      historyRow("a", "2026-08-01", "张三", "杭州"), historyRow("b", "2026-08-01", "李四", "杭州"), historyRow("c", "2026-08-01", "张三", "北京"),
    ]));
    const result = await client.teamPivot(resolve("optimizer", "segment:city"), scope);
    expect(cells(result)).toEqual([["张三", "北京", 40], ["张三", "杭州", 40], ["李四", "杭州", 40]]);
    expect(read).toHaveBeenCalledWith(expect.objectContaining({ workspaceId, from: "2026-09-01", to: "2026-09-02" }));
    expect(result.cellCoverage).toEqual({ cells: 3, withData: 3,
      undeterminable: result.source.rows.filter((row) => (row.assessment as { onTarget: unknown }).onTarget === null).length });
    // 走到 HTTP 之前的最后一道：团队透视的整个信封必须过冻结契约（含 cellCoverage 与格子一致）。
    expect(dataQueryResponseSchema.safeParse({ ok: true, data: { mode: "ka_data", source: result.source }, meta: { cellCoverage: result.cellCoverage } }).success).toBe(true);
  });

  it("splits one account between owners when the window crosses its rename day, and names borrowed days", async () => {
    // v1.9.49 ①：a 9-02 从张三改名李四；c 的第一行在 9-02，9-01 只能借最早已知的张三并点名。
    const { client } = setup(grid(), accountLabelsFromHistory([
      historyRow("a", "2026-09-01", "张三"), historyRow("a", "2026-09-02", "李四"),
      historyRow("b", "2026-08-01", "李四"), historyRow("c", "2026-09-02", "张三"),
    ]));
    const result = await client.teamPivot(resolve("optimizer", "segment:city"), scope);
    // 张三 = a@9-01 + c 两天 = 60；李四 = a@9-02 + b 两天 = 60。
    expect(cells(result)).toEqual([["张三", "杭州", 60], ["李四", "杭州", 60]]);
    expect(result.source.lineage.warnings).toContainEqual(
      { code: "LABEL_BASIS_EARLIEST_KNOWN", media: "KUAISHOU", accountId: "c", businessDate: "2026-09-01" });
    expect(result.source.warnings.every((warning) => typeof warning === "string")).toBe(true);
  });

  it("keeps unlabelled accounts in their own null cell instead of dropping their spend", async () => {
    const { client } = setup(grid(), accountLabelsFromHistory([historyRow("a", "2026-08-01", "张三")]));
    expect(cells(await client.teamPivot(resolve("optimizer", "segment:city"), scope))).toEqual([[null, null, 80], ["张三", "杭州", 40]]);
  });

  it("says the view is unsupported when no label reader is wired, without calling the source", async () => {
    const { client, fetchFn } = setup(grid());
    await expect(client.teamPivot(resolve("optimizer", "goal"), scope)).rejects.toMatchObject({ code: "VIEW_UNSUPPORTED" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a personal scope and a foreign team binding before calling the source", async () => {
    const { client, fetchFn } = setup(grid(), accountLabelsFromHistory([]));
    await expect(client.teamPivot(resolve("optimizer", "goal"), { ...scope, scopeKind: "explicit_accounts" as never })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(client.teamPivot(resolve("optimizer", "goal"), { ...scope, workspaceId: "00000000-0000-4000-8000-000000000099" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("keeps the team coverage caveat and fails closed on a truncated grid", async () => {
    const { client } = setup(grid(), accountLabelsFromHistory([historyRow("a", "2026-08-01", "张三")]));
    const result = await client.teamPivot(resolve("optimizer", "goal"), scope);
    expect(result.source.lineage).toMatchObject({ workspaceKind: "team", partial: true, coverage: { complete: false } });
    expect(result.source.wholeResultTotal).toMatchObject({ availability: "partial" });
    const truncated = setup(grid(), accountLabelsFromHistory([]), { rowCount: 999 });
    await expect(truncated.client.teamPivot(resolve("optimizer", "goal"), scope)).rejects.toMatchObject({ code: "SOURCE_TRUNCATED" });
  });
});

describe("A3 team pivot admission", () => {
  const params = { dimA: "optimizer", dimB: "segment:city", dateFrom: "2026-09-01", dateTo: "2026-09-02", media: "KUAISHOU" };
  it("admits label dimensions and cleaning segments for the team source", () => {
    expect(registry.resolve("account.pivot2", params, "ka_data").params).toMatchObject({ dimA: "optimizer", dimB: "segment:city" });
  });
  it.each(["account", "task", "biz"])("refuses the fact-side %s axis for the team source", (dim) => {
    expect(() => registry.resolve("account.pivot2", { ...params, dimB: dim }, "ka_data"))
      .toThrowError(expect.objectContaining({ code: "DIMENSION_UNSUPPORTED", message: expect.stringContaining("team source") }));
    // 个人源照旧支持。
    expect(registry.resolve("account.pivot2", { ...params, dimB: dim }, "platform").params).toMatchObject({ dimB: dim });
  });
  it("refuses task and dashboard filters for the team source instead of silently ignoring them", () => {
    expect(() => registry.resolve("account.pivot2", { ...params, taskIds: ["t1"] }, "ka_data"))
      .toThrowError(expect.objectContaining({ code: "VIEW_UNSUPPORTED" }));
    expect(() => registry.resolve("account.pivot2", { ...params, filters: { biz: ["b"] } }, "ka_data"))
      .toThrowError(expect.objectContaining({ code: "VIEW_UNSUPPORTED" }));
  });
});
