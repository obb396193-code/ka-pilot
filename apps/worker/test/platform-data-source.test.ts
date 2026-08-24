import { describe, expect, it, vi } from "vitest";

import { createDataQueryRegistry } from "../src/data/query-registry.js";
import { PlatformDataSource } from "../src/data/platform-data-source.js";

const scope = {
  workspaceId: "workspace-fixture",
  userId: "user-fixture",
  accounts: [{ media: "KUAISHOU", accountId: "account-1" }],
};

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
      querySummary: vi.fn(async () => ({ rowCount: 1, cost: 12 })),
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
      rows: [{ rowCount: 1, cost: 12 }],
      lineage: {
        source: "canonical",
        dataAsOf: "2026-08-24T07:59:00.000Z",
        datasetVersion: null,
        metadataAvailability: "partial",
      },
    });
  });

  it("marks incomplete canonical coverage partial and withholds whole-result totals", async () => {
    const repository = {
      querySummary: vi.fn(async () => ({ rowCount: 0, cost: 0 })),
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
      queryTrend: vi.fn(async () => [{ ds: "2026-08-24", metrics: { rowCount: 1, cost: 12 } }]),
      queryTable: vi.fn(),
      queryLineage: vi.fn(async () => lineage()),
    };
    const source = new PlatformDataSource(repository as never);
    const result = await source.query(
      createDataQueryRegistry().resolve("account.trend", { date: "2026-08-24" }, "platform"),
      scope,
    );
    expect(result.rows).toEqual([{ ds: "2026-08-24", metrics: { rowCount: 1, cost: 12 } }]);
    expect(result.lineage.datasetVersion).toBeNull();
  });

  it("uses canonical pagination for account.table", async () => {
    const repository = {
      querySummary: vi.fn(),
      queryTrend: vi.fn(),
      queryTable: vi.fn(async () => ({
        rows: [{
          workspaceId: scope.workspaceId,
          media: "KUAISHOU",
          accountId: "account-1",
          ds: "2026-08-24",
        }],
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
    const row = {
      workspaceId: scope.workspaceId,
      media: "KUAISHOU",
      accountId: "account-1",
      ds: "2026-08-24",
    };
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
    expect(result.wholeResultTotal).toMatchObject({ value: null, availability: "partial" });
  });

  it("keeps an exact 2,000-row result complete when repository total proves no rows are missing", async () => {
    const row = {
      workspaceId: scope.workspaceId,
      media: "KUAISHOU",
      accountId: "account-1",
      ds: "2026-08-24",
    };
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
});
