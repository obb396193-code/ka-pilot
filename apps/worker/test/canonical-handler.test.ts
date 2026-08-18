import { describe, expect, it, vi } from "vitest";

import { createCanonicalHandler } from "../src/etl/canonical-handler.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";

describe("canonical handler", () => {
  it("merges raw fields, applies effective settings and persists derived metrics", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const store = {
      loadMergeInputs: vi.fn().mockResolvedValue([
        {
          workspaceId,
          accountId: "a-1",
          ds: "2026-08-18",
          reportDate: "2026-08-19",
          offline: {
            account_id: "a-1",
            cost_api: 100,
            exp_pv_api: 1_000,
            clk_api: 80,
            income: 5,
            wake_uv: 40,
            aac_ptt_uv: 20,
          },
          realtime: {
            account_id: "a-1",
            account_conversion: 12,
            account_real_conversion: 10,
            account_budget: 500,
          },
        },
      ]),
      loadEffectiveSettings: vi.fn().mockResolvedValue({
        channelCoefficient: 2,
        assessmentPrice: 11,
      }),
      loadHistoricalSpend: vi.fn().mockResolvedValue([10, 20, 0]),
      upsertCanonical: upsert,
    };
    const handler = createCanonicalHandler({ store });

    await handler({
      id: "33333333-3333-4333-8333-333333333333",
      workspaceId,
      jobType: "canonical_merge",
      payload: { workspaceId, dateFrom: "2026-08-18", dateTo: "2026-08-18" },
      priority: 5,
      credentialOwnerUserId: null,
      status: "leased",
      leaseUntil: null,
      attempts: 1,
      maxAttempts: 3,
      runAfter: new Date(),
    });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        accountId: "a-1",
        cost: 100,
        conversion: 12,
        realConversion: 10,
        realCpa: 10,
        cashCost: 47.5,
        cashCpa: 4.75,
        costSpace: 62.5,
        assessmentPriceSnapshot: 11,
        dataAnomaly: true,
      }),
    );
    const record = upsert.mock.calls[0]?.[0] as { fieldSources: Record<string, string> };
    expect((record as unknown as { gap: number }).gap).toBeCloseTo(0.2);
    expect(record.fieldSources.realCpa).toBe("derived");
  });
});
