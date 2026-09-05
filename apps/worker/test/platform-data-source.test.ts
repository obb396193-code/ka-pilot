import { describe, expect, it, vi } from "vitest";

import { createDataQueryRegistry } from "../src/data/query-registry.js";
import {
  PlatformDataSource,
  PlatformDataSourceError,
} from "../src/data/platform-data-source.js";

const scope = {
  workspaceId: "00000000-0000-4000-8000-000000000024",
  userId: "user-fixture",
  scopeKind: "explicit_accounts" as const,
  accounts: [{ media: "KUAISHOU", accountId: "account-1" }],
};

function summary(cost: number, rowCount = 1) {
  return {
    rowCount,
    accountCount: rowCount === 0 ? 0 : 1,
    anomalyRows: 0,
    cost,
    exposure: rowCount * 100,
    click: rowCount * 10,
    conversion: rowCount * 2,
    realConversion: rowCount,
    cashCost: cost,
    costSpace: 0,
    wakeUv: 0,
    potentialUv: 0,
  };
}

function daily(dataAnomaly = false) {
  return {
    workspaceId: scope.workspaceId,
    media: "KUAISHOU",
    accountId: "account-1",
    accountName: null,
    ownerUserId: null,
    ds: "2026-08-24",
    cost: 12,
    exposure: 100,
    click: 10,
    conversion: 2,
    realConversion: 1,
    cashCost: 12,
    costSpace: 0,
    wakeUv: null,
    potentialUv: null,
    budget: null,
    budgetUsageRate: null,
    deductionRate: null,
    mainAdCostProportion: null,
    assessmentPriceSnapshot: null,
    dataAnomaly,
    computedAt: "2026-08-24T08:00:00.000Z",
    tasks: [],
  };
}

function lineage(complete = true) {
  return {
    dataAsOf: "2026-08-24T07:59:00.000Z",
    canonicalRows: 1,
    returnedAccounts: complete ? 1 : 0,
    requestedAccountDays: 1,
    returnedAccountDays: complete ? 1 : 0,
  };
}

describe("PlatformDataSource", () => {
  it("queries canonical summary with the authenticated account scope", async () => {
    const repository = {
      querySummary: vi.fn(async () => summary(12)),
      queryTrend: vi.fn(),
      queryTable: vi.fn(),
      queryLineage: vi.fn(async () => lineage()),
    };
    const source = new PlatformDataSource(repository as never);
    const result = await source.query(
      createDataQueryRegistry().resolve("account.summary", { date: "2026-08-24" }, "platform"),
      scope,
    );
    expect(repository.querySummary).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: scope.workspaceId,
      filters: {
        accountScopes: [{ media: "KUAISHOU", accountId: "account-1" }],
      },
    }));
    expect(result).toMatchObject({
      status: "ready",
      rows: [{ rowCount: 1, accountCount: 1, metrics: expect.objectContaining({ cost: { value: 12, availability: "available" } }) }],
      lineage: {
        source: "canonical",
        dataAsOf: "2026-08-24T07:59:00.000Z",
        datasetVersion: null,
        metadataAvailability: "partial",
        timezone: null,
        dayCut: null,
      },
    });
  });

  it("marks incomplete canonical coverage partial and withholds whole-result totals", async () => {
    const repository = {
      querySummary: vi.fn(async () => summary(0, 0)),
      queryTrend: vi.fn(),
      queryTable: vi.fn(),
      queryLineage: vi.fn(async () => lineage(false)),
    };
    const source = new PlatformDataSource(repository as never);
    const result = await source.query(
      createDataQueryRegistry().resolve("account.summary", { date: "2026-08-24" }, "platform"),
      scope,
    );
    expect(result.lineage.partial).toBe(true);
    expect(result.wholeResultTotal).toMatchObject({ value: null, availability: "partial" });
  });

  it("maps canonical trend rows without inventing a dataset version", async () => {
    const repository = {
      querySummary: vi.fn(),
      queryTrend: vi.fn(async () => [{ ds: "2026-08-24", metrics: summary(12) }]),
      queryTable: vi.fn(),
      queryLineage: vi.fn(async () => lineage()),
    };
    const source = new PlatformDataSource(repository as never);
    const result = await source.query(
      createDataQueryRegistry().resolve("account.trend", { date: "2026-08-24" }, "platform"),
      scope,
    );
    expect(result.rows).toEqual([expect.objectContaining({
      ds: "2026-08-24",
      metrics: expect.objectContaining({ rowCount: 1, metrics: expect.objectContaining({ cost: { value: 12, availability: "available" } }) }),
    })]);
    expect(result.lineage.datasetVersion).toBeNull();
  });

  it("uses canonical pagination for account.table", async () => {
    const repository = {
      querySummary: vi.fn(),
      queryTrend: vi.fn(),
      queryTable: vi.fn(async () => ({
        rows: [daily()],
        total: 9,
        page: 2,
        pageSize: 5,
      })),
      queryLineage: vi.fn(async () => lineage()),
    };
    const source = new PlatformDataSource(repository as never);
    const result = await source.query(
      createDataQueryRegistry().resolve(
        "account.table",
        { date: "2026-08-24", page: 2, pageSize: 5 },
        "platform",
      ),
      scope,
    );
    expect(repository.queryTable).toHaveBeenCalledWith(expect.objectContaining({ page: 2, pageSize: 5 }));
    expect(result.wholeResultTotal).toEqual({ value: 9, availability: "available" });
  });

  it("paginates anomaly rows and marks a result beyond the registry budget truncated", async () => {
    const row = daily(true);
    const repository = {
      querySummary: vi.fn(),
      queryTrend: vi.fn(),
      queryTable: vi.fn(async (input: { page?: number; pageSize?: number }) => ({
        rows: Array.from(
          { length: input.page === 5 ? 1 : 500 },
          () => ({ ...row }),
        ),
        total: 2_001,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 500,
      })),
      queryLineage: vi.fn(async () => lineage()),
    };
    const source = new PlatformDataSource(repository as never);
    const result = await source.query(
      createDataQueryRegistry().resolve(
        "account.anomalies",
        { date: "2026-08-24" },
        "platform",
      ),
      scope,
    );
    expect(repository.queryTable).toHaveBeenCalledTimes(4);
    expect(repository.queryTable).toHaveBeenCalledWith(expect.objectContaining({
      filters: expect.objectContaining({ dataAnomaly: true }),
    }));
    expect(result.returnedRowCount).toBe(2_000);
    expect(result.lineage).toMatchObject({ truncated: true, partial: true });
    expect(result.rows[0]).toMatchObject({ metrics: { cost: { value: null, availability: "error" } } });
    expect(result.wholeResultTotal).toMatchObject({ value: null, availability: "partial" });
  });

  it("keeps an exact 2,000-row result complete when repository total proves no rows are missing", async () => {
    const row = daily(true);
    const repository = {
      querySummary: vi.fn(),
      queryTrend: vi.fn(),
      queryTable: vi.fn(async (input: { page?: number; pageSize?: number }) => ({
        rows: Array.from({ length: 500 }, () => ({ ...row })),
        total: 2_000,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 500,
      })),
      queryLineage: vi.fn(async () => lineage()),
    };
    const source = new PlatformDataSource(repository as never);
    const result = await source.query(
      createDataQueryRegistry().resolve(
        "account.anomalies",
        { date: "2026-08-24" },
        "platform",
      ),
      scope,
    );

    expect(repository.queryTable).toHaveBeenCalledTimes(4);
    expect(result.returnedRowCount).toBe(2_000);
    expect(result.lineage).toMatchObject({ truncated: false, partial: false });
    expect(result.rows[0]).toMatchObject({ metrics: { cost: { availability: "available" } } });
    expect(result.wholeResultTotal).toEqual({ value: 2_000, availability: "available" });
  });

  it("returns an explicit unavailable source when a canonical capability is unavailable", async () => {
    const repository = {
      querySummary: vi.fn(),
      queryTrend: vi.fn(),
      queryTable: vi.fn(async () => { throw new Error("secret SQL detail"); }),
      queryLineage: vi.fn(async () => lineage()),
    };
    const source = new PlatformDataSource(repository as never);
    const result = await source.query(
      createDataQueryRegistry().resolve("account.anomalies", { date: "2026-08-24" }, "platform"),
      scope,
    );
    expect(result).toMatchObject({
      status: "unavailable",
      error: { code: "SOURCE_UNAVAILABLE" },
      lineage: { metadataAvailability: "unknown", dataAsOf: null },
    });
    expect(JSON.stringify(result)).not.toContain("secret SQL detail");
  });

  it("throws a stable contract error when canonicalization fails", async () => {
    const repository = {
      querySummary: vi.fn(async () => ({ ...summary(12), cost: "not-a-number" })),
      queryTrend: vi.fn(),
      queryTable: vi.fn(),
      queryLineage: vi.fn(async () => lineage()),
    };
    const source = new PlatformDataSource(repository as never);
    await expect(source.query(
      createDataQueryRegistry().resolve("account.summary", { date: "2026-08-24" }, "platform"),
      scope,
    )).rejects.toBeInstanceOf(PlatformDataSourceError);
  });

  it("fails closed when lineage returns more accounts than the authenticated scope", async () => {
    const repository = {
      querySummary: vi.fn(async () => summary(12)),
      queryTrend: vi.fn(),
      queryTable: vi.fn(),
      queryLineage: vi.fn(async () => ({ ...lineage(), returnedAccounts: 2 })),
    };
    const source = new PlatformDataSource(repository as never);
    await expect(source.query(
      createDataQueryRegistry().resolve("account.summary", { date: "2026-08-24" }, "platform"),
      scope,
    )).rejects.toBeInstanceOf(PlatformDataSourceError);
  });

  it("fails closed when aggregate and lineage object counts come from inconsistent snapshots", async () => {
    const repository = {
      querySummary: vi.fn(async () => summary(12)),
      queryTrend: vi.fn(),
      queryTable: vi.fn(),
      queryLineage: vi.fn(async () => ({ ...lineage(), returnedAccounts: 0 })),
    };
    const source = new PlatformDataSource(repository as never);
    await expect(source.query(
      createDataQueryRegistry().resolve("account.summary", { date: "2026-08-24" }, "platform"),
      scope,
    )).rejects.toBeInstanceOf(PlatformDataSourceError);
  });

  it("maps repository numeric contract errors to the stable Platform contract error", async () => {
    const repositoryError = new Error("database value is invalid");
    repositoryError.name = "SemanticQueryContractError";
    const repository = {
      querySummary: vi.fn(async () => { throw repositoryError; }),
      queryTrend: vi.fn(),
      queryTable: vi.fn(),
      queryLineage: vi.fn(async () => lineage()),
    };
    const source = new PlatformDataSource(repository as never);
    await expect(source.query(
      createDataQueryRegistry().resolve("account.summary", { date: "2026-08-24" }, "platform"),
      scope,
    )).rejects.toBeInstanceOf(PlatformDataSourceError);
  });
});
