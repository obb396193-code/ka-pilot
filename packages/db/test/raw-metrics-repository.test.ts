import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import { RawMetricsRepository } from "../src/raw-metrics-repository.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("RawMetricsRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new RawMetricsRepository(pool);
  const workspaceA = "11111111-1111-4111-8111-111111111111";
  const workspaceB = "22222222-2222-4222-8222-222222222222";

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM metrics_raw");
  });

  it("persists replay parameters and loads only the latest resource row per tenant", async () => {
    await repository.appendRaw([
      {
        workspaceId: workspaceA,
        accountId: "same-account",
        ds: "2026-08-19",
        resource: "account_offline",
        source: "offline",
        requestParams: { beginDate: "2026-08-19", accountIds: ["same-account"] },
        payload: { account_id: "same-account", cost_api: 10 },
        fetchedByUserId: null,
      },
      {
        workspaceId: workspaceA,
        accountId: "same-account",
        ds: "2026-08-19",
        resource: "account_offline",
        source: "offline",
        requestParams: { beginDate: "2026-08-19", accountIds: ["same-account"] },
        payload: { account_id: "same-account", cost_api: 11 },
        fetchedByUserId: null,
      },
      {
        workspaceId: workspaceA,
        accountId: "same-account",
        ds: "2026-08-19",
        resource: "account_realtime",
        source: "realtime",
        requestParams: { ds: "2026-08-19", accountIds: ["same-account"] },
        payload: { account_id: "same-account", account_conversion: 3 },
        fetchedByUserId: null,
      },
      {
        workspaceId: workspaceB,
        accountId: "same-account",
        ds: "2026-08-19",
        resource: "account_realtime",
        source: "realtime",
        requestParams: { ds: "2026-08-19" },
        payload: { account_id: "same-account", account_conversion: 99 },
        fetchedByUserId: null,
      },
    ]);

    await expect(
      repository.loadMergeInputs({
        workspaceId: workspaceA,
        dateFrom: "2026-08-19",
        dateTo: "2026-08-19",
        reportDate: "2026-08-20",
      }),
    ).resolves.toEqual([
      {
        workspaceId: workspaceA,
        accountId: "same-account",
        ds: "2026-08-19",
        reportDate: "2026-08-20",
        offline: { account_id: "same-account", cost_api: 11 },
        realtime: { account_id: "same-account", account_conversion: 3 },
      },
    ]);

    const replay = await pool.query<{ request_params: Record<string, unknown> }>(
      `SELECT request_params FROM metrics_raw
       WHERE workspace_id = $1 AND resource = 'account_offline'
       ORDER BY id DESC LIMIT 1`,
      [workspaceA],
    );
    expect(replay.rows[0]?.request_params).toEqual({
      beginDate: "2026-08-19",
      accountIds: ["same-account"],
    });
  });
});
