import { describe, expect, it } from "vitest";

import {
  QueryRegistryError,
  createDataQueryRegistry,
} from "../src/data/query-registry.js";

describe("DataQueryRegistry", () => {
  const registry = createDataQueryRegistry();

  it("exposes only the six frozen query ids with explicit budgets", () => {
    expect(registry.list().map((entry) => entry.queryId)).toEqual([
      "account.anomalies",
      "account.detail",
      "account.summary",
      "account.table",
      "account.trend",
      "reconcile.account_daily",
    ]);
    for (const entry of registry.list()) {
      expect(entry.maxRows).toBeGreaterThan(0);
      expect(entry.maxRows).toBeLessThanOrEqual(10_000);
      expect(entry.maxDateSpanDays).toBeGreaterThan(0);
      expect(entry.supportedViews.length).toBeGreaterThan(0);
      expect(entry.queryTemplateVersion).toMatch(/^v\d+$/);
    }
  });

  it("rejects unknown query ids and raw SQL", () => {
    expect(() => registry.resolve("raw.sql", {}, "ka_data")).toThrow(QueryRegistryError);
    expect(() => registry.resolve("account.summary", {
      date: "2026-08-24",
      sql: "select * from dwd_account_daily",
    }, "ka_data")).toThrow(/parameter/i);
  });

  it("rejects forged identity and unknown fields", () => {
    expect(() => registry.resolve("account.summary", {
      date: "2026-08-24",
      workspaceId: "forged-workspace",
    }, "ka_data")).toThrow(/parameter/i);
    expect(() => registry.resolve("account.summary", {
      date: "2026-08-24",
      userId: "forged-user",
    }, "ka_data")).toThrow(/parameter/i);
  });

  it("normalizes single-day and interval dates and rejects overlong ranges", () => {
    expect(registry.resolve("account.summary", { date: "20260824" }, "ka_data").params)
      .toMatchObject({ dateFrom: "2026-08-24", dateTo: "2026-08-24" });
    expect(() => registry.resolve("account.summary", {
      dateFrom: "2026-01-01",
      dateTo: "2026-03-01",
    }, "ka_data")).toThrow(/date range/i);
  });

  it("enforces view support and declares account scope", () => {
    expect(() => registry.resolve("reconcile.account_daily", {
      date: "2026-08-24",
    }, "platform")).toThrow(/view/i);
    expect(registry.resolve("account.detail", {
      date: "2026-08-24",
      accountId: "fixture-account",
    }, "platform").accountScope).toBe("required_one");
  });

  it("declares the frozen authority policy in the registry, not in adapters", () => {
    expect(registry.resolve("account.trend", {
      dateFrom: "2026-08-01",
      dateTo: "2026-08-23",
    }, "ka_data").authorityPolicy).toMatchObject({
      useCase: "historical_analysis",
      defaultSource: "ka_data",
    });
    expect(registry.resolve("account.anomalies", {
      date: "2026-08-24",
    }, "platform").authorityPolicy).toMatchObject({
      useCase: "diagnostics",
      defaultSource: "platform",
    });
    expect(registry.resolve("reconcile.account_daily", {
      date: "2026-08-24",
    }, "reconcile").authorityPolicy).toMatchObject({
      useCase: "source_versioned_financials",
      defaultSource: "source_versioned",
    });
  });

  it("uses platform authority for current-day delivery while keeping historical summaries on KA Data", () => {
    const datedRegistry = createDataQueryRegistry({ today: () => "2026-08-24" });
    expect(datedRegistry.resolve("account.summary", {
      date: "2026-08-24",
    }, "platform").authorityPolicy).toMatchObject({
      useCase: "realtime_delivery",
      defaultSource: "platform",
    });
    expect(datedRegistry.resolve("account.summary", {
      date: "2026-08-23",
    }, "ka_data").authorityPolicy).toMatchObject({
      useCase: "cross_media_operations",
      defaultSource: "ka_data",
    });
  });

  it("builds SQL only from validated parameters", () => {
    const resolved = registry.resolve("account.table", {
      date: "2026-08-24",
      media: "KUAISHOU",
      accountIds: ["fixture-1", "fixture-2"],
      page: 1,
      pageSize: 50,
    }, "ka_data");
    const plan = registry.buildKaDataPlan(resolved, [
      { media: "KUAISHOU", accountId: "fixture-1" },
      { media: "KUAISHOU", accountId: "fixture-2" },
    ]);

    expect(plan.backend).toBe("sqlite");
    expect(plan.limit).toBeLessThanOrEqual(10_000);
    expect(plan.sql).toContain("dwd_account_daily");
    expect(plan.sql).toContain("'fixture-1'");
    expect(plan.sql).toContain("media = 'KUAISHOU'");
    expect(registry.buildKaDataPlan(
      registry.resolve("account.summary", { date: "2026-08-24" }, "ka_data"),
      [
        { media: "KUAISHOU", accountId: "same-id" },
        { media: "TENCENT", accountId: "same-id" },
      ],
    ).sql).toContain("COUNT(DISTINCT media || ':' || account_id)");
    expect(plan.sql).not.toContain("undefined");
  });
});
