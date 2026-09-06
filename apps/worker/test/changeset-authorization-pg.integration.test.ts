import { randomUUID } from "node:crypto";
import { ChangeSetRepository, runMigrations } from "@ka/db";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ChangeSetExecutionHandler } from "../src/changesets/changeset-execution-handler.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("changeset authorization / real PG and Worker", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const store = new ChangeSetRepository(pool);
  beforeAll(async () => { await runMigrations({ databaseUrl }); });
  afterAll(async () => { await pool.end(); });

  it.each(["before_read", "during_read", "reconcile", "team"])("blocks executor when authorization changes: %s", async (mode) => {
    const workspaceId = (await pool.query("INSERT INTO workspaces(name) VALUES ($1) RETURNING id", [randomUUID()])).rows[0].id;
    const userId = (await pool.query("INSERT INTO users(workspace_id,name) VALUES ($1,'synthetic-actor') RETURNING id", [workspaceId])).rows[0].id;
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES ($1,'KUAISHOU','synthetic')", [workspaceId]);
    const now = new Date("2026-09-05T01:00:00Z");
    const created = await store.create({ workspaceId, media: "KUAISHOU", accountId: "synthetic",
      initiator: userId, credentialOwnerUserId: userId, title: "synthetic", reasonCode: "test",
      ttlExpireAt: new Date("2026-09-05T02:00:00Z"),
      items: [{ targetType: "unit", targetId: "synthetic-unit", field: "bid", fromValue: { type: "number" as const, value: 1 }, toValue: { type: "number" as const, value: 2 } }],
    });
    const currentValues = created.items.map((item) => ({ targetType: item.targetType,
      targetId: item.targetId, field: item.field, value: item.fromValue }));
    await store.confirm({ workspaceId, changeSetId: created.id, now, currentValues });
    if (mode === "team") await pool.query("UPDATE workspaces SET kind='team' WHERE id=$1", [workspaceId]);
    else if (mode !== "during_read") await pool.query("UPDATE users SET is_active=false WHERE id=$1", [userId]);
    if (mode === "reconcile") await pool.query("UPDATE changesets SET status='unknown' WHERE id=$1", [created.id]);
    const readCurrentValues = vi.fn(async () => {
      // Revocation between preflight and beginExecution must be checked again.
      await pool.query("UPDATE users SET is_active=false WHERE id=$1", [userId]);
      return currentValues;
    });
    const execute = vi.fn(async () => ({ payload: {}, items: [] }));
    const reconcileUnknown = vi.fn(async () => ({ payload: {}, items: [] }));
    const scheduleT1 = vi.fn();
    const handler = new ChangeSetExecutionHandler({ store, values: { readCurrentValues },
      executor: { execute, reconcileUnknown }, followUps: { scheduleT1 }, now: () => now });
    await expect(handler.run(workspaceId, created.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(readCurrentValues).toHaveBeenCalledTimes(mode === "during_read" ? 1 : 0);
    expect(execute).not.toHaveBeenCalled();
    expect(reconcileUnknown).not.toHaveBeenCalled();
    expect(scheduleT1).not.toHaveBeenCalled();
    expect((await pool.query("SELECT id FROM execution_runs WHERE changeset_id=$1", [created.id])).rows).toHaveLength(0);
  });
});
