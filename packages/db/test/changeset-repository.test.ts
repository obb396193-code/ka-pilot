import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
  afterAll(async () => { await pool.end(); });

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
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'account-1')`,
      [workspaceId],
    );
  });

  async function create(ttl = new Date("2026-08-19T10:30:00Z")) {
    return repository.create({
      workspaceId,
      media: "KUAISHOU",
      accountId: "account-1",
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
    expect(created).toMatchObject({
      status: "draft",
      title: "批量降价",
      media: "KUAISHOU",
      accountId: "account-1",
    });
    expect(created.items).toHaveLength(2);
    await expect(repository.get(otherWorkspaceId, created.id)).rejects.toThrow(/not found/);
    await expect(repository.find(otherWorkspaceId, created.id)).resolves.toBeNull();
  });

  it.each(["initiator", "credentialOwnerUserId"] as const)("rejects inactive %s at create without partial rows", async (actor) => {
    const inactive = (await pool.query("INSERT INTO users(workspace_id,name,is_active) VALUES ($1,'inactive',false) RETURNING id", [workspaceId])).rows[0].id;
    await expect(repository.create({ workspaceId, media: "KUAISHOU", accountId: "account-1", title: "rejected",
      initiator: userId, credentialOwnerUserId: userId, [actor]: inactive,
      ttlExpireAt: new Date("2026-08-19T10:30:00Z"), reasonCode: "test",
      items: [{ targetType: "unit", targetId: "unit-1", field: "bid", fromValue: "1", toValue: "2" }],
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await pool.query("SELECT id FROM changesets WHERE workspace_id=$1", [workspaceId])).rows).toHaveLength(0);
  });

  it("rejects cross-workspace actors before attempting inserts", async () => {
    const other = (await pool.query("INSERT INTO users(workspace_id,name,is_active) VALUES ($1,'other',true) RETURNING id", [otherWorkspaceId])).rows[0].id;
    for (const actor of ["initiator", "credentialOwnerUserId"]) {
      await expect(repository.create({ workspaceId, media: "KUAISHOU", accountId: "account-1", title: "rejected",
        initiator: userId, credentialOwnerUserId: userId, [actor]: other,
        ttlExpireAt: new Date("2026-08-19T10:30:00Z"), reasonCode: "test",
        items: [{ targetType: "unit", targetId: "unit-1", field: "bid", fromValue: "1", toValue: "2" }],
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it.each(["initiator", "credential_owner_user_id"])("rechecks revoked %s at confirm and execution", async (actorColumn) => {
    const created = await create();
    const second = (await pool.query("INSERT INTO users(workspace_id,name) VALUES ($1,'second-active') RETURNING id", [workspaceId])).rows[0].id;
    // Test-only column selected from the fixed two-value list above.
    await pool.query(`UPDATE changesets SET ${actorColumn}=$2 WHERE id=$1`, [created.id, second]);
    const input = { workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:00:00Z"), currentValues: created.items.map((item) => ({
      targetType: item.targetType, targetId: item.targetId, field: item.field, value: item.fromValue,
    })) };
    await pool.query("UPDATE users SET is_active=false WHERE id=$1", [second]);
    await expect(repository.confirm(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await pool.query("UPDATE users SET is_active=true WHERE id=$1", [second]);
    await repository.confirm(input);
    await pool.query("UPDATE users SET is_active=false WHERE id=$1", [second]);
    await expect(repository.confirm(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repository.beginExecution({ workspaceId, changeSetId: created.id, requestPayload: {}, startedAt: input.now }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await pool.query("SELECT id FROM execution_runs WHERE changeset_id=$1", [created.id])).rows).toHaveLength(0);
  });

  it.each(["workspace", "media", "account"])("rejects mismatched child %s scope on read, confirm and execute", async (dimension) => {
    const created = await create();
    const childWorkspace = dimension === "workspace" ? otherWorkspaceId : workspaceId;
    const childMedia = dimension === "media" ? "TENCENT" : "KUAISHOU";
    const childAccount = dimension === "account" ? "account-2" : "account-1";
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES ($1,$2,$3)", [childWorkspace,childMedia,childAccount]);
    await pool.query("UPDATE changeset_items SET workspace_id=$2,media=$3,account_id=$4 WHERE changeset_id=$1", [created.id,childWorkspace,childMedia,childAccount]);
    await expect(repository.get(workspaceId,created.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(repository.confirm({ workspaceId,changeSetId:created.id,now:new Date("2026-08-19T10:00Z"),currentValues:[] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await pool.query("UPDATE changesets SET status='confirmed' WHERE id=$1", [created.id]);
    await expect(repository.beginExecution({ workspaceId,changeSetId:created.id,startedAt:new Date("2026-08-19T10:00Z"),requestPayload:{} }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await pool.query("SELECT id FROM execution_runs WHERE changeset_id=$1", [created.id])).rows).toHaveLength(0);
  });

  it("rejects a linked work item outside the changeset account scope", async () => {
    const workItem = await pool.query<{ id: string }>(
      `INSERT INTO work_items (workspace_id, type, media, account_id, title)
       VALUES ($1, 'diagnosis', 'KUAISHOU', 'account-1', 'scope-check')
       RETURNING id`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'TENCENT', 'account-1')`,
      [workspaceId],
    );
    await expect(repository.create({
      workspaceId,
      media: "TENCENT",
      accountId: "account-1",
      workItemId: workItem.rows[0]!.id,
      title: "scope mismatch",
      initiator: userId,
      credentialOwnerUserId: userId,
      ttlExpireAt: new Date("2026-08-19T10:30:00Z"),
      reasonCode: "cost_control",
      items: [{
        targetType: "account",
        targetId: "account-1",
        field: "budget",
        fromValue: "100",
        toValue: "90",
      }],
    })).rejects.toThrow(/does not match its account scope/i);
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

  it("rechecks TTL under lock immediately before execution", async () => {
    const created = await create(new Date("2026-08-19T10:30:00Z"));
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

    await expect(repository.beginExecution({
      workspaceId,
      changeSetId: created.id,
      requestPayload: {},
      startedAt: new Date("2026-08-19T10:31:00Z"),
    })).resolves.toEqual({ directive: "skip_terminal" });
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

  it("rejects duplicate item results and an execution run from another changeset", async () => {
    const first = await create();
    const second = await create();
    for (const changeset of [first, second]) {
      await repository.confirm({
        workspaceId,
        changeSetId: changeset.id,
        now: new Date("2026-08-19T10:00:00Z"),
        currentValues: changeset.items.map((item) => ({
          targetType: item.targetType,
          targetId: item.targetId,
          field: item.field,
          value: item.fromValue,
        })),
      });
    }
    const firstRun = await repository.beginExecution({
      workspaceId,
      changeSetId: first.id,
      requestPayload: {},
      startedAt: new Date("2026-08-19T10:01:00Z"),
    });
    const secondRun = await repository.beginExecution({
      workspaceId,
      changeSetId: second.id,
      requestPayload: {},
      startedAt: new Date("2026-08-19T10:01:00Z"),
    });
    if (firstRun.directive !== "execute" || secondRun.directive !== "execute") {
      throw new Error("expected execution runs");
    }

    await expect(repository.completeExecution({
      workspaceId,
      changeSetId: first.id,
      executionRunId: firstRun.executionRunId,
      finishedAt: new Date("2026-08-19T10:02:00Z"),
      resultPayload: {},
      items: [
        { itemId: first.items[0]!.id, status: "success" },
        { itemId: first.items[1]!.id, status: "success" },
        { itemId: first.items[0]!.id, status: "success" },
      ],
    })).rejects.toThrow("exactly once");

    await expect(repository.completeExecution({
      workspaceId,
      changeSetId: first.id,
      executionRunId: secondRun.executionRunId,
      finishedAt: new Date("2026-08-19T10:02:00Z"),
      resultPayload: {},
      items: first.items.map((item) => ({ itemId: item.id, status: "success" as const })),
    })).rejects.toThrow("execution run");
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

    const reconciled = await repository.completeReconciliation({
      workspaceId,
      changeSetId: created.id,
      finishedAt: new Date("2026-08-19T10:05:00Z"),
      resultPayload: { reconciled: true },
      items: created.items.map((item) => ({ itemId: item.id, status: "success" })),
    });
    expect(reconciled.status).toBe("success");
    const audit = await pool.query<{ status: string; payload: Record<string, unknown> }>(
      `SELECT status, request_payload AS payload FROM execution_runs
       WHERE changeset_id=$1 ORDER BY attempt DESC LIMIT 1`,
      [created.id],
    );
    expect(audit.rows[0]).toEqual({ status: "success", payload: { reconcile: true } });
  });
});
