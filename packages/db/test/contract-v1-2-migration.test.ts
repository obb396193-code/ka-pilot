import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import { windowSize } from "./migration-window.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("contract v1.2 P0 migration", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("backfills safe account scope, enforces P0 constraints and replays up/down/up", async () => {
    expect(await runMigrations({ databaseUrl, direction: "down", count: windowSize("011") })).toHaveLength(windowSize("011"));

    const suffix = randomUUID();
    const workspaces = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id",
      [`contract-v1-2-a-${suffix}`, `contract-v1-2-b-${suffix}`],
    );
    const workspaceA = workspaces.rows[0]!.id;
    const workspaceB = workspaces.rows[1]!.id;
    const users = await pool.query<{ id: string; workspace_id: string }>(
      `INSERT INTO users (workspace_id, name)
       VALUES ($1, 'actor-a'), ($2, 'actor-b')
       RETURNING id, workspace_id`,
      [workspaceA, workspaceB],
    );
    const userA = users.rows.find((row) => row.workspace_id === workspaceA)!.id;
    const userB = users.rows.find((row) => row.workspace_id === workspaceB)!.id;

    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'same-account'),
              ($1, 'TENCENT', 'same-account'),
              ($2, 'KUAISHOU', 'same-account')`,
      [workspaceA, workspaceB],
    );
    await pool.query(
      `INSERT INTO tasks (workspace_id, task_id)
       VALUES ($1, 'task-a'), ($1, 'task-b')`,
      [workspaceA],
    );
    await pool.query(
      `INSERT INTO task_accounts (
         workspace_id, task_id, media, account_id, valid_from, valid_to
       ) VALUES ($1, 'task-a', 'KUAISHOU', 'same-account', '2026-01-01', '2026-01-31')`,
      [workspaceA],
    );
    const changeset = await pool.query<{ id: string }>(
      `INSERT INTO changesets (
         workspace_id, media, account_id, title, initiator, credential_owner_user_id
       ) VALUES ($1, 'KUAISHOU', 'same-account', 'legacy item', $2, $2)
       RETURNING id`,
      [workspaceA, userA],
    );
    const item = await pool.query<{ id: string }>(
      `INSERT INTO changeset_items (
         changeset_id, target_type, target_id, field, from_value, to_value
       ) VALUES ($1, 'account', 'same-account', 'budget', '100', '90')
       RETURNING id`,
      [changeset.rows[0]!.id],
    );

    expect(await runMigrations({ databaseUrl, count: windowSize("011") })).toHaveLength(windowSize("011"));

    const scopedItem = await pool.query<{
      workspace_id: string;
      media: string;
      account_id: string;
    }>(
      `SELECT workspace_id, media, account_id
       FROM changeset_items WHERE id = $1`,
      [item.rows[0]!.id],
    );
    expect(scopedItem.rows[0]).toEqual({
      workspace_id: workspaceA,
      media: "KUAISHOU",
      account_id: "same-account",
    });

    await expect(pool.query(
      `INSERT INTO task_accounts (
         workspace_id, task_id, media, account_id, valid_from, valid_to
       ) VALUES ($1, 'task-b', 'KUAISHOU', 'same-account', '2026-01-31', '2026-02-15')`,
      [workspaceA],
    )).rejects.toMatchObject({ code: "23P01" });
    await expect(pool.query(
      `INSERT INTO task_accounts (
         workspace_id, task_id, media, account_id, valid_from, valid_to
       ) VALUES ($1, 'task-b', 'TENCENT', 'same-account', '2026-01-15', '2026-02-15')`,
      [workspaceA],
    )).resolves.toMatchObject({ rowCount: 1 });

    await expect(pool.query(
      `INSERT INTO changesets (
         workspace_id, media, account_id, title, initiator, credential_owner_user_id
       ) VALUES ($1, 'KUAISHOU', 'same-account', 'cross workspace', $2, $2)`,
      [workspaceA, userB],
    )).rejects.toMatchObject({ code: "23503" });
    await expect(pool.query(
      `INSERT INTO changeset_items (
         changeset_id, workspace_id, media, account_id,
         target_type, target_id, field
       ) VALUES ($1, $2, 'TENCENT', 'missing-account', 'account', 'missing-account', 'budget')`,
      [changeset.rows[0]!.id, workspaceA],
    )).rejects.toMatchObject({ code: "23503" });

    const workflowDefinition = await pool.query<{ id: string }>(
      `INSERT INTO workflow_definitions (workspace_id, name)
       VALUES ($1, 'effect-test') RETURNING id`,
      [workspaceA],
    );
    const workflowVersion = await pool.query<{ id: string }>(
      `INSERT INTO workflow_versions (workspace_id, definition_id, version, graph)
       VALUES ($1, $2, 1, '{}') RETURNING id`,
      [workspaceA, workflowDefinition.rows[0]!.id],
    );
    const workflowRun = await pool.query<{ id: string }>(
      `INSERT INTO workflow_runs (workspace_id, version_id, status)
       VALUES ($1, $2, 'running') RETURNING id`,
      [workspaceA, workflowVersion.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO workflow_effects (run_id, node_id, attempt, phase, effect_key)
       VALUES ($1, 'write-node', 1, 'execute', 'effect-1')`,
      [workflowRun.rows[0]!.id],
    );
    await expect(pool.query(
      `INSERT INTO workflow_effects (run_id, node_id, attempt, phase, effect_key)
       VALUES ($1, 'write-node', 1, 'execute', 'effect-2')`,
      [workflowRun.rows[0]!.id],
    )).rejects.toMatchObject({ code: "23505" });

    const inbound = await pool.query<{ attempts: number; max_attempts: number }>(
      `INSERT INTO inbound_events (workspace_id, provider, external_event_id, kind, payload)
       VALUES ($1, 'dingtalk', $2, 'message', '{}')
       RETURNING attempts, max_attempts`,
      [workspaceA, `event-${suffix}`],
    );
    expect(inbound.rows[0]).toEqual({ attempts: 0, max_attempts: 5 });

    expect(await runMigrations({ databaseUrl, direction: "down", count: windowSize("011") })).toHaveLength(windowSize("011"));
    const downState = await pool.query<{
      effect_table: string | null;
      item_workspace_column: boolean;
    }>(`
      SELECT
        to_regclass('public.workflow_effects')::text AS effect_table,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'changeset_items'
            AND column_name = 'workspace_id'
        ) AS item_workspace_column
    `);
    expect(downState.rows[0]).toEqual({
      effect_table: null,
      item_workspace_column: false,
    });
    expect(await runMigrations({ databaseUrl, count: windowSize("011") })).toHaveLength(windowSize("011"));

    await pool.query("DELETE FROM workflow_effects WHERE run_id = $1", [workflowRun.rows[0]!.id]);
    await pool.query("DELETE FROM workflow_runs WHERE id = $1", [workflowRun.rows[0]!.id]);
    await pool.query("DELETE FROM workflow_versions WHERE id = $1", [workflowVersion.rows[0]!.id]);
    await pool.query("DELETE FROM workflow_definitions WHERE id = $1", [workflowDefinition.rows[0]!.id]);
    await pool.query("DELETE FROM inbound_events WHERE workspace_id = $1", [workspaceA]);
    await pool.query("DELETE FROM changeset_items WHERE changeset_id = $1", [changeset.rows[0]!.id]);
    await pool.query("DELETE FROM changesets WHERE id = $1", [changeset.rows[0]!.id]);
    await pool.query("DELETE FROM task_accounts WHERE workspace_id = $1", [workspaceA]);
    await pool.query("DELETE FROM tasks WHERE workspace_id = $1", [workspaceA]);
    await pool.query("DELETE FROM users WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM accounts WHERE workspace_id IN ($1, $2)", [workspaceA, workspaceB]);
    await pool.query("DELETE FROM workspaces WHERE id IN ($1, $2)", [workspaceA, workspaceB]);
  });
});
