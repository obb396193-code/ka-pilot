import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import type { ChangeValue } from "@ka/domain";

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

  async function create(ttl = new Date("2026-08-19T10:30:00Z"), withPreview = true) {
    const created = await repository.create({
      workspaceId,
      media: "KUAISHOU",
      accountId: "account-1",
      title: "批量降价",
      initiator: userId,
      credentialOwnerUserId: userId,
      ttlExpireAt: ttl,
      reasonCode: "cost_control",
      items: [
        { targetType: "unit", targetId: "unit-1", field: "bid", fromValue: { type: "number" as const, value: 30 }, toValue: { type: "number" as const, value: 27 } },
        { targetType: "unit", targetId: "unit-2", field: "budget", fromValue: { type: "number" as const, value: 1000 }, toValue: { type: "number" as const, value: 800 } },
      ],
    });
    // Explicit synthetic preflight for these PG tests, never production create behavior.
    if (withPreview) await preview(created.id);
    return created;
  }

  async function preview(changeSetId: string) {
    const at = new Date("2026-08-19T09:00:00Z");
    const prepared = await repository.prepareDryRun({ workspaceId, changeSetId, now: at });
    await repository.recordDryRun({ workspaceId, changeSetId, now: at, expectedHash: prepared.hash,
      items: prepared.changeset.items.map((item) => ({ itemId: item.id, status: "success" })) });
    return prepared;
  }

  it("does not confirm without a successful persisted preview", async () => {
    const created = await create(undefined, false);
    await expect(repository.confirm({ workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:00:00Z"), currentValues: [] })).rejects.toMatchObject({ code: "DRY_RUN_REQUIRED" });
    expect((await repository.get(workspaceId, created.id)).status).toBe("draft");
  });

  it.each(["item", "ttl"])("rejects a prepared preview after persisted %s changes", async (kind) => {
    const created = await create();
    const prepared = await preview(created.id);
    if (kind === "item") await pool.query("UPDATE changeset_items SET to_value=$2::jsonb WHERE changeset_id=$1", [created.id, JSON.stringify({ type: "number", value: 99 })]);
    else await pool.query("UPDATE changesets SET ttl_expire_at=ttl_expire_at+interval '1 microsecond' WHERE id=$1", [created.id]);
    await expect(repository.recordDryRun({ workspaceId, changeSetId: created.id, now: new Date("2026-08-19T09:01:00Z"), expectedHash: prepared.hash,
      items: created.items.map((item) => ({ itemId: item.id, status: "success" })) })).rejects.toMatchObject({ code: "FROM_VALUE_CHANGED" });
    await expect(repository.confirm({ workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:00:00Z"), currentValues: [] })).rejects.toMatchObject({ code: "FROM_VALUE_CHANGED" });
  });

  it("invalidates an older successful run when the latest preview fails", async () => {
    const created = await create(), prepared = await preview(created.id);
    await repository.recordDryRun({ workspaceId, changeSetId: created.id, now: new Date("2026-08-19T09:01:00Z"), expectedHash: prepared.hash,
      items: created.items.map((item) => ({ itemId: item.id, status: "failed" })) });
    await expect(repository.confirm({ workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:00:00Z"), currentValues: [] })).rejects.toMatchObject({ code: "DRY_RUN_REQUIRED" });
    const rows = await pool.query("SELECT dry_run,status FROM execution_runs WHERE changeset_id=$1 ORDER BY attempt", [created.id]);
    expect(rows.rows.map((row) => row.status)).toEqual(["success", "success", "failed"]);
    expect(rows.rows.every((row) => row.dry_run)).toBe(true);
  });

  it("checks the successful run itself, not only the changeset hash", async () => {
    const created = await create();
    await pool.query("UPDATE execution_runs SET status='failed' WHERE changeset_id=$1 AND dry_run=true", [created.id]);
    await expect(repository.confirm({ workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:00:00Z"), currentValues: [] })).rejects.toMatchObject({ code: "DRY_RUN_REQUIRED" });
  });

  it("serializes parallel confirmation of one preview", async () => {
    const created = await create();
    const input = { workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:00:00Z"), currentValues: created.items.map((item) => ({ targetType: item.targetType, targetId: item.targetId, field: item.field, value: item.fromValue })) };
    const results = await Promise.all([repository.confirm(input), repository.confirm(input)]);
    expect(results.filter((result) => result.outcome === "confirmed" && result.idempotent)).toHaveLength(1);
    const hashes = (await pool.query("SELECT dry_run_hash,confirm_hash FROM changesets WHERE id=$1", [created.id])).rows[0];
    expect(hashes.dry_run_hash).toBe(hashes.confirm_hash);
    const confirmed = results.filter((r) => r.outcome === "confirmed");
    expect(confirmed).toHaveLength(2);
    expect(confirmed[0]!.executionRun.id).toBe(confirmed[1]!.executionRun.id);
    const queued = await pool.query("SELECT id,payload,credential_owner_user_id FROM jobs WHERE workspace_id=$1 AND job_type='changeset_execute'", [workspaceId]);
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0]).toMatchObject({ id: confirmed[0]!.executionRun.id, credential_owner_user_id: userId,
      payload: { workspaceId, changeSetId: created.id, executionRunId: confirmed[0]!.executionRun.id, media: "KUAISHOU", accountId: "account-1" } });
  });

  it("rolls back the confirmation and pending run if queue persistence fails", async () => {
    const created = await create();
    const faultPool = { connect: async () => {
      const client = await pool.connect();
      return { release: () => client.release(), query: (sql: string, args: unknown[]) => {
        if (sql.includes("INSERT INTO jobs")) throw new Error("synthetic queue fault");
        return client.query(sql, args);
      } };
    } } as unknown as Pool;
    await expect(new ChangeSetRepository(faultPool).confirm({ workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:00Z"),
      currentValues: created.items.map((item) => ({ targetType: item.targetType, targetId: item.targetId, field: item.field, value: item.fromValue })) })).rejects.toThrow("synthetic queue fault");
    expect((await repository.get(workspaceId, created.id)).status).toBe("draft");
    expect((await pool.query("SELECT confirm_hash FROM changesets WHERE id=$1", [created.id])).rows[0].confirm_hash).toBeNull();
    expect((await pool.query("SELECT id FROM execution_runs WHERE changeset_id=$1 AND dry_run=false", [created.id])).rows).toHaveLength(0);
    expect((await pool.query("SELECT id FROM jobs WHERE workspace_id=$1", [workspaceId])).rows).toHaveLength(0);
  });

  it("rejects confirmed replay without its original job and does not recreate it", async () => {
    const created = await create();
    const input = { workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:00Z"), currentValues: created.items.map((item) => ({ targetType: item.targetType, targetId: item.targetId, field: item.field, value: item.fromValue })) };
    const result = await repository.confirm(input);
    if (result.outcome !== "confirmed") throw new Error("expected confirmed");
    await pool.query("DELETE FROM jobs WHERE workspace_id=$1 AND id=$2", [workspaceId, result.executionRun.id]);
    await expect(repository.confirm(input)).rejects.toMatchObject({ code: "INVALID_STATE" });
    expect((await pool.query("SELECT id FROM jobs WHERE workspace_id=$1", [workspaceId])).rows).toHaveLength(0);
  });

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

  async function failedExecution() {
    const created = await create();
    const input = { workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:00:00Z"), currentValues: created.items.map((item) => ({
      targetType: item.targetType, targetId: item.targetId, field: item.field, value: item.fromValue,
    })) };
    await repository.confirm(input);
    const run = await repository.beginExecution({ workspaceId, changeSetId: created.id, startedAt: new Date("2026-08-19T10:01:00Z"), requestPayload: {} });
    if (run.directive !== "execute") throw new Error("expected execution");
    await repository.completeExecution({ workspaceId, changeSetId: created.id, executionRunId: run.executionRunId,
      finishedAt: new Date("2026-08-19T10:02:00Z"), resultPayload: { source: "synthetic" },
      items: created.items.map((item) => ({ itemId: item.id, status: "failed", failReason: "synthetic failure" })) });
    return { created, input: { ...input, now: new Date("2026-08-19T10:03:00Z") }, run };
  }

  it("serializes failed retry and retains failed run evidence before attempt two", async () => {
    const { created, input } = await failedExecution();
    const results = await Promise.all([repository.retry(input), repository.retry(input)]);
    expect(results.filter((result) => result.outcome === "confirmed" && result.idempotent)).toHaveLength(1);
    const saved = await repository.get(workspaceId, created.id);
    expect(saved.items.every((item) => item.itemStatus === "pending" && item.failReason === null)).toBe(true);
    expect(saved.credentialOwnerUserId).toBe(userId);
    expect(saved.executedAt).toBeNull();
    const next = await repository.beginExecution({ workspaceId, changeSetId: created.id, startedAt: new Date("2026-08-19T10:04:00Z"), requestPayload: {} });
    expect(next.directive).toBe("execute");
    const runs = await pool.query("SELECT attempt,status,result_payload FROM execution_runs WHERE changeset_id=$1 AND dry_run=false ORDER BY attempt", [created.id]);
    expect(runs.rows.map((row) => [row.attempt, row.status])).toEqual([[1, "failed"], [2, "running"]]);
    expect(runs.rows[0]!.result_payload).toEqual({ source: "synthetic" });
  });

  it("rejects the old attempt before a new retry can be started, expired or reconciled", async () => {
    const { created, input, run } = await failedExecution();
    const retry = await repository.retry(input);
    if (retry.outcome !== "confirmed") throw new Error("expected retry");
    expect(retry.executionRun.id).not.toBe(run.executionRunId);
    for (const startedAt of [input.now, new Date("2026-08-19T11:00Z")]) {
      await expect(repository.beginExecution({ workspaceId, changeSetId: created.id, executionRunId: run.executionRunId, startedAt, requestPayload: {} })).rejects.toMatchObject({ code: "INVALID_STATE" });
    }
    await expect(repository.assertExecutionAuthorized(workspaceId, created.id, run.executionRunId)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(repository.beginReconciliation({ workspaceId, changeSetId: created.id, sourceExecutionRunId: run.executionRunId, now: input.now, leaseMs: 1000 })).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(repository.assertExecutionAuthorized(otherWorkspaceId, created.id, retry.executionRun.id)).rejects.toThrow(/not found/);
    expect((await repository.get(workspaceId, created.id)).status).toBe("confirmed");
    expect((await pool.query("SELECT status FROM execution_runs WHERE id=$1", [retry.executionRun.id])).rows[0].status).toBe("pending");
    await expect(repository.beginExecution({ workspaceId, changeSetId: created.id, executionRunId: retry.executionRun.id, startedAt: input.now, requestPayload: {} })).resolves.toMatchObject({ directive: "execute", executionRunId: retry.executionRun.id });
  });

  it("preserves failed evidence when retry current values conflict or TTL expires", async () => {
    const { created, input } = await failedExecution();
    await expect(repository.retry({ ...input, currentValues: [] })).resolves.toMatchObject({ outcome: "conflict" });
    await expect(repository.retry({ ...input, now: new Date("2026-08-19T10:30:00Z") })).resolves.toEqual({ outcome: "expired" });
    const saved = await repository.get(workspaceId, created.id);
    expect(saved.status).toBe("failed");
    expect(saved.items.every((item) => item.itemStatus === "failed" && item.failReason === "synthetic failure")).toBe(true);
    expect((await pool.query("SELECT id FROM execution_runs WHERE changeset_id=$1 AND dry_run=false", [created.id])).rows).toHaveLength(1);
    await expect(repository.retry({ ...input, workspaceId: otherWorkspaceId })).rejects.toThrow(/not found/);
  });

  const typedValues: ChangeValue[] = [{ type: "json", value: null }, { type: "number", value: 1 }, { type: "boolean", value: false },
    { type: "string", value: 'quote"\n中文' }, { type: "json", value: { x: 1 } }, { type: "schedule168", value: "01".repeat(84) }];
  it.each(typedValues)("preserves the typed object %j in JSONB", async (value) => {
    const created = await repository.create({ workspaceId, media: "KUAISHOU", accountId: "account-1", title: "synthetic",
      initiator: userId, credentialOwnerUserId: userId, ttlExpireAt: new Date("2026-09-07T00:00:00Z"), reasonCode: "test",
      items: [{ targetType: "account", targetId: "account-1", field: "budget", fromValue: value, toValue: value }],
    });
    expect(created.items[0]).toMatchObject({ fromValue: value, toValue: value });
    const saved = (await pool.query("SELECT from_value, jsonb_typeof(from_value) AS kind FROM changeset_items WHERE changeset_id=$1", [created.id])).rows[0];
    expect(saved).toEqual({ from_value: value, kind: "object" });
  });

  it.each([null, "001", "true", '{"x":1}'])("rejects a historical string/null row %j without rewriting it", async (legacy) => {
    const created = await create();
    await pool.query("UPDATE changeset_items SET from_value=to_jsonb($2::text) WHERE changeset_id=$1", [created.id, legacy]);
    await expect(repository.find(workspaceId, created.id)).rejects.toThrow("invalid or legacy untyped values");
    expect((await pool.query("SELECT from_value FROM changeset_items WHERE changeset_id=$1", [created.id])).rows.every((row) => row.from_value === legacy)).toBe(true);
  });

  it.each(["initiator", "credentialOwnerUserId"] as const)("rejects inactive %s at create without partial rows", async (actor) => {
    const inactive = (await pool.query("INSERT INTO users(workspace_id,name,is_active) VALUES ($1,'inactive',false) RETURNING id", [workspaceId])).rows[0].id;
    await expect(repository.create({ workspaceId, media: "KUAISHOU", accountId: "account-1", title: "rejected",
      initiator: userId, credentialOwnerUserId: userId, [actor]: inactive,
      ttlExpireAt: new Date("2026-08-19T10:30:00Z"), reasonCode: "test",
      items: [{ targetType: "unit", targetId: "unit-1", field: "bid", fromValue: { type: "number" as const, value: 1 }, toValue: { type: "number" as const, value: 2 } }],
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await pool.query("SELECT id FROM changesets WHERE workspace_id=$1", [workspaceId])).rows).toHaveLength(0);
  });

  it("rejects cross-workspace actors before attempting inserts", async () => {
    const other = (await pool.query("INSERT INTO users(workspace_id,name,is_active) VALUES ($1,'other',true) RETURNING id", [otherWorkspaceId])).rows[0].id;
    for (const actor of ["initiator", "credentialOwnerUserId"]) {
      await expect(repository.create({ workspaceId, media: "KUAISHOU", accountId: "account-1", title: "rejected",
        initiator: userId, credentialOwnerUserId: userId, [actor]: other,
        ttlExpireAt: new Date("2026-08-19T10:30:00Z"), reasonCode: "test",
        items: [{ targetType: "unit", targetId: "unit-1", field: "bid", fromValue: { type: "number" as const, value: 1 }, toValue: { type: "number" as const, value: 2 } }],
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
    expect((await pool.query("SELECT status FROM execution_runs WHERE changeset_id=$1 AND dry_run=false", [created.id])).rows).toEqual([{ status: "pending" }]);
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
    expect((await pool.query("SELECT id FROM execution_runs WHERE changeset_id=$1 AND dry_run=false", [created.id])).rows).toHaveLength(0);
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
        fromValue: { type: "number" as const, value: 100 },
        toValue: { type: "number" as const, value: 90 },
      }],
    })).rejects.toThrow(/does not match its account scope/i);
  });

  it("confirms once after strict current-value verification and is idempotent", async () => {
    const created = await create();
    const values = [
      { targetType: "unit" as const, targetId: "unit-1", field: "bid", value: { type: "number" as const, value: 30 } },
      { targetType: "unit" as const, targetId: "unit-2", field: "budget", value: { type: "number" as const, value: 1000 } },
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
    if (first.outcome !== "confirmed" || second.outcome !== "confirmed") throw new Error("expected confirmed");
    expect(second.executionRun.id).toBe(first.executionRun.id);
    await expect(repository.beginExecution({ workspaceId, changeSetId: created.id, executionRunId: first.executionRun.id,
      startedAt: new Date("2026-08-19T10:06Z"), requestPayload: { confirm_hash: "cannot-override" } })).resolves.toMatchObject({ directive: "execute", executionRunId: first.executionRun.id });
    const runs = await pool.query("SELECT id,status,request_payload FROM execution_runs WHERE changeset_id=$1 AND dry_run=false", [created.id]);
    expect(runs.rows).toHaveLength(1);
    expect(runs.rows[0]).toMatchObject({ id: first.executionRun.id, status: "running", request_payload: { execution_context: { confirm_hash: "cannot-override" } } });
    expect(runs.rows[0].request_payload.confirm_hash).not.toBe("cannot-override");
  });

  it("keeps a conflicting draft unconfirmed and returns every conflict", async () => {
    const created = await create();
    const result = await repository.confirm({
      workspaceId,
      changeSetId: created.id,
      now: new Date("2026-08-19T10:00:00Z"),
      currentValues: [
        { targetType: "unit", targetId: "unit-1", field: "bid", value: { type: "number" as const, value: 31 } },
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

    const previewRun = (await pool.query("SELECT id FROM execution_runs WHERE changeset_id=$1 AND dry_run=true LIMIT 1", [created.id])).rows[0];
    await expect(repository.completeExecution({ workspaceId, changeSetId: created.id, executionRunId: previewRun.id,
      finishedAt: new Date("2026-08-19T10:02:00Z"), resultPayload: {}, items: created.items.map((item) => ({ itemId: item.id, status: "success" })) })).rejects.toThrow("execution run");
    expect((await repository.get(workspaceId, created.id)).items.every((item) => item.itemStatus === "pending")).toBe(true);

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
    const actual = (await pool.query("INSERT INTO execution_runs(changeset_id,attempt,status,dry_run,started_at,finished_at) VALUES($1,1,'unknown',false,'2026-08-19T10:00:00Z','2026-08-19T10:01:00Z') RETURNING id", [created.id])).rows[0];
    const run = await repository.beginExecution({
      workspaceId,
      changeSetId: created.id,
      requestPayload: {},
      startedAt: new Date(),
    });
    expect(run).toEqual({ directive: "reconcile_required" });

    const claim = await repository.beginReconciliation({ workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:05:00Z"), leaseMs: 60000 });
    if (claim.directive !== "reconcile") throw new Error("expected claim");
    const reconciled = await repository.completeReconciliation({
      workspaceId,
      changeSetId: created.id,
      executionRunId: claim.executionRunId,
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
    expect(audit.rows[0]).toMatchObject({ status: "success", payload: { reconcile: true, source_run_id: actual.id } });
  });

  it("claims once concurrently and generates only one manual question for unresolved results", async () => {
    const created = await create();
    await pool.query("UPDATE changesets SET status='unknown' WHERE id=$1", [created.id]);
    await pool.query("INSERT INTO execution_runs(changeset_id,attempt,status,dry_run,started_at) VALUES($1,1,'unknown',false,'2026-08-19T10:00Z')", [created.id]);
    const request = { workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:05Z"), leaseMs: 60000 };
    const claims = await Promise.all([repository.beginReconciliation(request), repository.beginReconciliation(request)]);
    const won = claims.find((result) => result.directive === "reconcile");
    if (!won || won.directive !== "reconcile") throw new Error("expected claim");
    expect(claims.filter((result) => result.directive === "waiting")).toHaveLength(1);
    await repository.completeReconciliation({ workspaceId, changeSetId: created.id, executionRunId: won.executionRunId, finishedAt: request.now, resultPayload: {},
      items: created.items.map((item) => ({ itemId: item.id, status: "unknown" })) });
    await expect(repository.beginReconciliation(request)).resolves.toMatchObject({ directive: "manual_required" });
    await expect(repository.beginReconciliation(request)).resolves.toMatchObject({ directive: "manual_required" });
    const manual = (await pool.query("SELECT type,assignee,creator,media,account_id FROM work_items WHERE workspace_id=$1 AND evidence_snapshot->>'changesetId'=$2", [workspaceId, created.id])).rows;
    expect(manual).toEqual([{ type: "agent_question", assignee: userId, creator: userId, media: "KUAISHOU", account_id: "account-1" }]);
    expect((await pool.query("SELECT id FROM execution_runs WHERE changeset_id=$1 AND request_payload->>'reconcile'='true'", [created.id])).rows).toHaveLength(1);
  });

  it("expires a claimed read-back to manual and fences a late result", async () => {
    const created = await create();
    await pool.query("UPDATE changesets SET status='unknown' WHERE id=$1", [created.id]);
    await pool.query("INSERT INTO execution_runs(changeset_id,attempt,status,dry_run,started_at) VALUES($1,1,'unknown',false,'2026-08-19T10:00Z')", [created.id]);
    const request = { workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:05Z"), leaseMs: 1000 };
    const claim = await repository.beginReconciliation(request);
    if (claim.directive !== "reconcile") throw new Error("expected claim");
    const after = new Date("2026-08-19T10:05:01Z");
    await expect(repository.beginReconciliation({ ...request, now: after })).resolves.toMatchObject({ directive: "manual_required" });
    const finish = { workspaceId, changeSetId: created.id, executionRunId: claim.executionRunId, finishedAt: after, resultPayload: {}, items: created.items.map((item) => ({ itemId: item.id, status: "success" as const })) };
    await expect(repository.completeReconciliation(finish)).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(repository.completeReconciliation({ ...finish, workspaceId: otherWorkspaceId })).rejects.toThrow(/not found/);
    expect((await repository.get(workspaceId, created.id)).status).toBe("unknown");
  });
  it("allows a separate one-shot read-back after a proven failure is retried", async () => {
    const created = await create();
    await pool.query("UPDATE changesets SET status='unknown',confirm_hash=dry_run_hash WHERE id=$1", [created.id]);
    await pool.query("INSERT INTO execution_runs(changeset_id,attempt,status,dry_run,started_at) VALUES($1,1,'unknown',false,'2026-08-19T10:00Z')", [created.id]);
    const request = { workspaceId, changeSetId: created.id, now: new Date("2026-08-19T10:05Z"), leaseMs: 60000 };
    const first = await repository.beginReconciliation(request);
    if (first.directive !== "reconcile") throw new Error("expected claim");
    await repository.completeReconciliation({ workspaceId, changeSetId: created.id, executionRunId: first.executionRunId, finishedAt: request.now, resultPayload: {},
      items: created.items.map((item) => ({ itemId: item.id, status: "failed" })) });
    await repository.retry({ ...request, currentValues: created.items.map((item) => ({ targetType: item.targetType, targetId: item.targetId, field: item.field, value: item.fromValue })) });
    const run = await repository.beginExecution({ workspaceId, changeSetId: created.id, startedAt: request.now, requestPayload: {} });
    if (run.directive !== "execute") throw new Error("expected execution");
    await repository.completeExecution({ workspaceId, changeSetId: created.id, executionRunId: run.executionRunId, finishedAt: request.now, resultPayload: {}, items: created.items.map((item) => ({ itemId: item.id, status: "unknown" })) });
    const second = await repository.beginReconciliation(request);
    expect(second.directive).toBe("reconcile");
    if (second.directive === "reconcile") expect(second.executionRunId).not.toBe(first.executionRunId);
  });
});
