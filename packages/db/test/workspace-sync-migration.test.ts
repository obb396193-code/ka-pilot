import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import { windowSize } from "./migration-window.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("workspace sync migration", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("adds an explicit active state and survives down/up", async () => {
    const workspace = await pool.query<{ id: string; is_active: boolean }>(
      "INSERT INTO workspaces (name) VALUES ('scheduler-migration') RETURNING id, is_active",
    );
    expect(workspace.rows[0]?.is_active).toBe(true);

    await runMigrations({ databaseUrl, direction: "down", count: windowSize("009") });
    const removed = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_name = 'workspaces' AND column_name = 'is_active'
       ) AS exists`,
    );
    expect(removed.rows[0]?.exists).toBe(false);

    await runMigrations({ databaseUrl, direction: "up", count: windowSize("009") });
    const restored = await pool.query<{ is_active: boolean }>(
      "SELECT is_active FROM workspaces WHERE id = $1",
      [workspace.rows[0]!.id],
    );
    expect(restored.rows[0]?.is_active).toBe(true);
  });
});
