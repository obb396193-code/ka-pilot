import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { runMigrations } from "../src/migrate.js";
import { windowSize } from "./migration-window.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("backfill state in folded 011 migration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => { await pool.end(); });

  it("enforces states, revalidates old completion, and supports up/down/up", async () => {
    const constraints = await pool.query(`SELECT conname FROM pg_constraint
      WHERE conrelid = 'backfill_jobs'::regclass AND conname = 'backfill_jobs_status_check'`);
    expect(constraints.rows).toHaveLength(1);
    expect(await runMigrations({ databaseUrl, direction: "down", count: windowSize("011") })).toHaveLength(windowSize("011"));
    const ws = (await pool.query("INSERT INTO workspaces (name) VALUES ($1) RETURNING id", [randomUUID()])).rows[0].id;
    // Folded 011 down removes both new fields; this is the actual legacy shape.
    const id = (await pool.query(`INSERT INTO backfill_jobs (workspace_id, date_from, date_to, status)
      VALUES ($1, '2026-08-19', '2026-08-19', 'done') RETURNING id`, [ws])).rows[0].id;
    try {
      expect(await runMigrations({ databaseUrl, count: windowSize("011") })).toHaveLength(windowSize("011"));
      expect((await pool.query("SELECT status, finished_at, failed_stage FROM backfill_jobs WHERE id=$1", [id])).rows[0])
        .toEqual({ status: "running", finished_at: null, failed_stage: null });
      for (const status of ["running", "raw_done", "canonical_done", "done", "failed"]) {
        await expect(pool.query("UPDATE backfill_jobs SET status=$2 WHERE id=$1", [id, status]))
          .resolves.toMatchObject({ rowCount: 1 });
      }
      for (const status of [null, "partial_failed", "unknown"]) {
        await expect(pool.query("UPDATE backfill_jobs SET status=$2 WHERE id=$1", [id, status]))
          .rejects.toMatchObject({ code: "23514" });
      }
      await expect(pool.query("UPDATE backfill_jobs SET failed_stage='other' WHERE id=$1", [id]))
        .rejects.toMatchObject({ code: "23514" });
      expect(await runMigrations({ databaseUrl, direction: "down", count: windowSize("011") })).toHaveLength(windowSize("011"));
      for (const status of [null, "partial_failed"]) {
        await pool.query("UPDATE backfill_jobs SET status=$2 WHERE id=$1", [id, status]);
        await expect(runMigrations({ databaseUrl, count: windowSize("011") })).rejects.toThrow(/backfill_jobs contains a legacy status/);
      }
      await pool.query("UPDATE backfill_jobs SET status='running' WHERE id=$1", [id]);
      expect(await runMigrations({ databaseUrl, count: windowSize("011") })).toHaveLength(windowSize("011"));
    } finally {
      await pool.query("DELETE FROM backfill_jobs WHERE id=$1", [id]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [ws]);
    }
  });
});
