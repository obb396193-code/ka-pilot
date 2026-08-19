import { randomUUID } from "node:crypto";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { ChangeSetRepository } from "../src/changeset-repository.js";
import { runMigrations } from "../src/migrate.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("ChangeSetRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  const repository = new ChangeSetRepository(pool);
  let workspaceId: string;
  let otherWorkspaceId: string;
  let userId: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  beforeEach(async () => {
    const suffix = randomUUID();
    const workspaces = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id",
      [`changeset-a-${suffix}`, `changeset-b-${suffix}`],
    );
    workspaceId = workspaces.rows[0]!.id;
    otherWorkspaceId = workspaces.rows[1]!.id;
    const user = await pool.query<{ id: string }>(
      "INSERT INTO users (workspace_id, name) VALUES ($1, 'changeset-owner') RETURNING id",
      [workspaceId],
    );
    userId = user.rows[0]!.id;
  });

  async function create(ttl = new Date("2026-08-19T10:30:00Z")) {
    return repository.create({
      workspaceId,
      title: "批量降价",
      initiator: userId,
      credentialOwnerUserId: userId,
      ttlExpireAt: ttl,
      reasonCode: "cost_control",
      items: [
        { targetType: "unit", targetId: "unit-1", field: "bid", fromValue: "30", toValue: "27" },
        { targetType: "unit", targetId: "unit-2", field: "budget", fromValue: "1000", toValue: "800" },
      ],
    });
  }

  it("creates the header and items atomically and isolates workspace reads", async () => {
    const created = await create();
    expect(created).toMatchObject({ status: "draft", title: "批量降价" });
    expect(created.items).toHaveLength(2);
    await expect(repository.get(otherWorkspaceId, created.id)).rejects.toThrow(/not found/);
  });

  it("confirms once after strict current-value verification and is idempotent", async () => {
    const created = await create();
    const values = [
      { targetType: "unit" as const, targetId: "unit-1", field: "bid", value: "30" },
      { targetType: "unit" as const, targetId: "unit-2", field: "budget", value: "1000" },
    ];
    const first = await repository.confirm({
      workspaceId,
      changeSetId: created.id,
      now: new Date("2026-08-19T10:00:00Z"),
      currentValues: values,
    });
    const second = await repository.confirm({
      workspaceId,
      changeSetId: created.id,
      now: new Date("2026-08-19T10:05:00Z"),
      currentValues: values,
    });
    expect(first).toMatchObject({ outcome: "confirmed", idempotent: false });
    expect(second).toMatchObject({ outcome: "confirmed", idempotent: true });
  });

  it("keeps a conflicting draft unconfirmed and returns every conflict", async () => {
    const created = await create();
    const result = await repository.confirm({
      workspaceId,
      changeSetId: created.id,
      now: new Date("2026-08-19T10:00:00Z"),
      currentValues: [
        { targetType: "unit", targetId: "unit-1", field: "bid", value: "31" },
      ],
    });
    expect(result.outcome).toBe("conflict");
    if (result.outcome === "conflict") {
      expect(result.conflicts).toHaveLength(2);
    }
    expect((await repository.get(workspaceId, created.id)).status).toBe("draft");
  });

  it("persists expiration instead of rolling it back with the error", async () => {
    const created = await create(new Date("2026-08-19T10:00:00Z"));
    const result = await repository.confirm({
      workspaceId,
      changeSetId: created.id,
      now: new Date("2026-08-19T10:00:00Z"),
      currentValues: [],
    });
    expect(result).toEqual({ outcome: "expired" });
    expect((await repository.get(workspaceId, created.id)).status).toBe("expired");
  });

  it("records an execution run and item-level partial success", async () => {
    const created = await create();
    await repository.confirm({
      workspaceId,
      changeSetId: created.id,
      now: new Date("2026-08-19T10:00:00Z"),
      currentValues: created.items.map((item) => ({
        targetType: item.targetType,
        targetId: item.targetId,
        field: item.field,
        value: item.fromValue,
      })),
    });
    const run = await repository.beginExecution({
      workspaceId,
      changeSetId: created.id,
      requestPayload: { idempotency_key: created.id },
      startedAt: new Date("2026-08-19T10:01:00Z"),
    });
    expect(run.directive).toBe("execute");
    if (run.directive !== "execute") throw new Error("expected execution run");

    const completed = await repository.completeExecution({
      workspaceId,
      changeSetId: created.id,
      executionRunId: run.executionRunId,
      finishedAt: new Date("2026-08-19T10:02:00Z"),
      resultPayload: { source: "fake" },
      items: [
        { itemId: created.items[0]!.id, status: "success" },
        { itemId: created.items[1]!.id, status: "failed", failReason: "media rejected" },
      ],
    });
    expect(completed.status).toBe("partial");
    expect(completed.items.map((item) => item.itemStatus)).toEqual(["success", "failed"]);
  });

  it("requires reconciliation instead of blindly beginning UNKNOWN again", async () => {
    const created = await create();
    await pool.query("UPDATE changesets SET status='unknown' WHERE id=$1", [created.id]);
    const run = await repository.beginExecution({
      workspaceId,
      changeSetId: created.id,
      requestPayload: {},
      startedAt: new Date(),
    });
    expect(run).toEqual({ directive: "reconcile_required" });
  });
});
