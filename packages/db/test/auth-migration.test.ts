import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

import { runMigrations } from "../src/migrate.js";
import { windowSize } from "./migration-window.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("multi-tenant auth migration", () => {
  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  it("creates the four auth tables with tenant-safe foreign keys and replays up/down/up", async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    const tables = await client.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'auth_identities', 'workspace_memberships',
          'account_access_grants', 'auth_sessions'
        )
      ORDER BY table_name
    `);
    expect(tables.rows.map((row) => row.table_name)).toEqual([
      "account_access_grants",
      "auth_identities",
      "auth_sessions",
      "workspace_memberships",
    ]);

    const suffix = randomUUID();
    const workspaces = await client.query<{ id: string }>(
      `INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id`,
      [`auth-a-${suffix}`, `auth-b-${suffix}`],
    );
    const workspaceA = workspaces.rows[0]!.id;
    const workspaceB = workspaces.rows[1]!.id;
    const users = await client.query<{ id: string; workspace_id: string }>(
      `INSERT INTO users (workspace_id, name)
       VALUES ($1, 'actor-a'), ($2, 'actor-b')
       RETURNING id, workspace_id`,
      [workspaceA, workspaceB],
    );
    const userA = users.rows.find((row) => row.workspace_id === workspaceA)!.id;
    const userB = users.rows.find((row) => row.workspace_id === workspaceB)!.id;
    const identity = await client.query<{ id: string }>(
      `INSERT INTO auth_identities (provider, provider_subject, display_name)
       VALUES ('internal_test', $1, 'test identity') RETURNING id`,
      [`subject-${suffix}`],
    );
    await client.query(
      `INSERT INTO workspace_memberships (workspace_id, identity_id, user_id, role)
       VALUES ($1, $3, $4, 'admin'), ($2, $3, $5, 'optimizer')`,
      [workspaceA, workspaceB, identity.rows[0]!.id, userA, userB],
    );
    await client.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'same-account'),
              ($1, 'TENCENT', 'same-account'),
              ($2, 'KUAISHOU', 'same-account')`,
      [workspaceA, workspaceB],
    );
    await client.query(
      `INSERT INTO account_access_grants (
         workspace_id, identity_id, media, account_id, access_level
       ) VALUES ($1, $2, 'KUAISHOU', 'same-account', 'read'),
                ($1, $2, 'TENCENT', 'same-account', 'preview'),
                ($3, $2, 'KUAISHOU', 'same-account', 'read')`,
      [workspaceA, identity.rows[0]!.id, workspaceB],
    );
    await client.query(
      `INSERT INTO auth_sessions (
         identity_id, active_workspace_id, token_hash, expires_at
       ) VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [identity.rows[0]!.id, workspaceA, "a".repeat(64)],
    );

    const otherIdentity = await client.query<{ id: string }>(
      `INSERT INTO auth_identities (provider, provider_subject, display_name)
       VALUES ('internal_test', $1, 'other identity') RETURNING id`,
      [`other-${suffix}`],
    );
    await expect(client.query(
      `INSERT INTO workspace_memberships (workspace_id, identity_id, user_id, role)
       VALUES ($1, $2, $3, 'optimizer')`,
      [workspaceA, otherIdentity.rows[0]!.id, userB],
    )).rejects.toMatchObject({ code: "23503" });
    await expect(client.query(
      `INSERT INTO auth_sessions (
         identity_id, active_workspace_id, token_hash, expires_at
       ) VALUES ($1, $2, 'plaintext-token', now() + interval '1 hour')`,
      [identity.rows[0]!.id, workspaceB],
    )).rejects.toMatchObject({ code: "23514" });

    await client.end();
    expect(await runMigrations({ databaseUrl, direction: "down", count: windowSize("008") })).toHaveLength(windowSize("008"));
    const downClient = new Client({ connectionString: databaseUrl });
    await downClient.connect();
    const dropped = await downClient.query<{ table_name: string | null }>(
      "SELECT to_regclass('public.auth_sessions')::text AS table_name",
    );
    expect(dropped.rows[0]?.table_name).toBeNull();
    await downClient.end();
    expect(await runMigrations({ databaseUrl, count: windowSize("008") })).toHaveLength(windowSize("008"));
  });
});
