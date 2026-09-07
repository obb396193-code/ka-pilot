import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";

import { runMigrations } from "../src/migrate.js";
import { WorkItemRepository } from "../src/work-item-repository.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka";

describe("WorkItemRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8, connectionTimeoutMillis: 3000 });
  const repository = new WorkItemRepository(pool);
  let workspaceA: string;
  let workspaceB: string;

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
  });

  afterAll(async () => { await pool.end(); });

  beforeEach(async () => {
    const suffix = randomUUID();
    const workspaces = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id",
      [`work-items-a-${suffix}`, `work-items-b-${suffix}`],
    );
    const first = workspaces.rows[0]?.id;
    const second = workspaces.rows[1]?.id;
    if (first === undefined || second === undefined) {
      throw new Error("Failed to create isolated work-item test workspaces");
    }
    workspaceA = first;
    workspaceB = second;
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'KUAISHOU', 'account-1'), ($2, 'KUAISHOU', 'account-1')`,
      [workspaceA, workspaceB],
    );
  });

  const input = () => ({
    workspaceId: workspaceA,
    type: "diagnosis" as const,
    media: "KUAISHOU",
    accountId: "account-1",
    taskId: "task-1",
    ruleId: 11,
    severity: "P1" as const,
    title: "消耗断崖",
    evidenceSnapshot: { snapshot_at: "2026-08-19T09:15:00Z", spend_change: -0.4 },
    acceptanceCriteria: "消耗恢复到上周同期 80%",
    slaDue: new Date("2026-08-20T09:15:00Z"),
  });

  it("creates one active work item with its evidence and SLA", async () => {
    const result = await repository.createOrMergeAlert(input());

    expect(result.disposition).toBe("created");
    expect(result.workItem).toMatchObject({
      workspaceId: workspaceA,
      accountId: "account-1",
      taskId: "task-1",
      ruleId: "11",
      severity: "P1",
      status: "open",
      evidenceSnapshot: expect.objectContaining({ spend_change: -0.4 }),
      acceptanceCriteria: "消耗恢复到上周同期 80%",
    });
  });

  it("serializes concurrent creation for the same workspace, rule and account", async () => {
    const [left, right] = await Promise.all([
      repository.createOrMergeAlert(input()),
      repository.createOrMergeAlert(input()),
    ]);

    expect([left.disposition, right.disposition].sort()).toEqual(["created", "merged"]);
    expect(left.workItem.id).toBe(right.workItem.id);
    const count = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM work_items WHERE workspace_id=$1",
      [workspaceA],
    );
    expect(count.rows[0]?.count).toBe("1");
  });

  it("upgrades severity without creating a duplicate", async () => {
    const original = await repository.createOrMergeAlert(input());
    const upgraded = await repository.createOrMergeAlert({
      ...input(),
      severity: "P0",
      title: "超成本起量",
      evidenceSnapshot: { snapshot_at: "2026-08-19T09:20:00Z", real_cpa: 42 },
    });

    expect(upgraded.disposition).toBe("upgraded");
    expect(upgraded.workItem.id).toBe(original.workItem.id);
    expect(upgraded.workItem).toMatchObject({ severity: "P0", title: "超成本起量" });
  });

  it("does not deduplicate across workspaces", async () => {
    const left = await repository.createOrMergeAlert(input());
    const right = await repository.createOrMergeAlert({ ...input(), workspaceId: workspaceB });

    expect(left.workItem.id).not.toBe(right.workItem.id);
    expect(right.disposition).toBe("created");
  });

  it("does not deduplicate the same account id across media and scopes reads by workspace", async () => {
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id)
       VALUES ($1, 'TENCENT', 'account-1')`,
      [workspaceA],
    );
    const kuaishou = await repository.createOrMergeAlert(input());
    const tencent = await repository.createOrMergeAlert({ ...input(), media: "TENCENT" });

    expect(tencent.workItem.id).not.toBe(kuaishou.workItem.id);
    expect(await repository.find(workspaceA, tencent.workItem.id)).toMatchObject({
      workspaceId: workspaceA,
      media: "TENCENT",
      accountId: "account-1",
    });
    expect(await repository.find(workspaceB, tencent.workItem.id)).toBeNull();
  });

  it("transitions atomically and records ignore metadata", async () => {
    const created = await repository.createOrMergeAlert(input());
    const processing = await repository.transition({
      workspaceId: workspaceA,
      workItemId: created.workItem.id,
      action: "start_processing",
    });
    expect(processing.status).toBe("processing");

    const ignored = await repository.transition({
      workspaceId: workspaceA,
      workItemId: created.workItem.id,
      action: "ignore",
      ignoreReason: "已人工调整",
    });
    expect(ignored).toMatchObject({
      status: "ignored",
      ignoreReason: "已人工调整",
      mutedUntil: null,
    });
    expect(ignored.resolvedAt).toBeInstanceOf(Date);
  });

  it("rejects legacy mute without mutation and preserves historical evidence on plain ignore", async () => {
    const created = await repository.createOrMergeAlert(input());
    await pool.query("UPDATE work_items SET muted_until = '2026-08-01'::date WHERE workspace_id=$1 AND id=$2",
      [workspaceA, created.workItem.id]);
    await expect(repository.transition({ workspaceId: workspaceA, workItemId: created.workItem.id,
      action: "ignore", mutedUntil: "2026-09-09" })).rejects.toMatchObject({ code: "ACCOUNT_MUTE_REQUIRED" });
    expect(await repository.find(workspaceA, created.workItem.id)).toMatchObject({ status: "open", mutedUntil: "2026-08-01" });
    expect(await repository.transition({ workspaceId: workspaceA, workItemId: created.workItem.id,
      action: "ignore", ignoreReason: "合成历史证据" })).toMatchObject({ status: "ignored", mutedUntil: "2026-08-01" });
    const mutes = await pool.query("SELECT * FROM account_mutes WHERE workspace_id=$1", [workspaceA]);
    expect(mutes.rows).toEqual([]);
  });

  it("rejects a transition in the wrong workspace and protects terminal states", async () => {
    const created = await repository.createOrMergeAlert(input());
    await expect(
      repository.transition({
        workspaceId: workspaceB,
        workItemId: created.workItem.id,
        action: "start_processing",
      }),
    ).rejects.toThrow(/not found/);

    await repository.transition({
      workspaceId: workspaceA,
      workItemId: created.workItem.id,
      action: "start_processing",
    });
    await repository.transition({
      workspaceId: workspaceA,
      workItemId: created.workItem.id,
      action: "complete",
    });
    await expect(
      repository.transition({
        workspaceId: workspaceA,
        workItemId: created.workItem.id,
        action: "start_processing",
      }),
    ).rejects.toThrow(/invalid work item transition/);
  });

  it("requires processing and a nonblank reason without mutating rejected requests", async () => {
    const { workItem } = await repository.createOrMergeAlert(input());
    const request = { workspaceId: workspaceA, workItemId: workItem.id, action: "reject" as const };
    await expect(repository.transition({ ...request, rejectReason: "证据不足" })).rejects.toThrow(/transition/);
    expect(await repository.find(workspaceA, workItem.id)).toMatchObject({ status: "open", rejectReason: null, resolvedAt: null });
    await repository.transition({ ...request, action: "start_processing" });
    for (const reason of [undefined, null, "", " \n\t "]) {
      await expect(repository.transition({ ...request, ...(reason === undefined ? {} : { rejectReason: reason }) })).rejects.toThrow(/reason/i);
    }
    expect(await repository.find(workspaceA, workItem.id)).toMatchObject({ status: "processing", rejectReason: null, resolvedAt: null });
    await repository.transition({ ...request, rejectReason: "核对后不采纳" });
    expect(await repository.find(workspaceA, workItem.id)).toMatchObject({ status: "rejected", rejectReason: "核对后不采纳", resolvedAt: expect.any(Date) });
  });
});
