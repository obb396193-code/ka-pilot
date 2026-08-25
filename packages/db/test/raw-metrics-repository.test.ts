import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
    await pool.query("DROP TRIGGER IF EXISTS reject_account_sync ON accounts");
    await pool.query("DROP FUNCTION IF EXISTS reject_account_sync()");
    await pool.query("DELETE FROM metrics_raw");
    await pool.query(
      `INSERT INTO workspaces (id, name)
       VALUES ($1, 'raw-a'), ($2, 'raw-b')
       ON CONFLICT (id) DO NOTHING`,
      [workspaceA, workspaceB],
    );
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'same-account'), ($2, 'KUAISHOU', 'same-account')
       ON CONFLICT (workspace_id, media, account_id) DO NOTHING`,
      [workspaceA, workspaceB],
    );
  });

  afterAll(async () => {
    await pool.query("DROP TRIGGER IF EXISTS reject_account_sync ON accounts");
    await pool.query("DROP FUNCTION IF EXISTS reject_account_sync()");
    await pool.end();
  });

  it("atomically creates trusted account tuples before raw and replays without duplicate accounts", async () => {
    const accountId = `new-${randomUUID()}`;
    const record = {
      workspaceId: workspaceA,
      media: "KUAISHOU",
      accountId,
      ds: "2026-08-25",
      resource: "account" as const,
      source: "metadata" as const,
      requestParams: { pageNum: 1 },
      payload: { account_id: accountId, account_name: "新账户", status: "active" },
      fetchedByUserId: null,
    };
    const metadata = [{
      workspaceId: workspaceA,
      media: "KUAISHOU",
      accountId,
      accountName: "新账户",
      status: "active",
    }];

    await repository.syncAccountMetadataAndRaw(metadata, [record]);
    await repository.syncAccountMetadataAndRaw(metadata, [record]);

    const account = await pool.query(
      `SELECT account_name, status FROM accounts
       WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id=$2`,
      [workspaceA, accountId],
    );
    expect(account.rows).toEqual([{ account_name: "新账户", status: "active" }]);
    expect(await pool.query(
      `SELECT 1 FROM metrics_raw
       WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id=$2`,
      [workspaceA, accountId],
    )).toHaveProperty("rowCount", 2);
  });

  it("isolates identical account ids by workspace and media", async () => {
    const accountId = `shared-${randomUUID()}`;
    const tuples = [
      { workspaceId: workspaceA, media: "KUAISHOU", name: "A-KS" },
      { workspaceId: workspaceA, media: "TENCENT", name: "A-TX" },
      { workspaceId: workspaceB, media: "KUAISHOU", name: "B-KS" },
    ];
    for (const tuple of tuples) {
      await repository.syncAccountMetadataAndRaw([{
        workspaceId: tuple.workspaceId,
        media: tuple.media,
        accountId,
        accountName: tuple.name,
        status: null,
      }], [{
        workspaceId: tuple.workspaceId,
        media: tuple.media,
        accountId,
        ds: "2026-08-25",
        resource: "account",
        source: "metadata",
        requestParams: {},
        payload: { account_id: accountId, account_name: tuple.name },
        fetchedByUserId: null,
      }]);
    }
    const rows = await pool.query(
      `SELECT workspace_id::text, media, account_name FROM accounts
       WHERE account_id=$1 ORDER BY workspace_id, media`,
      [accountId],
    );
    expect(rows.rows).toEqual([
      { workspace_id: workspaceA, media: "KUAISHOU", account_name: "A-KS" },
      { workspace_id: workspaceA, media: "TENCENT", account_name: "A-TX" },
      { workspace_id: workspaceB, media: "KUAISHOU", account_name: "B-KS" },
    ]);
  });

  it("updates only approved metadata and preserves platform-owned account fields", async () => {
    const accountId = `managed-${randomUUID()}`;
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, name) VALUES ($1, 'owner') RETURNING id`,
      [workspaceA],
    );
    await pool.query(
      `INSERT INTO accounts (
         workspace_id, media, account_id, account_name, status,
         owner_user_id, lifecycle_stage, is_starred, tags
       ) VALUES ($1, 'KUAISHOU', $2, '旧名', 'old', $3, 'stable', true, ARRAY['keep'])`,
      [workspaceA, accountId, user.rows[0]!.id],
    );
    await repository.syncAccountMetadataAndRaw([{
      workspaceId: workspaceA,
      media: "KUAISHOU",
      accountId,
      accountName: "新名",
      status: "active",
    }], [{
      workspaceId: workspaceA,
      media: "KUAISHOU",
      accountId,
      ds: "2026-08-25",
      resource: "account",
      source: "metadata",
      requestParams: {},
      payload: {
        account_id: accountId,
        account_name: "新名",
        status: "active",
        owner_user_id: randomUUID(),
        lifecycle_stage: "forged",
        is_starred: false,
        tags: ["replace"],
      },
      fetchedByUserId: null,
    }]);
    const result = await pool.query(
      `SELECT account_name, status, owner_user_id::text, lifecycle_stage, is_starred, tags
       FROM accounts WHERE workspace_id=$1 AND media='KUAISHOU' AND account_id=$2`,
      [workspaceA, accountId],
    );
    expect(result.rows).toEqual([{
      account_name: "新名",
      status: "active",
      owner_user_id: user.rows[0]!.id,
      lifecycle_stage: "stable",
      is_starred: true,
      tags: ["keep"],
    }]);
  });

  it("rolls back a whole page when account upsert fails before raw", async () => {
    const goodId = `good-${randomUUID()}`;
    const rejectedId = `reject-${randomUUID()}`;
    await pool.query(`
      CREATE FUNCTION reject_account_sync() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.account_id = '${rejectedId}' THEN
          RAISE EXCEPTION 'synthetic account upsert failure';
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER reject_account_sync BEFORE INSERT OR UPDATE ON accounts
      FOR EACH ROW EXECUTE FUNCTION reject_account_sync();
    `);
    const metadata = [goodId, rejectedId].map((accountId) => ({
      workspaceId: workspaceA,
      media: "KUAISHOU",
      accountId,
      accountName: null,
      status: null,
    }));
    const raw = metadata.map((account) => ({
      workspaceId: account.workspaceId,
      media: account.media,
      accountId: account.accountId,
      ds: "2026-08-25",
      resource: "account" as const,
      source: "metadata" as const,
      requestParams: {},
      payload: { account_id: account.accountId },
      fetchedByUserId: null,
    }));
    await expect(repository.syncAccountMetadataAndRaw(metadata, raw)).rejects
      .toThrow(/synthetic account upsert failure/);
    expect(await pool.query(
      "SELECT 1 FROM accounts WHERE workspace_id=$1 AND account_id=ANY($2::text[])",
      [workspaceA, [goodId, rejectedId]],
    )).toHaveProperty("rowCount", 0);
    expect(await pool.query(
      "SELECT 1 FROM metrics_raw WHERE workspace_id=$1 AND account_id=ANY($2::text[])",
      [workspaceA, [goodId, rejectedId]],
    )).toHaveProperty("rowCount", 0);
  });

  it("rejects invalid or mismatched batches before writing anything", async () => {
    const accountId = `invalid-${randomUUID()}`;
    const metadata = [{
      workspaceId: workspaceA,
      media: "KUAISHOU",
      accountId,
      accountName: null,
      status: null,
    }];
    const baseRaw = {
      workspaceId: workspaceA,
      media: "KUAISHOU",
      accountId,
      ds: "2026-08-25",
      resource: "account" as const,
      source: "metadata" as const,
      requestParams: {},
      payload: { account_id: accountId },
      fetchedByUserId: null,
    };
    await expect(repository.syncAccountMetadataAndRaw(metadata, [{
      ...baseRaw,
      accountId: "other",
      payload: {},
    }])).rejects.toThrow();
    await expect(repository.syncAccountMetadataAndRaw([], [baseRaw])).rejects.toThrow();
    expect(await pool.query(
      "SELECT 1 FROM accounts WHERE workspace_id=$1 AND account_id=$2",
      [workspaceA, accountId],
    )).toHaveProperty("rowCount", 0);
    expect(await pool.query(
      "SELECT 1 FROM metrics_raw WHERE workspace_id=$1 AND account_id=$2",
      [workspaceA, accountId],
    )).toHaveProperty("rowCount", 0);
  });

  it("persists replay parameters and loads only the latest resource row per tenant", async () => {
    await repository.appendRaw([
      {
        workspaceId: workspaceA,
        media: "KUAISHOU",
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
        media: "KUAISHOU",
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
        media: "KUAISHOU",
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
        media: "KUAISHOU",
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
        media: "KUAISHOU",
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
