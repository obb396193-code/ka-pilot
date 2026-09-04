import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { runMigrations } from "../src/migrate.js";
import {
  AccountListRepository,
  AccountListRepositoryContractError,
  type AccountListRepositoryPool,
} from "../src/account-list-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("AccountListRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  const repository = new AccountListRepository(pool);
  let workspaceId: string;
  let otherWorkspaceId: string;
  let ownerId: string;

  beforeAll(async () => runMigrations({ databaseUrl }));
  afterAll(async () => pool.end());

  beforeEach(async () => {
    const suffix = randomUUID();
    const workspaces = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id",
      [`account-list-${suffix}`, `account-list-other-${suffix}`],
    );
    workspaceId = workspaces.rows[0]!.id;
    otherWorkspaceId = workspaces.rows[1]!.id;
    ownerId = (await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, buc_id, name)
       VALUES ($1, $2, '脱敏优化师') RETURNING id`,
      [workspaceId, `account-list-owner-${suffix}`],
    )).rows[0]!.id;

    await pool.query(
      `INSERT INTO accounts (
         workspace_id, media, account_id, account_name, owner_user_id,
         lifecycle_stage, is_starred, tags, status
       ) VALUES
         ($1, 'KUAISHOU', 'decline', '衰退账户', $3, 'declining', false, ARRAY['重点','测试'], 'active'),
         ($1, 'KUAISHOU', 'cold', '冷启动账户', NULL, 'cold_start', true, ARRAY['重点'], 'active'),
         ($1, 'KUAISHOU', 'stable', NULL, NULL, 'stable', false, ARRAY[]::text[], NULL),
         ($1, 'KUAISHOU', 'unapproved', '未授权账户', NULL, 'declining', true, ARRAY['重点','测试'], 'active'),
         ($1, 'TENCENT', 'decline', '跨媒体同号账户', NULL, 'declining', true, ARRAY['重点'], 'active'),
         ($2, 'KUAISHOU', 'decline', '跨租户同号账户', NULL, 'declining', true, ARRAY['重点'], 'active')`,
      [workspaceId, otherWorkspaceId, ownerId],
    );
    await pool.query(
      `INSERT INTO tasks (workspace_id, task_id, task_name, status) VALUES
         ($1, 'task-a', '任务甲', 'active'), ($1, 'task-b', '任务乙', 'active')`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO task_accounts (
         workspace_id, task_id, media, account_id, valid_from, valid_to
       ) VALUES
         ($1, 'task-b', 'KUAISHOU', 'decline', '2026-08-01', '2026-08-10'),
         ($1, 'task-a', 'KUAISHOU', 'decline', '2026-08-11', '2026-08-20'),
         ($1, 'task-missing', 'KUAISHOU', 'decline', '2026-08-21', NULL),
         ($1, 'task-a', 'KUAISHOU', 'cold', '2026-08-26', NULL)`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO account_metrics_daily (
         workspace_id, media, account_id, ds, cost, real_conversion,
         assessment_price_snapshot, computed_at
       ) VALUES
         ($1, 'KUAISHOU', 'decline', '2026-08-25', 120.5, 8, 38, '2026-08-25T12:00:00Z'),
         ($1, 'KUAISHOU', 'cold', '2026-08-25', 50, 0, NULL, '2026-08-25T12:30:00Z'),
         ($1, 'KUAISHOU', 'unapproved', '2026-08-25', 9999, 999, 99, '2026-08-25T14:00:00Z'),
         ($1, 'TENCENT', 'decline', '2026-08-25', 8888, 888, 88, '2026-08-25T15:00:00Z'),
         ($2, 'KUAISHOU', 'decline', '2026-08-25', 7777, 777, 77, '2026-08-25T16:00:00Z')`,
      [workspaceId, otherWorkspaceId],
    );
    await pool.query(
      `INSERT INTO account_balance (workspace_id, media, account_id, balance, synced_at)
       VALUES
         ($1, 'KUAISHOU', 'decline', 1000, '2026-08-25T11:00:00Z'),
         ($1, 'KUAISHOU', 'cold', NULL, '2026-08-25T11:30:00Z')`,
      [workspaceId],
    );
  });

  const baseQuery = () => ({
    workspaceId,
    requestingUserId: ownerId,
    businessDate: "2026-08-25",
    scopeKind: "explicit_accounts" as const,
    allowedAccounts: [
      { media: "KUAISHOU", accountId: "decline" },
      { media: "KUAISHOU", accountId: "cold" },
      { media: "KUAISHOU", accountId: "stable" },
    ],
    page: 1,
    pageSize: 20,
  });

  it("returns only approved tuples in frozen stable order with canonical facts", async () => {
    const result = await repository.list(baseQuery());
    expect(result.total).toBe(3);
    expect(result.rows.map((row) => row.accountId)).toEqual(["cold", "decline", "stable"]);
    expect(result.rows[1]).toMatchObject({
      workspaceId,
      media: "KUAISHOU",
      accountId: "decline",
      owner: { userId: ownerId, displayName: "脱敏优化师" },
      linkedTasks: [
        { taskId: "task-missing", taskName: null },
      ],
      metricDate: "2026-08-25",
      cost: 120.5,
      realConversion: 8,
      assessmentPrice: 38,
      dataAsOf: "2026-08-25T12:00:00.000Z",
      balance: 1000,
      balanceSyncedAt: "2026-08-25T11:00:00.000Z",
    });
    expect(result.rows.some((row) => row.accountName === "未授权账户")).toBe(false);
    expect(result.metricsComplete).toBe(false);
  });

  it("reads every account only inside the approved team workspace and media", async () => {
    const result = await repository.list({
      ...baseQuery(),
      scopeKind: "team_workspace_readonly",
      allowedAccounts: [],
    });
    expect(result.total).toBe(4);
    expect(result.rows.every((row) =>
      row.workspaceId === workspaceId && row.media === "KUAISHOU")).toBe(true);
    expect(result.rows.some((row) => row.accountName === "未授权账户")).toBe(true);
    expect(result.rows.some((row) => row.accountName === "跨媒体同号账户")).toBe(false);
    expect(result.rows.some((row) => row.accountName === "跨租户同号账户")).toBe(false);
  });

  it("applies parameterized frozen filters including tag AND semantics", async () => {
    expect((await repository.list({ ...baseQuery(), q: "衰退" })).rows[0]?.accountId).toBe("decline");
    expect((await repository.list({ ...baseQuery(), q: "cold" })).rows[0]?.accountId).toBe("cold");
    expect((await repository.list({ ...baseQuery(), stage: "stable" })).rows[0]?.accountId).toBe("stable");
    expect((await repository.list({ ...baseQuery(), starred: true })).rows[0]?.accountId).toBe("cold");
    expect((await repository.list({ ...baseQuery(), tags: ["重点", "测试"] })).rows[0]?.accountId).toBe("decline");
    expect((await repository.list({ ...baseQuery(), ownerUserId: ownerId })).rows[0]?.accountId).toBe("decline");
    expect((await repository.list({ ...baseQuery(), status: "active" })).total).toBe(2);
    expect((await repository.list({ ...baseQuery(), q: "%' OR true --" })).total).toBe(0);
  });

  it("keeps missing metrics and balance explicit without substituting zero", async () => {
    const rows = (await repository.list(baseQuery())).rows;
    const cold = rows.find((row) => row.accountId === "cold")!;
    const stable = rows.find((row) => row.accountId === "stable")!;
    expect(cold).toMatchObject({ cost: 50, realConversion: 0, balance: null, balanceSyncedAt: null });
    expect(stable).toMatchObject({ metricDate: null, cost: null, realConversion: null, dataAsOf: null });
  });

  it("rejects a present-invalid numeric instead of converting it to missing data", async () => {
    await pool.query(
      `UPDATE account_metrics_daily
       SET cost = 'NaN'::numeric
       WHERE workspace_id = $1 AND media = 'KUAISHOU' AND account_id = 'decline'`,
      [workspaceId],
    );
    await expect(repository.list(baseQuery())).rejects.toBeInstanceOf(
      AccountListRepositoryContractError,
    );
  });

  it("reports coverage/readiness conservatively for missing or empty scope", async () => {
    expect((await repository.list(baseQuery())).initialFullComplete).toBe(false);
    const missing = await repository.list({
      ...baseQuery(),
      scopeKind: "explicit_accounts" as const,
      allowedAccounts: [...baseQuery().allowedAccounts, { media: "KUAISHOU", accountId: "missing" }],
    });
    expect(missing.coverageComplete).toBe(false);
    const empty = await repository.list({ ...baseQuery(), allowedAccounts: [] });
    expect(empty).toMatchObject({ total: 0, coverageComplete: false, initialFullComplete: false });

    const job = await pool.query<{ id: string }>(
      `INSERT INTO jobs (workspace_id, job_type, payload, credential_owner_user_id, status)
       VALUES ($1, 'etl_full', '{"media":"KUAISHOU"}'::jsonb, $2, 'done') RETURNING id`,
      [workspaceId, ownerId],
    );
    await pool.query(
      `INSERT INTO etl_runs (workspace_id, job_id, run_kind, scope, status, rows_ingested)
       VALUES ($1, $2, 'full', '{}'::jsonb, 'done', 1)`,
      [workspaceId, job.rows[0]!.id],
    );
    expect((await repository.list(baseQuery())).initialFullComplete).toBe(true);
  });

  it("rejects malformed and duplicate scope before opening a query", async () => {
    await expect(repository.list({
      ...baseQuery(), allowedAccounts: [{ media: "", accountId: "decline" }],
    })).rejects.toThrow("allowedAccounts");
    await expect(repository.list({
      ...baseQuery(),
      scopeKind: "explicit_accounts" as const,
      allowedAccounts: [
        { media: "KUAISHOU", accountId: "decline" },
        { media: "KUAISHOU", accountId: "decline" },
      ],
    })).rejects.toThrow("duplicate");
    await expect(repository.list({
      ...baseQuery(),
      scopeKind: "team_workspace_readonly",
    })).rejects.toThrow("must not carry account grants");
  });

  it("holds total, page and readiness in one repeatable-read read-only snapshot", async () => {
    let inserted = false;
    const instrumentedPool: AccountListRepositoryPool = {
      connect: async () => {
        const client = await pool.connect();
        return {
          query: async <Row extends QueryResultRow>(sql: string, values?: unknown[]) => {
            const result = await client.query<Row>(sql, values);
            if (!inserted && sql.includes("account-list-total")) {
              inserted = true;
              await pool.query(
                `INSERT INTO accounts (workspace_id, media, account_id, account_name)
                 VALUES ($1, 'KUAISHOU', 'snapshot-new', '并发新增账户')`,
                [workspaceId],
              );
            }
            return result as QueryResult<Row>;
          },
          release: () => client.release(),
        } as Pick<PoolClient, "query" | "release">;
      },
    };
    const scope = [...baseQuery().allowedAccounts, { media: "KUAISHOU", accountId: "snapshot-new" }];
    const snapshotRepository = new AccountListRepository(instrumentedPool);
    const first = await snapshotRepository.list({ ...baseQuery(), allowedAccounts: scope });
    expect(first.total).toBe(3);
    expect(first.rows.some((row) => row.accountId === "snapshot-new")).toBe(false);
    expect((await repository.list({ ...baseQuery(), allowedAccounts: scope })).total).toBe(4);
  });
});
