import { describe, expect, it } from "vitest";

import {
  canonicalQueryRowSchemaById,
  type DataQueryId,
} from "@ka/domain";

import {
  CanonicalQueryRowError,
  canonicalizeQueryRows,
} from "../src/data/canonical-query-rows.js";

describe("canonical query row adapters", () => {
  const workspaceId = "00000000-0000-4000-8000-000000000501";
  const queryIds: DataQueryId[] = [
    "account.summary",
    "account.trend",
    "account.table",
    "account.anomalies",
    "account.detail",
    "reconcile.account_daily",
  ];

  function sourceRow(queryId: DataQueryId, source: "ka_data" | "platform") {
    const summary = source === "ka_data"
      ? {
          row_count: 1,
          account_count: 1,
          cost: 12,
          exposure: 100,
          click: 10,
          conversion: 2,
          real_conversion: 1,
          cash_cost: 11,
        }
      : {
          rowCount: 1,
          accountCount: 1,
          anomalyRows: 0,
          cost: 12,
          exposure: 100,
          click: 10,
          conversion: 2,
          realConversion: 1,
          cashCost: 11,
          costSpace: null,
          wakeUv: null,
          potentialUv: null,
        };
    if (queryId === "account.summary") return summary;
    if (queryId === "account.trend") return { ds: "2026-08-24", metrics: summary };
    return source === "ka_data"
      ? {
          media: "KUAISHOU",
          account_id: "account-1",
          ds: "20260824",
          cost_yuan: 12,
          show: 100,
          click: 10,
          conv: 2,
          data_anomaly: queryId === "account.anomalies" ? true : false,
        }
      : {
          workspaceId,
          media: "KUAISHOU",
          accountId: "account-1",
          ds: "2026-08-24",
          cost: 12,
          exposure: 100,
          click: 10,
          conversion: 2,
          realConversion: 1,
          cashCost: 11,
          costSpace: null,
          wakeUv: null,
          potentialUv: null,
          budget: null,
          budgetUsageRate: null,
          deductionRate: null,
          mainAdCostProportion: null,
          assessmentPriceSnapshot: null,
          dataAnomaly: queryId === "account.anomalies" ? true : false,
          computedAt: null,
          tasks: [],
        };
  }

  it.each(queryIds.flatMap((queryId) => (["ka_data", "platform"] as const)
    .map((source) => ({ queryId, source }))))(
    "maps $queryId from $source into its strict canonical v1 schema",
    ({ queryId, source }) => {
      const rows = canonicalizeQueryRows(
        queryId,
        source,
        [sourceRow(queryId, source)],
        workspaceId,
      );
      expect(rows).toHaveLength(1);
      expect(canonicalQueryRowSchemaById[queryId].safeParse(rows[0]).success).toBe(true);
      expect(JSON.stringify(rows[0])).not.toMatch(/account_id|cost_yuan|cash_cost|row_count/);
    },
  );

  it("maps KA snake_case and platform camelCase summary rows to the same shape", () => {
    const ka = canonicalizeQueryRows("account.summary", "ka_data", [{
      row_count: 2,
      account_count: 1,
      cost: 100,
      exposure: 1_000,
      click: 100,
      conversion: 10,
      cash_cost: 90,
    }], workspaceId);
    const platform = canonicalizeQueryRows("account.summary", "platform", [{
      rowCount: 2,
      accountCount: 1,
      anomalyRows: 0,
      cost: 100,
      exposure: 1_000,
      click: 100,
      conversion: 10,
      realConversion: null,
      cashCost: 90,
      costSpace: null,
      wakeUv: null,
      potentialUv: null,
    }], workspaceId);

    expect(ka).toEqual([{ ...platform[0], anomalyRows: null }]);
    expect(ka[0]).not.toHaveProperty("cash_cost");
  });

  it("maps both account-day sources to one strict identity and metric shape", () => {
    const ka = canonicalizeQueryRows("reconcile.account_daily", "ka_data", [{
      workspace_id: "forged-upstream-workspace",
      media: "KUAISHOU",
      account_id: "account-1",
      ds: "20260824",
      account_name: "账户A",
      cost_yuan: 100,
      cash_yuan: 90,
      show: 1_000,
      click: 100,
      conv: 10,
      task_id: "task-1",
      biz_name: "业务A",
    }], workspaceId);
    const platform = canonicalizeQueryRows("reconcile.account_daily", "platform", [{
      workspaceId,
      media: "KUAISHOU",
      accountId: "account-1",
      ds: "2026-08-24",
      accountName: "账户A",
      ownerUserId: null,
      cost: 100,
      cashCost: 90,
      exposure: 1_000,
      click: 100,
      conversion: 10,
      realConversion: null,
      costSpace: null,
      wakeUv: null,
      potentialUv: null,
      budget: null,
      budgetUsageRate: null,
      deductionRate: null,
      mainAdCostProportion: null,
      assessmentPriceSnapshot: null,
      dataAnomaly: false,
      computedAt: null,
      tasks: [{ taskId: "task-1", taskName: null, bizName: "业务A" }],
    }], workspaceId);

    expect(ka[0]).toMatchObject({
      workspaceId,
      media: "KUAISHOU",
      accountId: "account-1",
    });
    expect(ka[0]).not.toHaveProperty("account_id");
    expect(platform[0]).not.toHaveProperty("realCpa");
    expect((ka[0] as { metrics: unknown }).metrics).toEqual(
      (platform[0] as { metrics: unknown }).metrics,
    );
  });

  it("preserves denominator-zero CPA states without frontend calculation", () => {
    const [row] = canonicalizeQueryRows("account.summary", "platform", [{
      rowCount: 1,
      accountCount: 1,
      anomalyRows: 0,
      cost: 5,
      exposure: 0,
      click: 0,
      conversion: 0,
      realConversion: 0,
      cashCost: 0,
      costSpace: 0,
      wakeUv: 0,
      potentialUv: 0,
    }], workspaceId);
    expect(row).toMatchObject({
      metrics: {
        ratios: {
          ctr: { value: null, state: "undefined" },
          realCpa: { value: null, state: "infinite" },
          cashCpa: { value: null, state: "undefined" },
        },
      },
    });
  });

  it("rejects missing required fields instead of leaking source-specific partial rows", () => {
    expect(() => canonicalizeQueryRows("account.summary", "ka_data", [{ cost: 1 }], "w"))
      .toThrow(CanonicalQueryRowError);
    expect(() => canonicalizeQueryRows("account.table", "ka_data", [{
      media: "KUAISHOU",
      account_id: "account-1",
    }], "w")).toThrow(CanonicalQueryRowError);
  });

  it.each([
    ["platform", { rowCount: 1, accountCount: 1, anomalyRows: 0, cost: "not-a-number" }],
    ["ka_data", { row_count: 1, account_count: 1, cost: "not-a-number" }],
  ] as const)("rejects a present invalid numeric field from %s", (source, row) => {
    expect(() => canonicalizeQueryRows("account.summary", source, [row], "w"))
      .toThrow(CanonicalQueryRowError);
  });

  it("rejects present invalid platform task and anomaly types", () => {
    const base = sourceRow("account.table", "platform");
    expect(() => canonicalizeQueryRows("account.table", "platform", [{
      ...base,
      tasks: "not-an-array",
    }], "w")).toThrow(CanonicalQueryRowError);
    expect(() => canonicalizeQueryRows("account.table", "platform", [{
      ...base,
      dataAnomaly: "false",
    }], "w")).toThrow(CanonicalQueryRowError);
  });

  it("rejects impossible dates instead of accepting a regex-only match", () => {
    expect(() => canonicalizeQueryRows("account.table", "platform", [{
      ...sourceRow("account.table", "platform"),
      ds: "2026-02-31",
    }], "w")).toThrow(CanonicalQueryRowError);
  });
});
