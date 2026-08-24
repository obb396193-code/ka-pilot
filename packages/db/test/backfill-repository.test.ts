import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { BackfillRepository } from "../src/backfill-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("BackfillRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new BackfillRepository(pool);
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM jobs");
    await pool.query("DELETE FROM backfill_jobs");
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('backfill-test') RETURNING id",
    );
    workspaceId = workspace.rows[0]!.id;
    const user = await pool.query<{ id: string }>(
      "INSERT INTO users (workspace_id, name) VALUES ($1, 'operator') RETURNING id",
      [workspaceId],
    );
    userId = user.rows[0]!.id;
  });

  it("tracks the highest contiguous terminal date and a partial failure", async () => {
    const backfillId = await repository.create({
      workspaceId,
      userId,
      dateFrom: "2026-08-17",
      dateTo: "2026-08-19",
    });
    await pool.query(
      `INSERT INTO jobs (workspace_id, job_type, payload, status)
       VALUES
         ($1, 'backfill_day', jsonb_build_object('backfillId', $2::bigint, 'ds', '2026-08-17'), 'done'),
         ($1, 'backfill_day', jsonb_build_object('backfillId', $2::bigint, 'ds', '2026-08-18'), 'failed'),
         ($1, 'backfill_day', jsonb_build_object('backfillId', $2::bigint, 'ds', '2026-08-19'), 'queued')`,
      [workspaceId, backfillId],
    );

    await expect(repository.refreshProgress(workspaceId, backfillId)).resolves.toMatchObject({
      cursorDate: "2026-08-18",
      status: "running",
      terminalDays: 2,
      totalDays: 3,
    });

    await pool.query(
      `UPDATE jobs SET status = 'done'
       WHERE workspace_id = $1 AND job_type = 'backfill_day'
         AND payload->>'backfillId' = $2 AND payload->>'ds' = '2026-08-19'`,
      [workspaceId, String(backfillId)],
    );
    await expect(repository.refreshProgress(workspaceId, backfillId)).resolves.toEqual({
      cursorDate: "2026-08-19",
      status: "partial_failed",
      terminalDays: 3,
      failedDays: 1,
      totalDays: 3,
    });
  });

  it("loads a batch only from its workspace", async () => {
    const id = await repository.create({
      workspaceId,
      userId,
      dateFrom: "2026-08-19",
      dateTo: "2026-08-19",
    });
    await expect(repository.get(workspaceId, id)).resolves.toMatchObject({
      id,
      workspaceId,
      userId,
      dateFrom: "2026-08-19",
      dateTo: "2026-08-19",
      status: "running",
    });
    await expect(
      repository.get("99999999-9999-4999-8999-999999999999", id),
    ).rejects.toThrow("not found");
  });
});
