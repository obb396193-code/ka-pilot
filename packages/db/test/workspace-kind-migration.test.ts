import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("workspace kind migration", () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("backfills legacy workspaces, rejects invalid kinds and replays up/down/up", async () => {
    const suffix = randomUUID();

    await runMigrations({ databaseUrl, direction: "down", count: 1 });
    const legacy = await pool.query<{ id: string }>(
      `INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id`,
      [`legacy-personal-a-${suffix}`, `legacy-personal-b-${suffix}`],
    );
    const personalWorkspace = legacy.rows[0]!.id;
    const otherPersonalWorkspace = legacy.rows[1]!.id;
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'same-account'),
              ($2, 'KUAISHOU', 'same-account')`,
      [personalWorkspace, otherPersonalWorkspace],
    );

    expect(await runMigrations({ databaseUrl, count: 1 })).toHaveLength(1);
    const backfilled = await pool.query<{ id: string; kind: string }>(
      `SELECT id, kind FROM workspaces WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [[personalWorkspace, otherPersonalWorkspace]],
    );
    expect(backfilled.rows).toHaveLength(2);
    expect(backfilled.rows.every((row) => row.kind === "personal")).toBe(true);

    const team = await pool.query<{ id: string; kind: string }>(
      `INSERT INTO workspaces (name, kind)
       VALUES ($1, 'team') RETURNING id, kind`,
      [`team-${suffix}`],
    );
    expect(team.rows[0]?.kind).toBe("team");
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'same-account')`,
      [team.rows[0]!.id],
    );
    const collidingAccounts = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM accounts
       WHERE media = 'KUAISHOU'
         AND account_id = 'same-account'
         AND workspace_id = ANY($1::uuid[])`,
      [[personalWorkspace, otherPersonalWorkspace, team.rows[0]!.id]],
    );
    expect(collidingAccounts.rows[0]?.count).toBe("3");

    await expect(pool.query(
      `INSERT INTO workspaces (name, kind) VALUES ($1, 'shared')`,
      [`invalid-${suffix}`],
    )).rejects.toMatchObject({ code: "23514" });

    expect(await runMigrations({ databaseUrl, direction: "down", count: 1 })).toHaveLength(1);
    const removed = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'workspaces'
           AND column_name = 'kind'
       ) AS exists`,
    );
    expect(removed.rows[0]?.exists).toBe(false);

    expect(await runMigrations({ databaseUrl, count: 1 })).toHaveLength(1);
    const replayed = await pool.query<{ kind: string }>(
      `SELECT kind FROM workspaces WHERE id = $1`,
      [team.rows[0]!.id],
    );
    expect(replayed.rows[0]?.kind).toBe("personal");

    await pool.query(
      `DELETE FROM accounts WHERE workspace_id = ANY($1::uuid[])`,
      [[personalWorkspace, otherPersonalWorkspace, team.rows[0]!.id]],
    );
    await pool.query(
      `DELETE FROM workspaces WHERE id = ANY($1::uuid[])`,
      [[personalWorkspace, otherPersonalWorkspace, team.rows[0]!.id]],
    );
  });
});
