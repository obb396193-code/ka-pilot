import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
  afterAll(async () => { await pool.end(); });

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
      `INSERT INTO jobs (workspace_id, job_type, payload, status, credential_owner_user_id)
       VALUES
         ($1, 'backfill_day', jsonb_build_object('backfillId', $2::bigint, 'ds', '2026-08-17'), 'done', $3),
         ($1, 'backfill_day', jsonb_build_object('backfillId', $2::bigint, 'ds', '2026-08-18'), 'failed', $3),
         ($1, 'backfill_day', jsonb_build_object('backfillId', $2::bigint, 'ds', '2026-08-19'), 'queued', $3)`,
      [workspaceId, backfillId, userId],
    );

    await expect(repository.refreshProgress(workspaceId, backfillId)).resolves.toMatchObject({
      cursorDate: "2026-08-18",
      status: "failed",
      failedStage: "raw",
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
      status: "failed",
      failedStage: "raw",
      terminalDays: 3,
      failedDays: 1,
      totalDays: 3,
    });
  });

  async function stage(id: number, jobType: string, status = "done", owner = userId, workspace = workspaceId) {
    return pool.query(
      `INSERT INTO jobs (workspace_id, job_type, credential_owner_user_id, payload, status)
       VALUES ($1, $2, $3, jsonb_build_object('backfillId', $4::bigint,
         'ds', '2026-08-19', 'dateFrom', '2026-08-19', 'dateTo', '2026-08-19'), $5)
       RETURNING id`, [workspace, jobType, owner, id, status]);
  }

  it("waits for canonical and quality, survives recovery, and preserves terminal time on replay", async () => {
    const id = await repository.create({ workspaceId, userId, dateFrom: "2026-08-19", dateTo: "2026-08-19" });
    await stage(id, "backfill_day");
    expect((await repository.refreshProgress(workspaceId, id)).status).toBe("raw_done");
    expect((await repository.get(workspaceId, id)).finishedAt).toBeNull();
    await stage(id, "canonical_merge");
    await repository.refreshRunningBatches();
    expect((await repository.get(workspaceId, id)).status).toBe("canonical_done");
    await stage(id, "data_quality_check");
    const progress = await Promise.all([
      repository.refreshProgress(workspaceId, id), repository.refreshProgress(workspaceId, id),
    ]);
    expect(progress.every((result) => result.status === "done")).toBe(true);
    const completed = await repository.get(workspaceId, id);
    expect(completed.finishedAt).toBeInstanceOf(Date);
    await repository.refreshProgress(workspaceId, id);
    expect((await repository.get(workspaceId, id)).finishedAt).toEqual(completed.finishedAt);
  });

  it.each([['canonical_merge', 'canonical'], ['data_quality_check', 'quality']])(
    "records %s failure without losing raw cursor", async (jobType, failedStage) => {
      const id = await repository.create({ workspaceId, userId, dateFrom: "2026-08-19", dateTo: "2026-08-19" });
      await stage(id, "backfill_day");
      if (jobType === "data_quality_check") await stage(id, "canonical_merge");
      await stage(id, jobType, "failed");
      await repository.refreshProgress(workspaceId, id);
      expect(await repository.get(workspaceId, id)).toMatchObject({
        status: "failed", failedStage, cursorDate: "2026-08-19", finishedAt: expect.any(Date),
      });
    },
  );

  it("ignores jobs from a different workspace or credential owner", async () => {
    const id = await repository.create({ workspaceId, userId, dateFrom: "2026-08-19", dateTo: "2026-08-19" });
    const otherWorkspace = (await pool.query("INSERT INTO workspaces (name) VALUES ('other-backfill') RETURNING id")).rows[0].id;
    const otherUser = (await pool.query("INSERT INTO users (workspace_id, name) VALUES ($1, 'other') RETURNING id", [workspaceId])).rows[0].id;
    for (const kind of ["backfill_day", "canonical_merge", "data_quality_check"]) {
      await stage(id, kind, "done", otherUser);
      await stage(id, kind, "done", userId, otherWorkspace);
    }
    expect((await repository.refreshProgress(workspaceId, id)).status).toBe("running");
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
