// Synthetic, in-memory source only. No internal network or credentials.
import { describe, expect, it, vi } from "vitest";
import { summaryWindowRowSchema } from "@ka/domain";
import { KaDataClient } from "../src/data/ka-data-client.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";

const workspaceId = "00000000-0000-4000-8000-000000000081";
const scope = { workspaceId, userId: "00000000-0000-4000-8000-000000000082", scopeKind: "team_workspace_readonly" as const, accounts: [] };
const window = { from: "2026-09-01", to: "2026-09-02" };
const resolved = createDataQueryRegistry().resolve("account.summary", { date_from: window.from, date_to: window.to }, "ka_data");
function member(ds: string, cash: number | null, price: number | null, conv: number | null = 1, accountId = "a") {
  return { ds, media: "KUAISHOU", account_id: accountId, observed: 1, cost_yuan: 100, cash_yuan: cash, show: 1000, click: 10, conv, cash_assessment: price };
}
function setup(rows: unknown[]) {
  const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ backend: "sqlite", rowCount: rows.length, rows })));
  return { fetchFn, client: new KaDataClient({ baseUrl: "https://ka.test.invalid", token: "synthetic", teamWorkspaceId: workspaceId, fetchFn }) };
}
describe("team v3 window summary from registered member reader", () => {
  it("weights each day, aggregates before division and preserves source limitations", async () => {
    const { client, fetchFn } = setup([member("2026-09-01", 10, 20, 1), member("2026-09-02", 150, 10, 9)]);
    const result = await client.queryTeamWindowSummary(resolved, scope, window);
    expect(summaryWindowRowSchema.safeParse(result.row).success).toBe(true);
    expect(result.row).toMatchObject({ rowCount: 2, accountCount: 1, metrics: {
      cashCost: { value: 160 }, realConversion: { value: 10 }, costSpace: { value: -50 },
      conversion: { availability: "missing" }, ratios: { cashCpa: { value: 16 }, cvr: { state: "undefined" } },
    }, assessment: { priceSource: "ka_daily", price: null, priceVersions: 2, onTarget: false, costStatus: "red", budgetUsageRate: { state: "undefined" } } });
    expect(result.warnings).toEqual(expect.arrayContaining(["ASSESSMENT_VERSION_UNKNOWN", "BUDGET_SOURCE_NOT_READY"]));
    expect(result.lineage.partial).toBe(true); expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it("computes target rate delta with determinable accounts rather than all observed accounts", async () => {
    const rows = [member("2026-08-31", 50, 20), member("2026-09-01", 10, 20), member("2026-09-02", 10, 20),
      member("2026-08-31", 10, 20, null, "b"), member("2026-09-01", 10, 20, null, "b"), member("2026-09-02", 10, 20, null, "b")];
    const { client, fetchFn } = setup(rows);
    const result = await client.queryTeamWindowSummary(resolved, scope, window, "dod");
    expect(result.row.compare?.deltas.onTargetRate).toEqual({ value: 1, state: "finite" });
    expect(result.row.assessment.costStatusReason).toBe("conversion_missing");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it.each([
    [[member("2026-09-01", 30, 20), member("2026-09-02", 0, 20)], "day_over_window_ok", "yellow"],
    [[member("2026-09-01", null, 20), member("2026-09-02", 0, 20)], "cash_missing", null],
    [[member("2026-09-01", 1, null), member("2026-09-02", 0, 20)], "assessment_missing", null],
    [[], "assessment_missing", null],
  ] as const)("retains weighted status and missing values", async (rows, reason, color) => {
    const { client } = setup([...rows]);
    const result = await client.queryTeamWindowSummary(resolved, scope, window);
    expect(result.row.assessment).toMatchObject({ costStatusReason: reason, costStatus: color });
  });
  it("does not fabricate same-hour comparisons for today", async () => {
    const query = createDataQueryRegistry().resolve("account.summary", { date: "2026-09-02" }, "ka_data");
    const { client } = setup([member("2026-09-02", 10, 20)]);
    const result = await client.queryTeamWindowSummary(query, scope, { from: "2026-09-02", to: "2026-09-02", preset: "today" }, "wow");
    expect(Object.values(result.row.compare!.deltas).every((value) => value.state === "undefined")).toBe(true);
  });
  it("rejects arithmetic overflow with a stable source contract error", async () => {
    const { client } = setup([member("2026-09-01", Number.MAX_VALUE, 20), member("2026-09-02", Number.MAX_VALUE, 20)]);
    await expect(client.queryTeamWindowSummary(resolved, scope, window)).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
  });
});
