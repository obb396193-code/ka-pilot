import { describe, expect, it } from "vitest";

import {
  CanonicalQueryRowError,
  canonicalizeQueryRows,
} from "../src/data/canonical-query-rows.js";

describe("canonical query row adapters", () => {
  it("maps KA snake_case and platform camelCase summary rows to the same shape", () => {
    const ka = canonicalizeQueryRows("account.summary", "ka_data", [{
      row_count: 2,
      account_count: 1,
      cost: 100,
      exposure: 1_000,
      click: 100,
      conversion: 10,
      cash_cost: 90,
    }], "workspace-1");
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
    }], "workspace-1");

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
    }], "trusted-workspace");
    const platform = canonicalizeQueryRows("reconcile.account_daily", "platform", [{
      workspaceId: "trusted-workspace",
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
    }], "trusted-workspace");

    expect(ka[0]).toMatchObject({
      workspaceId: "trusted-workspace",
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
    }], "workspace-1");
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
});
