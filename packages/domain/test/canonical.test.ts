import { describe, expect, it } from "vitest";

import { mergeAccountCanonical } from "../src/canonical.js";

describe("mergeAccountCanonical", () => {
  it("keeps historical offline delivery fields and fills conversion fields from realtime", () => {
    const result = mergeAccountCanonical({
      ds: "2026-08-18",
      reportDate: "2026-08-19",
      offline: {
        account_id: "a-1",
        cost_api: 100,
        exp_pv_api: 1_000,
        clk_api: 80,
        cash: 90,
        income: 5,
        wake_uv: 40,
        aac_ptt_uv: 20,
      },
      realtime: {
        account_id: "a-1",
        account_cost: 120,
        account_exposure: 1_200,
        account_click: 100,
        account_conversion: 12,
        account_real_conversion: 10,
        account_budget: 500,
        account_budget_usage_rate: 0.24,
        account_deduction_rate: 0.1,
        account_main_ad_cost_proportion: 0.7,
        assessment_cost: 11,
      },
    });

    expect(result).toMatchObject({
      accountId: "a-1",
      cost: 100,
      exposure: 1_000,
      click: 80,
      conversion: 12,
      realConversion: 10,
      cash: 90,
      compensation: 5,
      wakeUv: 40,
      potentialUv: 20,
      budget: 500,
      gapFilledByRealtime: false,
    });
    expect(result.fieldSources).toMatchObject({
      cost: "offline",
      exposure: "offline",
      conversion: "realtime_fill",
      budget: "realtime_fill",
    });
  });

  it("does not replace a present historical offline row with realtime delivery values", () => {
    const result = mergeAccountCanonical({
      ds: "2026-08-18",
      reportDate: "2026-08-19",
      offline: { account_id: "a-1", cost_api: null, exp_pv_api: null, clk_api: null },
      realtime: {
        account_id: "a-1",
        account_cost: 120,
        account_exposure: 1_200,
        account_click: 100,
      },
    });

    expect(result.cost).toBeNull();
    expect(result.exposure).toBeNull();
    expect(result.click).toBeNull();
    expect(result.gapFilledByRealtime).toBe(false);
  });

  it("uses realtime only for today", () => {
    const result = mergeAccountCanonical({
      ds: "2026-08-19",
      reportDate: "2026-08-19",
      offline: { account_id: "a-1", cost_api: 999 },
      realtime: {
        account_id: "a-1",
        account_cost: 15,
        account_exposure: 200,
        account_click: 20,
        account_conversion: 2,
        account_real_conversion: 1,
      },
    });

    expect(result.cost).toBe(15);
    expect(result.fieldSources.cost).toBe("realtime");
    expect(result.gapFilledByRealtime).toBe(false);
  });

  it("marks historical rows without any offline record as realtime gap fills", () => {
    const result = mergeAccountCanonical({
      ds: "2026-08-17",
      reportDate: "2026-08-19",
      realtime: {
        account_id: "a-2",
        account_cost: 30,
        account_exposure: 300,
        account_click: 30,
      },
    });

    expect(result.accountId).toBe("a-2");
    expect(result.cost).toBe(30);
    expect(result.gapFilledByRealtime).toBe(true);
    expect(result.fieldSources.cost).toBe("gap_filled");
  });

  it("rejects mismatched account identities", () => {
    expect(() =>
      mergeAccountCanonical({
        ds: "2026-08-18",
        reportDate: "2026-08-19",
        offline: { account_id: "a-1" },
        realtime: { account_id: "a-2" },
      }),
    ).toThrow("different accounts");
  });
});
