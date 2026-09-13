import { describe, expect, it } from "vitest";

import {
  canonicalQueryRowSchemaById,
  type DataQueryId,
} from "@ka/domain";

import {
  CanonicalQueryRowError,
  canonicalSummaryBaseRow,
  canonicalizeQueryRows,
  maskCanonicalQueryRows,
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
          // v1.9.40：部分合计的列名单；本桩不造缺口。
          partial: [],
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
    if (queryId === "account.summary") return {
      ...canonicalSummaryBaseRow(summary, source),
      assessment: {
        priceSource: source === "ka_data" ? "ka_daily" : "history",
        price: null, onTarget: null, costStatus: null, costStatusReason: "assessment_missing",
        budgetUsageRate: { value: null, state: "undefined" },
        // v1.9.45：三个 BI 值对 platform 源必填。真产出路径恒发它们，
        // 桩不发就等于造了一份线上不可能出现的行。
        biConv: { value: null, availability: "missing" },
        biCashCost: { value: null, state: "undefined" },
        overCost: { value: null, availability: "missing" },
      },
    };
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
    "maps $queryId from $source into its frozen canonical schema (window v3, daily v2)",
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
      const metrics = rows[0]?.metrics;
      expect(metrics).toMatchObject({ cost: { value: 12, availability: "available" } });
    },
  );

  it.each(queryIds)("marks transport-truncated %s metrics error without losing identity or counts", (queryId) => {
    const rows = canonicalizeQueryRows(queryId, "platform", [sourceRow(queryId, "platform")], workspaceId);
    const masked = maskCanonicalQueryRows(queryId, rows, "error");
    expect(canonicalQueryRowSchemaById[queryId].safeParse(masked[0]).success).toBe(true);
    const metrics = masked[0]?.metrics;
    expect(metrics).toMatchObject({
      cost: { value: null, availability: "error" },
      ratios: { realCpa: { value: null, state: "undefined" } },
    });
    if (queryId === "account.summary") expect(masked[0]).toMatchObject({ rowCount: 1, accountCount: 1 });
    else if (queryId !== "account.trend") expect(masked[0]).toMatchObject({ workspaceId, accountId: "account-1" });
    expect(rows[0]).not.toEqual(masked[0]);
  });

  it("keeps genuine zero available, absence missing, and rejects corruption before masking", () => {
    const base = canonicalSummaryBaseRow({
      rowCount: 1, accountCount: 1, anomalyRows: 0, cost: 0,
    }, "platform");
    const [row] = canonicalizeQueryRows("account.summary", "platform", [{
      ...sourceRow("account.summary", "platform"), ...base,
    }], workspaceId);
    expect(row).toMatchObject({ metrics: {
      cost: { value: 0, availability: "available" },
      cashCost: { value: null, availability: "missing" },
    } });
    expect(() => maskCanonicalQueryRows("account.summary", [{ ...row, metrics: { cost: "bad" } }], "error"))
      .toThrow(CanonicalQueryRowError);
  });

  it("maps raw summary bases without guessing a public window assessment", () => {
    const ka = canonicalSummaryBaseRow({
      row_count: 2,
      account_count: 1,
      cost: 100,
      exposure: 1_000,
      click: 100,
      real_conversion: 10,
      cash_cost: 90,
    }, "ka_data");
    const platform = canonicalSummaryBaseRow({
      rowCount: 2,
      accountCount: 1,
      anomalyRows: 0,
      // v1.9.40：部分合计的列名单；本桩不造缺口。
      partial: [],
      cost: 100,
      exposure: 1_000,
      click: 100,
      conversion: null,
      realConversion: 10,
      cashCost: 90,
      costSpace: null,
      wakeUv: null,
      potentialUv: null,
    }, "platform");

    expect(ka).toEqual({ ...platform, anomalyRows: null });
    expect(ka).not.toHaveProperty("cash_cost");
    expect(() => canonicalizeQueryRows("account.summary", "ka_data", [ka], workspaceId))
      .toThrow(CanonicalQueryRowError);
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
      conversion: null,
      realConversion: 10,
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
    const row = canonicalSummaryBaseRow({
      rowCount: 1,
      accountCount: 1,
      anomalyRows: 0,
      // v1.9.40：部分合计的列名单；本桩不造缺口。
      partial: [],
      cost: 5,
      exposure: 0,
      click: 0,
      conversion: 0,
      realConversion: 0,
      cashCost: 0,
      costSpace: 0,
      wakeUv: 0,
      potentialUv: 0,
    }, "platform");
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
    expect(() => canonicalSummaryBaseRow(row, source)).toThrow(CanonicalQueryRowError);
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
  /**
   * v1.9.45：四个键（`incentiveCost` + 三个 BI 值）对 **platform 源必填**，
   * 团队 `ka_data` 与 reconcile 豁免到 Q-041 ⑧ 落地（那两条路本地连不上，
   * 硬转必填只会逼出假 fixture）。
   *
   * 行 schema 仍留 optional，所以「必填」只能落在**知道源是谁**的这一层。
   * 漏发时页面只是静悄悄显「−」，而「后端没算」与「真没有数」长得一模一样——
   * 这条绊线就是把那个区别变成一条错误。
   */
  describe("v1.9.45/46 the four metric fields are required on every source", () => {
    const summaryRow = (source: "platform" | "ka_data") =>
      sourceRow("account.summary", source) as unknown as Record<string, unknown>;

    it("refuses a platform summary row missing incentiveCost", () => {
      const row = summaryRow("platform");
      Reflect.deleteProperty(row.metrics as Record<string, unknown>, "incentiveCost");
      expect(() => canonicalizeQueryRows("account.summary", "platform", [row], workspaceId))
        .toThrow(CanonicalQueryRowError);
    });

    it.each(["biConv", "biCashCost", "overCost"])("refuses a platform summary row missing %s", (field) => {
      const row = summaryRow("platform");
      Reflect.deleteProperty(row.assessment as Record<string, unknown>, field);
      expect(() => canonicalizeQueryRows("account.summary", "platform", [row], workspaceId))
        .toThrow(CanonicalQueryRowError);
    });

    it("requires them on ka_data too, now that ⑧ has landed", () => {
      // v1.9.45 时团队源豁免，理由是本地连不上、硬转必填会逼出假 fixture。
      // v1.9.46 团队源部分合计落地，两条团队路径都恒发这四个键，豁免随之撤销。
      const row = summaryRow("ka_data");
      Reflect.deleteProperty(row.metrics as Record<string, unknown>, "incentiveCost");
      expect(() => canonicalizeQueryRows("account.summary", "ka_data", [row], workspaceId))
        .toThrow(CanonicalQueryRowError);
    });

    it("does not demand the BI values on rows that carry no assessment", () => {
      // 趋势/明细行没有考核结论，要求它们带 BI 值就是要求一个不存在的东西。
      const trend = sourceRow("account.trend", "platform") as unknown as Record<string, unknown>;
      expect(canonicalizeQueryRows("account.trend", "platform", [trend], workspaceId)).toHaveLength(1);
    });
  });
});

/**
 * v1.9.35/40 部分合计：`partial` 名单里的列标 `availability:"partial"`，
 * 而**由它们算出的比率照常给 finite**（arch 2026-09-11 循环第 44 圈点名）。
 *
 * 这条绊线盯的是一种很容易「改对了又改回去」的回归：有人看到分子带 partial，
 * 顺手把比率也压成 `undefined`，页面上就从「4.98（部分）」变回一个「−」——
 * 而「算不出来」和「算出来了但只覆盖部分天」在用户眼里完全不是一回事。
 */
describe("partial totals still produce finite ratios", () => {
  // 名单里是 **SQL 侧列名**（snake_case），不是响应字段名——写错了不会报错，
  // 只会静默地一个 partial 都标不上，正是这条绊线要盯住的。
  const partialRow = (partial: string[]) => ({
    rowCount: 2, accountCount: 2, anomalyRows: 0, partial,
    cost: 100, exposure: 1_000, click: 100, conversion: 8, realConversion: 20, cashCost: 90,
    costSpace: null, wakeUv: null, potentialUv: null,
  });

  it("labels the partial columns and keeps every derived ratio finite", () => {
    const row = canonicalSummaryBaseRow(partialRow(["cash_cost", "real_conversion", "cost", "click"]), "platform");
    expect(row.metrics.cashCost).toEqual({ value: 90, availability: "partial" });
    expect(row.metrics.realConversion).toEqual({ value: 20, availability: "partial" });
    // 90/20 = 4.5：分子分母都是「有数那部分的和」，比率就是那部分的比率，照给。
    expect(row.metrics.ratios.cashCpa).toEqual({ value: 4.5, state: "finite" });
    expect(row.metrics.ratios.realCpa).toEqual({ value: 5, state: "finite" });
    expect(row.metrics.ratios.ctr).toEqual({ value: 0.1, state: "finite" });
    expect(row.metrics.ratios.cvr).toEqual({ value: 0.08, state: "finite" });
    expect(row.metrics.ratios.gap).toEqual({ value: -0.6, state: "finite" });
  });

  it("marks only the columns actually named, leaving the rest available", () => {
    const row = canonicalSummaryBaseRow(partialRow(["cash_cost"]), "platform");
    expect(row.metrics.cashCost.availability).toBe("partial");
    expect(row.metrics.cost.availability).toBe("available");
    expect(row.metrics.realConversion.availability).toBe("available");
  });

  it("never turns an absent value into partial just because the column is named", () => {
    // 名单说「这列是部分合计」，但这一行根本没值——那就是 missing。
    // 把 null 标成 partial 等于宣称「有一部分数据」，而其实一条都没有。
    const row = canonicalSummaryBaseRow({ ...partialRow(["cost_space"]), costSpace: null }, "platform");
    expect(row.metrics.costSpace).toEqual({ value: null, availability: "missing" });
  });
});
