// Synthetic only. ka-src-0010 defines account conv as fact_conv BI conversions.
import { describe, expect, it } from "vitest";
import { type DataQueryId } from "@ka/domain";
import { CanonicalQueryRowError, canonicalSummaryBaseRow, canonicalizeQueryRows } from "../src/data/canonical-query-rows.js";

const workspaceId = "00000000-0000-4000-8000-000000000501";
const queryIds: DataQueryId[] = ["account.summary", "account.trend", "account.table", "account.anomalies", "account.detail", "reconcile.account_daily"];
const identity = { media: "KUAISHOU", account_id: "fixture-account", ds: "20260824" };

function mapped(queryId: DataQueryId, fields: Record<string, unknown>) {
  const raw = { ...identity, row_count: 1, account_count: 1, cost_yuan: 12, cash_yuan: 10, click: 4,
    data_anomaly: queryId === "account.anomalies", ...fields };
  // Summary arithmetic is a base for the v3 window calculator; the public mapper
  // must not manufacture assessment metadata from an aggregate SQL row.
  const input = queryId === "account.summary" ? {
    ...canonicalSummaryBaseRow(raw, "ka_data"),
    assessment: { priceSource: "ka_daily", price: null, onTarget: null, costStatus: null,
      costStatusReason: "assessment_missing", budgetUsageRate: { value: null, state: "undefined" } },
  } : raw;
  const [row] = canonicalizeQueryRows(queryId, "ka_data", [input], workspaceId);
  return row!.metrics;
}

describe("KA account BI conversion lineage", () => {
  it.each(queryIds)("%s keeps BI-only rows separate from media conversions", (queryId) => {
    const metrics = mapped(queryId, { conv: 2 });
    expect(metrics).toMatchObject({
      conversion: { value: null, availability: "missing" },
      realConversion: { value: 2, availability: "available" },
      ratios: {
        realCpa: { value: 6, state: "finite" }, cashCpa: { value: 5, state: "finite" },
        cvr: { value: null, state: "undefined" }, gap: { value: null, state: "undefined" },
      },
    });
    const platform = canonicalSummaryBaseRow({
      rowCount: 1, accountCount: 1, anomalyRows: 0, cost: 12, cashCost: 10, click: 4,
      realConversion: 2, conversion: null,
    }, "platform");
    expect(metrics).toMatchObject(platform.metrics as Record<string, unknown>);
  });

  it.each([null, undefined])("keeps missing BI and missing media conversions unavailable (%s)", (conv) => {
    expect(mapped("account.table", conv === undefined ? {} : { conv })).toMatchObject({
      conversion: { value: null, availability: "missing" }, realConversion: { value: null, availability: "missing" },
      ratios: { realCpa: { value: null, state: "undefined" } },
    });
  });
  it("preserves genuine zero BI as infinite CPA for positive spend", () => {
    expect(mapped("account.table", { conv: 0 })).toMatchObject({
      realConversion: { value: 0, availability: "available" },
      ratios: { realCpa: { value: null, state: "infinite" }, gap: { value: null, state: "undefined" } },
    });
  });
  it("does not duplicate BI when an explicit media conversion metric exists", () => {
    expect(mapped("account.summary", { conv: 2, conversion: 3 })).toMatchObject({
      conversion: { value: 3, availability: "available" }, realConversion: { value: 2, availability: "available" },
      ratios: { cvr: { value: 0.75, state: "finite" }, gap: { value: 0.5, state: "finite" } },
    });
  });
  it.each(["not-a-number", false, {}, Number.POSITIVE_INFINITY])("rejects invalid BI even with valid media conversion (%s)", (conv) => {
    expect(() => mapped("account.table", { conv, conversion: 3 })).toThrow(CanonicalQueryRowError);
  });
  it.each(["not-a-number", 3])("rejects an invalid or conflicting BI alias hidden after real_conversion (%s)", (conv) => {
    expect(() => mapped("account.table", { real_conversion: 2, conv })).toThrow(CanonicalQueryRowError);
  });
  it("accepts equivalent numeric BI aliases without double-counting", () => {
    expect(mapped("account.table", { real_conversion: "2", conv: 2 })).toMatchObject({
      realConversion: { value: 2, availability: "available" },
    });
  });
});
