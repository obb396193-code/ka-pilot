import { metricValue } from "../src/metric-value.js";
import { describe, expect, it } from "vitest";

import {
  dataQueryRequestSchema,
  dataQueryResponseSchema,
  dataViewModeSchema,
  metricValueSchema,
  reconcileMetricSchema,
  sourceQueryResultSchema,
  sourceLineageSchema,
} from "../src/data-query-contract.js";

const lineage = {
  workspaceKind: "personal",
  source: "ka_data",
  datasetVersion: "snapshot-20260824",
  queryTemplateVersion: "account-summary-v1",
  metricVersion: "ka-data-v1",
  dataAsOf: "2026-08-24T08:00:00.000Z",
  timezone: "Asia/Shanghai",
  dayCut: "calendar_day",
  metadataAvailability: "known",
  authority: {
    policyVersion: "2026-08-24",
    useCase: "cross_media_operations",
    role: "default_authoritative",
  },
  objectIdentity: {
    objectType: "account",
    joinKeys: ["workspace_id", "media", "account_id"],
  },
  coverage: { complete: true },
  truncated: false,
  partial: false,
} as const;

const dailyMetrics = {
  cost: metricValue(1),
  exposure: metricValue(10),
  click: metricValue(2),
  conversion: metricValue(1),
  realConversion: metricValue(1),
  cashCost: metricValue(1),
  costSpace: metricValue(0),
  wakeUv: metricValue(null),
  potentialUv: metricValue(null),
  budget: metricValue(null),
  budgetUsageRate: metricValue(null),
  deductionRate: metricValue(null),
  mainAdCostProportion: metricValue(null),
  assessmentPrice: metricValue(null),
  ratios: {
    ctr: { value: 0.2, state: "finite" },
    cvr: { value: 0.5, state: "finite" },
    realCpa: { value: 1, state: "finite" },
    cashCpa: { value: 1, state: "finite" },
    gap: { value: 0, state: "finite" },
    potentialRate: { value: null, state: "undefined" },
    biConversionRate: { value: null, state: "undefined" },
  },
} as const;

describe("dual data query contract", () => {
  it("requires an explicit approved workspace kind without defaulting to personal", () => {
    const missingKind = Object.fromEntries(Object.entries(lineage).filter(([key]) => key !== "workspaceKind"));
    expect(sourceLineageSchema.safeParse(missingKind).success).toBe(false);
    for (const workspaceKind of ["personal", "team"]) {
      expect(sourceLineageSchema.safeParse({ ...lineage, workspaceKind }).success).toBe(true);
    }
    expect(sourceLineageSchema.safeParse({ ...lineage, workspaceKind: "shared" }).success).toBe(false);
  });
  it("accepts exactly the three frozen data view modes", () => {
    for (const mode of ["ka_data", "platform", "reconcile"] as const) {
      expect(dataViewModeSchema.parse(mode)).toBe(mode);
    }
    expect(() => dataViewModeSchema.parse("merged")).toThrow();
  });

  it("accepts only queryId and params at the ordinary request boundary", () => {
    const valid = {
      queryId: "account.summary",
      params: { date: "2026-08-24" },
    };
    expect(dataQueryRequestSchema.parse(valid)).toEqual(valid);
    expect(() => dataQueryRequestSchema.parse({ ...valid, dataView: "platform" })).toThrow();
    expect(() => dataQueryRequestSchema.parse({ ...valid, data_view: "ka_data" })).toThrow();
    expect(() => dataQueryRequestSchema.parse({ ...valid, queryId: "reconcile.account_daily" })).toThrow();
    expect(() => dataQueryRequestSchema.parse({ ...valid, sql: "select 1" })).toThrow();
    expect(() => dataQueryRequestSchema.parse({ ...valid, workspaceId: "forged" })).toThrow();
    expect(() => dataQueryRequestSchema.parse({ ...valid, accountId: "forged" })).toThrow();
  });

  it("represents metric absence and zero as different states", () => {
    expect(metricValueSchema.parse({ value: 0, availability: "available" })).toEqual({
      value: 0,
      availability: "available",
    });
    expect(metricValueSchema.parse({ value: null, availability: "missing" })).toEqual({
      value: null,
      availability: "missing",
    });
    expect(() => metricValueSchema.parse({ value: 0, availability: "missing" })).toThrow();
  });

  it("requires complete lineage and prevents partial data from claiming a whole total", () => {
    expect(() => sourceQueryResultSchema.parse({ status: "ready", rows: [] })).toThrow();
    expect(() => sourceQueryResultSchema.parse({
      queryId: "account.summary",
      rowSchemaVersion: "account.summary/v2",
      status: "ready",
      rows: [],
      returnedRowCount: 2_000,
      wholeResultTotal: { value: 2_000, availability: "available" },
      lineage: { ...lineage, coverage: { complete: false }, partial: true, truncated: true },
      warnings: ["suspected truncation"],
    })).toThrow(/wholeResultTotal/i);
  });

  it("represents unavailable source lineage as unknown instead of fabricating freshness", () => {
    const parsed = sourceQueryResultSchema.parse({
      queryId: "account.summary",
      rowSchemaVersion: "account.summary/v3",
      status: "unavailable",
      rows: [],
      returnedRowCount: 0,
      wholeResultTotal: { value: null, availability: "error", reason: "SOURCE_UNAVAILABLE" },
      lineage: {
        ...lineage,
        window: { from: "2026-08-24", to: "2026-08-24", preset: "custom" },
        datasetVersion: null,
        dataAsOf: null,
        timezone: null,
        dayCut: null,
        metadataAvailability: "unknown",
        coverage: { complete: false, reason: "Source unavailable" },
        partial: true,
      },
      warnings: ["Source unavailable"],
      error: {
        code: "SOURCE_UNAVAILABLE",
        message: "Source unavailable",
        retryable: true,
        requestId: "request-fixture",
      },
    });

    expect(parsed.lineage.dataAsOf).toBeNull();
    expect(parsed.lineage.metadataAvailability).toBe("unknown");
    expect(() => sourceQueryResultSchema.parse({
      ...parsed,
      lineage: {
        ...parsed.lineage,
        dataAsOf: "2026-08-24T08:00:00.000Z",
      },
    })).toThrow(/unknown lineage/i);
  });

  it("requires frozen source-authority metadata instead of an adapter-selected priority", () => {
    expect(() => sourceQueryResultSchema.parse({
      queryId: "account.summary",
      rowSchemaVersion: "account.summary/v2",
      status: "ready",
      rows: [],
      returnedRowCount: 0,
      wholeResultTotal: { value: 0, availability: "available" },
      lineage: { ...lineage, authority: undefined },
      warnings: [],
    })).toThrow();
  });

  it("keeps KA Data and platform independent in reconcile mode", () => {
    const source = {
      queryId: "reconcile.account_daily",
      rowSchemaVersion: "reconcile.account_daily/v2",
      status: "ready",
      rows: [{
        workspaceId: "00000000-0000-4000-8000-000000000024",
        media: "KUAISHOU",
        accountId: "fixture-account",
        accountName: null,
        ownerUserId: null,
        ds: "2026-08-24",
        metrics: dailyMetrics,
        dataAnomaly: false,
        computedAt: null,
        tasks: [],
      }],
      returnedRowCount: 1,
      wholeResultTotal: { value: 1, availability: "available" },
      lineage,
      warnings: [],
    };
    const response = dataQueryResponseSchema.parse({
      ok: true,
      data: {
        mode: "reconcile",
        kaData: source,
        platform: {
          ...source,
          lineage: { ...lineage, source: "canonical" },
        },
        comparison: {
          status: "unavailable",
          reason: "reconciliation_engine_pending",
          rows: [],
        },
      },
    });

    expect(response.ok).toBe(true);
    if (response.ok && response.data.mode === "reconcile") {
      expect(response.data.kaData.rows).toHaveLength(1);
      expect(response.data.platform.rows).toHaveLength(1);
      expect(response.data).not.toHaveProperty("value");
      expect(response.data).not.toHaveProperty("primary");
    }
  });

  it("uses a stable non-leaking error envelope", () => {
    expect(dataQueryResponseSchema.parse({
      ok: false,
      error: {
        code: "QUERY_NOT_ALLOWED",
        message: "The requested query is not available",
        retryable: false,
        requestId: "request-fixture",
      },
    })).toMatchObject({ ok: false, error: { code: "QUERY_NOT_ALLOWED" } });
  });

  it("forbids stale or partial values from being declared comparable", () => {
    expect(() => reconcileMetricSchema.parse({
      kaData: { value: 10, availability: "stale" },
      platform: { value: 11, availability: "available" },
      delta: { value: 1, availability: "available" },
      deltaRate: { value: 0.1, availability: "available" },
      comparable: true,
    })).toThrow(/available source values/i);
  });
});
