// Synthetic, in-memory source only. No internal network or credentials.
import { describe, expect, it, vi } from "vitest";
import type { ApprovedWorkspaceAuthContext } from "@ka/domain";
import { accountLabelsFromHistory } from "../src/data/account-labels.js";
import { KaDataClient } from "../src/data/ka-data-client.js";
import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { DataQueryService } from "../src/data/query-service.js";

/**
 * A3（arch 2026-09-13 执行序）：团队会话下的 `account.pivot2` 走到 ka-data 的 `teamPivot`，
 * 响应经过与个人透视同一道出口校验（信封、cellCoverage 与格子一致、窗口、授权元数据）。
 */
const workspaceId = "00000000-0000-4000-8000-000000000071";
const auth: ApprovedWorkspaceAuthContext = { workspaceKind: "team", workspaceId, userId: "00000000-0000-4000-8000-000000000072",
  role: "optimizer", scope: { kind: "team_workspace_readonly" } };
const policy = { diagnosticEnabled: false, kaDataEnabled: true, entitlements: [] };
const request = (dimA: string, dimB: string) =>
  ({ queryId: "account.pivot2", params: { dimA, dimB, dateFrom: "2026-09-01", dateTo: "2026-09-02", media: "KUAISHOU" } });
const member = (ds: string, accountId: string) =>
  ({ ds, media: "KUAISHOU", account_id: accountId, observed: 1, cost_yuan: 100, cash_yuan: 20, show: 1000, click: 10, conv: 1, cash_assessment: 10 });
const owner = (accountId: string, value: string) => ({ workspaceId, media: "KUAISHOU", accountId, effectiveFrom: "2026-08-01",
  mappings: [{ key: "owner", mapsTo: "optimizer", pending: false }],
  parse: { ruleVersion: 1, status: "parsed" as const, override: null, conflicts: null, parsedAt: null, nameMatches: true,
    segments: { owner: { key: "owner", value, mapsTo: "optimizer", taskIds: [] } } } });

function setup(options: { teamPivot?: boolean } = {}) {
  const rows = ["a", "b"].flatMap((id) => [member("2026-09-01", id), member("2026-09-02", id)]);
  const fetchFn = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ backend: "sqlite", rowCount: rows.length, rows })));
  const client = new KaDataClient({ baseUrl: "https://ka.test.invalid", token: "synthetic", teamWorkspaceId: workspaceId, fetchFn,
    labels: { read: async () => accountLabelsFromHistory([owner("a", "张三"), owner("b", "李四")]) } });
  const kaData = { query: vi.fn(), ...(options.teamPivot === false ? {} : { teamPivot: client.teamPivot.bind(client) }) };
  const platform = { query: vi.fn(), pivot: vi.fn() };
  return { fetchFn, kaData, platform,
    service: new DataQueryService({ registry: createDataQueryRegistry(), kaData, platform, sourcePolicy: policy, requestId: () => "team-pivot" }) };
}

describe("A3 team pivot through the data query service", () => {
  it("answers a team session from the ka-data member grid with matching cell coverage", async () => {
    const s = setup(), result = await s.service.execute(request("optimizer", "goal"), auth);
    expect(result).toMatchObject({ ok: true, data: { mode: "ka_data", source: { queryId: "account.pivot2", dimA: "optimizer", dimB: "goal",
      lineage: { workspaceKind: "team", source: "ka_data", partial: true } } }, meta: { cellCoverage: { cells: 2, withData: 2 } } });
    if (!result.ok || result.data.mode === "reconcile") throw new Error("Expected a single-source success");
    expect(result.data.source.rows.map((row) => (row.a as { key: string | null }).key)).toEqual(["张三", "李四"]);
    // 团队透视不借个人源，也不走 ka-data 的 SQL 下推那条通用路。
    expect(s.platform.pivot).not.toHaveBeenCalled(); expect(s.kaData.query).not.toHaveBeenCalled();
  });

  it("says the team pivot is unavailable when the ka-data source has no pivot, instead of falling back", async () => {
    const s = setup({ teamPivot: false });
    expect(await s.service.execute(request("optimizer", "goal"), auth)).toMatchObject({ ok: false, error: { code: "SOURCE_UNAVAILABLE" } });
    expect(s.platform.pivot).not.toHaveBeenCalled(); expect(s.fetchFn).not.toHaveBeenCalled();
  });

  it("rejects fact-side axes for a team session before touching the source, and names what it supports", async () => {
    const s = setup();
    expect(await s.service.execute(request("optimizer", "account"), auth)).toMatchObject({ ok: false,
      error: { code: "DIMENSION_UNSUPPORTED", details: { supported: ["optimizer", "goal", "placement", "segment:<key>"] } } });
    expect(s.fetchFn).not.toHaveBeenCalled();
  });
});
