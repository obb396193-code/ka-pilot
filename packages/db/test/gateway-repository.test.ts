import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { GatewayRepository } from "../src/gateway-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("GatewayRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new GatewayRepository(pool);
  let workspaceId: string;
  let userId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM inbound_events");
    await pool.query("DELETE FROM identity_mappings");
    const workspace = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ('gateway-test') RETURNING id",
    );
    workspaceId = workspace.rows[0]!.id;
    const user = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, name, qihang_user_id, multica_pat_ref)
       VALUES ($1, 'gateway-user', 'qh-user', 'secret://multica/u-1') RETURNING id`,
      [workspaceId],
    );
    userId = user.rows[0]!.id;
    await pool.query(
      `INSERT INTO identity_mappings (workspace_id, provider, external_id, user_id)
       VALUES ($1, 'dingtalk', 'staff-1', $2)`,
      [workspaceId, userId],
    );
  });

  it("claims an inbound event only once", async () => {
    await expect(
      repository.claimInbound(workspaceId, "dingtalk", "event-1", "robot_message", { text: "hello" }),
    ).resolves.toBe(true);
    await expect(
      repository.claimInbound(workspaceId, "dingtalk", "event-1", "robot_message", { text: "hello" }),
    ).resolves.toBe(false);
  });

  it("resolves the mapped product identity without returning secret values", async () => {
    await expect(
      repository.resolveIdentity(workspaceId, "dingtalk", "staff-1"),
    ).resolves.toEqual({
      userId,
      qihangUserId: "qh-user",
      hasMulticaCredential: true,
    });
    await expect(
      repository.resolveIdentity(workspaceId, "dingtalk", "unknown"),
    ).resolves.toBeNull();
  });
});
