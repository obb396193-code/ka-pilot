import { describe, expect, it } from "vitest";

import {
  QueryRegistryError,
  createDataQueryRegistry,
} from "../src/data/query-registry.js";

describe("DataQueryRegistry", () => {
  const registry = createDataQueryRegistry();

  it("exposes only implemented frozen query ids with explicit budgets", () => {
    expect(registry.list().map((entry) => entry.queryId)).toEqual([
      "account.anomalies",
      "account.detail",
      "account.dimension",
      "account.gap",
      "account.hourly",
      "account.pivot2",
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
      expect(entry.queryTemplateVersion).toMatch(/(?:^|-)v\d+$/);
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

  it.each(["account.summary", "account.trend", "account.table", "account.anomalies", "account.detail", "reconcile.account_daily"])("normalizes frozen date_from/date_to in the existing %s definition", (queryId) => {
    const extra = queryId === "account.detail" ? { accountId: "synthetic" } : {};
    const mode = queryId === "reconcile.account_daily" ? "reconcile" : "platform";
    const snake = registry.resolve(queryId, { date_from: "20260824", date_to: "2026-08-25", ...extra }, mode);
    const camel = registry.resolve(queryId, { dateFrom: "2026-08-24", dateTo: "2026-08-25", ...extra }, mode);
    expect(snake.params).toEqual(camel.params);
    expect(snake.params).not.toHaveProperty("date_from");
    expect(snake.rowSchemaVersion).toBe(camel.rowSchemaVersion);
  });

  it.each([
    { date: "2026-08-24", date_from: "2026-08-24", date_to: "2026-08-24" },
    { dateFrom: "2026-08-24", dateTo: "2026-08-25", date_from: "2026-08-24", date_to: "2026-08-25" },
    { date_from: "2026-08-24", dateTo: "2026-08-25" },
    { date_from: "2026-08-24" }, { date_to: "2026-08-24" },
    { date_from: "2026-08-25", date_to: "2026-08-24" },
    { date_from: "2026-01-01", date_to: "2026-12-31" },
    { date: "2026--08-24" }, { date: "2026-8-24" },
  ])("rejects ambiguous, malformed or unbounded date inputs", (params) => {
    expect(() => registry.resolve("account.summary", params, "platform")).toThrow(QueryRegistryError);
  });

  it("generates identical scoped SQL for snake/camel date inputs without a parallel query path", () => {
    const snake = registry.resolve("account.summary", { date_from: "2026-08-24", date_to: "2026-08-25" }, "ka_data");
    const camel = registry.resolve("account.summary", { dateFrom: "2026-08-24", dateTo: "2026-08-25" }, "ka_data");
    const accounts = [{ media: "KUAISHOU", accountId: "synthetic" }];
    expect(registry.buildKaDataPlan(snake, accounts)).toEqual(registry.buildKaDataPlan(camel, accounts));
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
    ).sql).toContain("COUNT(DISTINCT CASE WHEN observed_account_id IS NOT NULL THEN media || ':' || account_id END)");
    expect(plan.sql).not.toContain("undefined");
  });
});
