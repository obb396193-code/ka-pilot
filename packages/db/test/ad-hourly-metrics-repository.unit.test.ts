import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { AdHourlyMetricsRepository } from "../src/ad-hourly-metrics-repository.js";

const metric = {
  workspaceId: "11111111-1111-4111-8111-111111111111",
  adId: "ad-1",
  accountId: "account-1",
  ds: "2026-08-20",
  hh: 9,
  cost: 10,
  exposure: 100,
  click: 5,
  conversion: 2,
  realConversion: 1,
  bid: 30,
  budget: 500,
};

describe("AdHourlyMetricsRepository unit", () => {
  it("uses one parameterized JSON batch and verifies the returned count", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const repository = new AdHourlyMetricsRepository({ query } as unknown as Pool);

    await repository.upsertHourly([metric]);

    expect(query).toHaveBeenCalledOnce();
    const [sql, values] = query.mock.calls[0]!;
    expect(sql).toContain("jsonb_to_recordset($1::jsonb)");
    expect(sql).toContain("ON CONFLICT (workspace_id, ad_id, ds, hh)");
    expect(values).toEqual([JSON.stringify([{
      workspace_id: metric.workspaceId,
      ad_id: metric.adId,
      account_id: metric.accountId,
      ds: metric.ds,
      hh: metric.hh,
      cost: metric.cost,
      exposure: metric.exposure,
      click: metric.click,
      conversion: metric.conversion,
      real_conversion: metric.realConversion,
      bid: metric.bid,
      budget: metric.budget,
    }])]);
  });

  it("does not query for an empty batch and fails on count mismatch", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0 });
    const repository = new AdHourlyMetricsRepository({ query } as unknown as Pool);

    await expect(repository.upsertHourly([])).resolves.toBeUndefined();
    expect(query).not.toHaveBeenCalled();
    await expect(repository.upsertHourly([metric])).rejects.toThrow("Failed to upsert hourly batch");
  });
});
