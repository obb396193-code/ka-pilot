// Synthetic, in-memory source only. No internal network or credentials.
import { describe, expect, it, vi } from "vitest";
import { KaDataClient } from "../src/data/ka-data-client.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";

/**
 * v1.9.46（Q-041 ⑧）：团队源按命名维度/清洗段分组。
 *
 * 事实来自 ka-data 的成员网格，**标签来自我们自己的库**——团队账户的昵称解析行在我们这边，
 * ka-data 没有。所以这条路要两样东西同时到位，缺标签读取器时必须**明说不支持**，
 * 不能悄悄退回「全部归未标注」：那在页面上跟「这批账户真的都没标注」长得一模一样。
 */
const workspaceId = "00000000-0000-4000-8000-000000000081";
const scope = { workspaceId, userId: "00000000-0000-4000-8000-000000000082",
  scopeKind: "team_workspace_readonly" as const, accounts: [] };
const window = { from: "2026-09-01", to: "2026-09-02" };
const registry = createDataQueryRegistry();
const resolve = (dimensionType: string) =>
  registry.resolve("account.dimension", { dateFrom: window.from, dateTo: window.to, dimensionType }, "ka_data");

const member = (ds: string, accountId: string, cash: number | null, conv: number | null = 1) =>
  ({ ds, media: "KUAISHOU", account_id: accountId, observed: 1, cost_yuan: 100, cash_yuan: cash,
    show: 1000, click: 10, conv, cash_assessment: 10 });
const grid = () => ["a", "b", "c"].flatMap((id) =>
  [member("2026-09-01", id, 20), member("2026-09-02", id, 20)]);

function setup(rows: unknown[], labels?: Record<string, Record<string, string | null>>) {
  const fetchFn = vi.fn<typeof fetch>(async () =>
    new Response(JSON.stringify({ backend: "sqlite", rowCount: rows.length, rows })));
  const client = new KaDataClient({
    baseUrl: "https://ka.test.invalid", token: "synthetic", teamWorkspaceId: workspaceId, fetchFn,
    ...(labels === undefined ? {} : { labels: { read: async () => new Map(Object.entries(labels)) } }),
  });
  return { client, fetchFn };
}

describe("v1.9.46 team dimension grouping", () => {
  const labels = {
    "KUAISHOU:a": { optimizer: "张三", "segment:city": "杭州" },
    "KUAISHOU:b": { optimizer: "李四", "segment:city": "杭州" },
    "KUAISHOU:c": { optimizer: "张三", "segment:city": "北京" },
  };

  it("groups team account-days by a named dimension", async () => {
    const { client } = setup(grid(), labels);
    const result = await client.query(resolve("optimizer"), scope);
    expect(result.dimension).toBe("optimizer");
    // 张三 两户 × 两天 × 20 = 80；李四 一户 × 两天 × 20 = 40。
    expect(result.rows).toMatchObject([
      { key: "张三", metrics: { cashCost: { value: 80 } } },
      { key: "李四", metrics: { cashCost: { value: 40 } } },
    ]);
  });

  it("groups by an arbitrary cleaning segment too", async () => {
    const { client } = setup(grid(), labels);
    const result = await client.query(resolve("segment:city"), scope);
    expect(result.rows).toMatchObject([
      { key: "北京", metrics: { cashCost: { value: 40 } } },
      { key: "杭州", metrics: { cashCost: { value: 80 } } },
    ]);
  });

  it("puts an unlabelled account in its own bucket instead of dropping its spend", async () => {
    const { client } = setup(grid(), { "KUAISHOU:a": { optimizer: "张三" } });
    const result = await client.query(resolve("optimizer"), scope);
    // b 与 c 没标注：归 key=null 的「未标注」桶，它们的 80 块不会凭空消失。
    expect(result.rows).toMatchObject([
      { key: null, label: "未标注", metrics: { cashCost: { value: 80 } } },
      { key: "张三", metrics: { cashCost: { value: 40 } } },
    ]);
  });

  it("says the view is unsupported when no label reader is wired, rather than reporting everything unlabelled", async () => {
    const { client, fetchFn } = setup(grid());
    await expect(client.query(resolve("optimizer"), scope)).rejects.toMatchObject({ code: "VIEW_UNSUPPORTED" });
    // 连源都不该去打——缺的是我们自己这半，不是对面的。
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("keeps the team coverage caveat rather than claiming a complete inventory", async () => {
    const { client } = setup(grid(), labels);
    const result = await client.query(resolve("optimizer"), scope);
    expect(result.lineage).toMatchObject({ workspaceKind: "team", partial: true, coverage: { complete: false } });
    expect(result.wholeResultTotal).toMatchObject({ availability: "partial" });
  });

  it("carries the partial口径 into a group whose member-day is missing", async () => {
    const rows = grid().map((row) =>
      row.account_id === "b" && row.ds === "2026-09-02" ? { ...row, cash_yuan: null } : row);
    const { client } = setup(rows, labels);
    const result = await client.query(resolve("optimizer"), scope);
    // 有数那部分的和（20），标 partial；判定挂起。与大盘同一份聚合，所以口径必然一致。
    expect(result.rows.find((row) => row.key === "李四")).toMatchObject({
      metrics: { cashCost: { value: 20, availability: "partial" } },
      assessment: { costStatusReason: "partial_data" },
    });
    // 齐全的那组不被带累。
    expect(result.rows.find((row) => row.key === "张三"))
      .toMatchObject({ metrics: { cashCost: { availability: "available" } } });
  });
});
