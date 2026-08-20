import { describe, expect, it } from "vitest";

import { deriveHourlyAdMetrics } from "../src/hourly-ad-metrics.js";

function row(overrides: Record<string, unknown> = {}) {
  return {
    ad_id: "ad-1",
    account_id: "account-1",
    ds: "20260820",
    ad_cost_h: 100,
    ad_exposure_h: 1_000,
    ad_click_h: 100,
    ad_conversion_h: 10,
    ad_real_conversion_h: 8,
    ad_bid_h: 30,
    ad_budget_h: 500,
    last_sync_time: "2026-08-20 14:58:00",
    ...overrides,
  };
}

describe("deriveHourlyAdMetrics", () => {
  it("subtracts adjacent cumulative snapshots and preserves current bid/budget", () => {
    const result = deriveHourlyAdMetrics({
      currentHh: 14,
      previousRows: [row()],
      currentRows: [row({
        ad_cost_h: 140,
        ad_exposure_h: 1_300,
        ad_click_h: 130,
        ad_conversion_h: 13,
        ad_real_conversion_h: 10,
        ad_bid_h: 32,
        ad_budget_h: 600,
      })],
    });

    expect(result).toEqual({
      rows: [{
        adId: "ad-1",
        accountId: "account-1",
        ds: "2026-08-20",
        hh: 14,
        cost: 40,
        exposure: 300,
        click: 30,
        conversion: 3,
        realConversion: 2,
        bid: 32,
        budget: 600,
        lastSyncTime: "2026-08-20 14:58:00",
        dataCorrectionFields: [],
      }],
      issues: [],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows[0])).toBe(true);
  });

  it("uses zero as the prior cumulative value when an ad first appears", () => {
    const result = deriveHourlyAdMetrics({ currentHh: 9, previousRows: [], currentRows: [row()] });

    expect(result.rows[0]).toEqual(expect.objectContaining({
      cost: 100,
      exposure: 1_000,
      realConversion: 8,
    }));
    expect(result.issues).toEqual([]);
  });

  it("does not invent a negative window when the current snapshot omits a prior ad", () => {
    const result = deriveHourlyAdMetrics({ currentHh: 15, previousRows: [row()], currentRows: [] });

    expect(result.rows).toEqual([]);
    expect(result.issues).toEqual([{ code: "incomplete_current_snapshot", adId: "ad-1" }]);
  });

  it("clamps server corrections to zero and reports the affected fields", () => {
    const result = deriveHourlyAdMetrics({
      currentHh: 15,
      previousRows: [row()],
      currentRows: [row({
        ad_cost_h: 90,
        ad_exposure_h: 900,
        ad_click_h: 80,
        ad_conversion_h: 8,
        ad_real_conversion_h: 7,
      })],
    });

    const fields = ["cost", "exposure", "click", "conversion", "realConversion"];
    expect(result.rows[0]).toEqual(expect.objectContaining({
      cost: 0,
      exposure: 0,
      click: 0,
      conversion: 0,
      realConversion: 0,
      dataCorrectionFields: fields,
    }));
    expect(result.issues).toEqual([{ code: "data_correction", adId: "ad-1", fields }]);
  });

  it("sorts by ad id and rejects duplicate identifiers", () => {
    const sorted = deriveHourlyAdMetrics({
      currentHh: 1,
      previousRows: [],
      currentRows: [row({ ad_id: "ad-2" }), row({ ad_id: "ad-1" })],
    });
    expect(sorted.rows.map((item) => item.adId)).toEqual(["ad-1", "ad-2"]);

    expect(() => deriveHourlyAdMetrics({
      currentHh: 1,
      previousRows: [],
      currentRows: [row(), row()],
    })).toThrow("duplicate ad_id");
  });

  it.each([
    ["missing ad id", { ad_id: undefined }],
    ["missing account id", { account_id: undefined }],
    ["missing date", { ds: undefined }],
    ["null metric", { ad_cost_h: null }],
    ["numeric string", { ad_click_h: "100" }],
    ["non-finite metric", { ad_budget_h: Number.NaN }],
  ])("fails closed for %s", (_label, invalid) => {
    expect(() => deriveHourlyAdMetrics({
      currentHh: 1,
      previousRows: [],
      currentRows: [row(invalid)],
    })).toThrow();
  });

  it("rejects incompatible dates/accounts and invalid hour boundaries", () => {
    expect(() => deriveHourlyAdMetrics({ currentHh: 25, previousRows: [], currentRows: [row()] }))
      .toThrow("currentHh");
    expect(() => deriveHourlyAdMetrics({
      currentHh: 1,
      previousRows: [row()],
      currentRows: [row({ account_id: "account-2" })],
    })).toThrow("changed account_id");
    expect(() => deriveHourlyAdMetrics({
      currentHh: 1,
      previousRows: [row()],
      currentRows: [row({ ds: "20260819" })],
    })).toThrow("changed ds");
  });
});
