import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deriveSystemReadiness, mergeReadiness, overallReadiness } from "@ka/domain";
import { runMigrations } from "../../src/migrate.js";
import { TaskListRepository } from "../../src/task-list-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

describe("v1.5.1 ② task list stage and readiness (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const repository = new TaskListRepository(pool);
  let workspaceId = "";
  let userId = "";
  let readyTask = "";
  let bareTask = "";

  const query = () => ({
    workspaceId,
    requestingUserId: userId,
    businessDate: "2026-09-05",
    scopeKind: "team_workspace_readonly" as const,
    allowedAccounts: [] as { media: string; accountId: string }[],
    page: 1,
    pageSize: 20,
  });

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'team') RETURNING id", [`r014-${randomUUID()}`],
    )).rows[0].id;
    userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','lead') RETURNING id", [workspaceId],
    )).rows[0].id;
    readyTask = `s6b-${randomUUID()}`;
    bareTask = `s6b-${randomUUID()}`;
    await pool.query(
      `INSERT INTO tasks(workspace_id,task_id,task_name,status,stage,stage_source)
       VALUES ($1,$2,'投放中的任务','active','delivering','workflow'),
              ($1,$3,'空任务','preparing','preparing','system')`,
      [workspaceId, readyTask, bareTask],
    );
    // 三个户：一个有余额有 unit，一个有余额没 unit，一个都没有。
    for (const [accountId, balance, hasUnit] of [
      ["s6b-a1", 10000, true], ["s6b-a2", 5000, false], ["s6b-a3", 0, false],
    ] as const) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2)", [workspaceId, accountId]);
      await pool.query(
        "INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,'KUAISHOU',$3,'2026-09-01')",
        [workspaceId, readyTask, accountId],
      );
      await pool.query(
        "INSERT INTO account_balance(workspace_id,media,account_id,balance,synced_at) VALUES($1,'KUAISHOU',$2,$3,now())",
        [workspaceId, accountId, balance],
      );
      if (hasUnit) {
        await pool.query(
          `INSERT INTO ad_entities(entity_id,workspace_id,media,account_id,entity_type,status)
           VALUES($1,$2,'KUAISHOU',$3,'unit','ACTIVE')`,
          [`unit-${accountId}`, workspaceId, accountId],
        );
      }
    }
    await pool.query(
      "INSERT INTO task_readiness_overrides(workspace_id,task_id,dimension,ready,marked_by) VALUES($1,$2,'strategy',true,$3)",
      [workspaceId, readyTask, userId],
    );
  });

  afterAll(async () => {
    for (const table of ["task_readiness_overrides", "ad_entities", "account_balance", "task_accounts",
      "tasks", "accounts", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.end();
  });

  it("carries the delivery stage and its source alongside the task status", async () => {
    const rows = (await repository.list(query())).rows;
    const byId = Object.fromEntries(rows.map((row) => [row.taskId, row]));
    // stage 七态与 status 三态是两个维度：status=active 时 stage 可以是 delivering。
    expect(byId[readyTask]).toMatchObject({ status: "active", stage: "delivering", stageSource: "workflow" });
    expect(byId[bareTask]).toMatchObject({ stage: "preparing", stageSource: "system" });
  });

  it("collects the readiness facts the database can actually prove", async () => {
    const row = (await repository.list(query())).rows.find((entry) => entry.taskId === readyTask)!;
    expect(row.readinessFacts).toEqual({
      accountCount: 3,
      rechargedCount: 2,
      builtCount: 1,
      unfundedAccounts: ["s6b-a3"],
      unbuiltAccounts: ["s6b-a2", "s6b-a3"],
    });
  });

  it("derives the three sourced dimensions and leaves the other three undefined", async () => {
    const row = (await repository.list(query())).rows.find((entry) => entry.taskId === readyTask)!;
    const readiness = mergeReadiness(
      deriveSystemReadiness(row.readinessFacts),
      row.readinessOverrides.map((entry) => ({ dimension: entry.dimension as never, ready: entry.ready })),
    );
    expect(readiness.accounts).toMatchObject({ ready: true, source: "system" });
    expect(readiness.recharge.ratio).toEqual({ value: 2 / 3, state: "finite" });
    expect(readiness.infra.missing).toEqual(["s6b-a2 无 unit", "s6b-a3 无 unit"]);
    // 人工勾过的那段变 manual，但没有源的比例仍是 undefined，不会凭空出现数字。
    expect(readiness.strategy).toMatchObject({ ready: true, source: "manual" });
    expect(readiness.strategy.ratio).toEqual({ value: null, state: "undefined" });
    expect(overallReadiness(readiness)).toEqual({ value: null, state: "undefined" });
  });

  it("reports an empty task as undeterminable rather than zero percent ready", async () => {
    const row = (await repository.list(query())).rows.find((entry) => entry.taskId === bareTask)!;
    expect(row.readinessFacts.accountCount).toBe(0);
    expect(row.readinessOverrides).toEqual([]);
    const readiness = mergeReadiness(deriveSystemReadiness(row.readinessFacts), []);
    expect(readiness.accounts.missing).toEqual(["任务下还没有账户"]);
    expect(readiness.recharge.ratio).toEqual({ value: null, state: "undefined" });
  });
});
