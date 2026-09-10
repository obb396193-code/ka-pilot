import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";

import { runMigrations } from "../src/migrate.js";
import { workItemScopeClause } from "../src/r014/workspace-authority.js";
import {
  WorkItemListRepository,
  type WorkItemListRepositoryPool,
} from "../src/work-item-list-repository.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("A dedicated local TEST_DATABASE_URL is required");
const target = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) || target.port !== "55432" ||
  !/^\/ka_[a-z0-9_]*_test$/.test(target.pathname)) throw new Error("A dedicated local test database is required");

describe("WorkItemListRepository", () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  const repository = new WorkItemListRepository(pool);
  let workspaceId: string;
  let otherWorkspaceId: string;
  let currentUserId: string;
  let otherUserId: string;

  beforeAll(async () => runMigrations({ databaseUrl }), 30_000);
  afterAll(async () => pool.end());

  beforeEach(async () => {
    const suffix = randomUUID();
    const workspaces = await pool.query<{ id: string }>(
      "INSERT INTO workspaces (name) VALUES ($1), ($2) RETURNING id",
      [`work-list-${suffix}`, `work-list-other-${suffix}`],
    );
    workspaceId = workspaces.rows[0]!.id;
    otherWorkspaceId = workspaces.rows[1]!.id;
    const users = await pool.query<{ id: string }>(
      `INSERT INTO users (workspace_id, buc_id, name) VALUES
         ($1, $2, '当前用户'), ($1, $3, '其他用户') RETURNING id`,
      [workspaceId, `work-current-${suffix}`, `work-other-${suffix}`],
    );
    currentUserId = users.rows[0]!.id;
    otherUserId = users.rows[1]!.id;
    await pool.query(
      `INSERT INTO accounts (workspace_id, media, account_id, account_name) VALUES
         ($1, 'KUAISHOU', 'approved', '授权账户'),
         ($1, 'KUAISHOU', 'unapproved', '未授权账户'),
         ($1, 'TENCENT', 'approved', '跨媒体同号'),
         ($1, 'KUAISHOU', 'snapshot', '快照账户'),
         ($2, 'KUAISHOU', 'approved', '跨租户同号')`,
      [workspaceId, otherWorkspaceId],
    );
    await pool.query(
      `INSERT INTO tasks (workspace_id, task_id, task_name) VALUES ($1, 'task-1', '任务一')`,
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO work_items (
         workspace_id, type, media, account_id, task_id, severity, title, status,
         assignee, creator, sla_due, created_at, resolved_at
       ) VALUES
         ($1, 'diagnosis', 'KUAISHOU', 'approved', 'task-1', 'P0', '授权异常', 'open', $3, $3, '2026-08-26T12:00:00Z', '2026-08-25T12:00:00Z', NULL),
         ($1, 'self', NULL, NULL, NULL, 'P1', '本人待办', 'processing', $3, $3, NULL, '2026-08-25T13:00:00Z', NULL),
         ($1, 'agent_question', NULL, NULL, NULL, 'P2', '本人提问', 'escalated', NULL, $3, NULL, '2026-08-25T11:00:00Z', NULL),
         ($1, 'diagnosis', 'KUAISHOU', 'unapproved', NULL, 'opportunity', '越权账户', 'open', $3, $3, NULL, '2026-08-25T14:00:00Z', NULL),
         ($1, 'self', NULL, NULL, NULL, 'P0', '他人待办', 'open', $4, $4, NULL, '2026-08-25T10:00:00Z', NULL),
         ($1, 'diagnosis', 'KUAISHOU', 'approved', NULL, 'P0', '已完成异常', 'done', $3, $3, NULL, '2026-08-24T10:00:00Z', '2026-08-25T15:00:00Z'),
         ($1, 'diagnosis', 'TENCENT', 'approved', NULL, 'P0', '跨媒体越权', 'open', $3, $3, NULL, '2026-08-25T16:00:00Z', NULL),
         ($2, 'diagnosis', 'KUAISHOU', 'approved', NULL, 'P0', '跨租户越权', 'open', NULL, NULL, NULL, '2026-08-25T17:00:00Z', NULL)`,
      [workspaceId, otherWorkspaceId, currentUserId, otherUserId],
    );
  });

  const baseQuery = () => ({
    workspaceId, requestingUserId: currentUserId, businessDate: "2026-08-25",
    scopeKind: "explicit_accounts" as const,
    allowedAccounts: [{ media: "KUAISHOU", accountId: "approved" }],
    page: 1, pageSize: 20,
  });

  async function taskMatrix() {
    await pool.query(`INSERT INTO task_accounts (workspace_id,task_id,media,account_id,valid_from) VALUES
      ($1,'task-granted','KUAISHOU','approved','2026-08-25'),
      ($1,'task-cross-media','TENCENT','approved','2026-08-25'),
      ($2,'task-foreign','KUAISHOU','approved','2026-08-25')`, [workspaceId, otherWorkspaceId]);
    await pool.query(`INSERT INTO work_items (workspace_id,type,task_id,title,status,assignee,creator) VALUES
      ($1,'self','task-granted','matrix-granted','open',$3,$3),
      ($1,'self','task-cross-media','matrix-cross-media','open',$3,$3),
      ($1,'self','task-foreign','matrix-foreign-link','open',$3,$3),
      ($1,'self','task-no-link','matrix-assigned','open',$4,NULL),
      ($1,'self','task-no-link','matrix-created','open',NULL,$4),
      ($2,'self','task-foreign','matrix-foreign-row','open',NULL,NULL)`,
      [workspaceId, otherWorkspaceId, otherUserId, currentUserId]);
  }

  it("uses task grants OR self without leaking cross-media/cross-workspace tasks; empty grants only self", async () => {
    await taskMatrix();
    const output = await repository.list({ ...baseQuery(), q: "matrix-" });
    expect(output.total).toBe(3);
    expect(output.rows.map(row => row.title).sort()).toEqual(["matrix-assigned", "matrix-created", "matrix-granted"]);
    expect(output.rows.find(row => row.title === "matrix-granted")).toMatchObject({
      workspaceId, taskId: "task-granted", taskScopeAccount: { media: "KUAISHOU", accountId: "approved" },
    });
    const empty = await repository.list({ ...baseQuery(), q: "matrix-", allowedAccounts: [] });
    expect(empty.total).toBe(2);
    expect(empty.rows.map(row => row.title).sort()).toEqual(["matrix-assigned", "matrix-created"]);
    const second = await repository.list({ ...baseQuery(), q: "matrix-", page: 2, pageSize: 2 });
    expect(second.total).toBe(3);
    expect(second.rows).toHaveLength(1);
  });

  it("team sees all own task and account items, never private or foreign rows", async () => {
    await taskMatrix();
    const output = await repository.list({ ...baseQuery(), scopeKind: "team_workspace_readonly", allowedAccounts: [] });
    expect(output.total).toBe(8);
    expect(output.rows.every(row => row.workspaceId === workspaceId && (row.accountId !== null || row.taskId !== null))).toBe(true);
    expect(output.rows.filter(row => row.title.startsWith("matrix-")).map(row => row.title).sort()).toEqual([
      "matrix-assigned", "matrix-created", "matrix-cross-media", "matrix-foreign-link", "matrix-granted",
    ]);
  });

  it("negative control: removing the shared predicate exposes denied count/page rows", async () => {
    await taskMatrix();
    const predicate = workItemScopeClause("$3", "$4", "item", "$2");
    const mutant = new WorkItemListRepository({ connect: async () => {
      const client = await pool.connect();
      return { query: <Row extends QueryResultRow>(sql: string, params?: unknown[]) =>
        client.query<Row>(sql.replace(predicate, "($2::uuid IS NOT NULL AND $3::text IS NOT NULL AND $4::jsonb IS NOT NULL)"), params),
        release: () => client.release() };
    } });
    const safe = await repository.list({ ...baseQuery(), q: "matrix-" });
    const unsafe = await mutant.list({ ...baseQuery(), q: "matrix-" });
    expect(safe.total).toBe(3);
    expect(unsafe.total).toBe(5);
    expect(unsafe.rows.map(row => row.title)).toContain("matrix-cross-media");
    expect(unsafe.rows.map(row => row.title)).toContain("matrix-foreign-link");
  });

  it("holds task link proof and count/page in one snapshot when links are concurrently removed", async () => {
    await taskMatrix();
    let removed = false;
    const snapshot = new WorkItemListRepository({ connect: async () => {
      const client = await pool.connect();
      return { query: async <Row extends QueryResultRow>(sql: string, params?: unknown[]) => {
        const result = await client.query<Row>(sql, params);
        if (!removed && sql.includes("work-item-list-total")) {
          removed = true;
          await pool.query("DELETE FROM task_accounts WHERE workspace_id=$1 AND task_id='task-granted'", [workspaceId]);
        }
        return result;
      }, release: () => client.release() };
    } });
    const output = await snapshot.list({ ...baseQuery(), q: "matrix-granted" });
    expect(output).toMatchObject({ total: 1, rows: [{
      taskId: "task-granted", taskScopeAccount: { media: "KUAISHOU", accountId: "approved" },
    }] });
    expect(await repository.list({ ...baseQuery(), q: "matrix-granted" })).toMatchObject({ total: 0, rows: [] });
  });

  it("keeps dispatched visible without exposing same-ID accounts across media or workspace", async () => {
    await pool.query("UPDATE work_items SET status='dispatched' WHERE workspace_id=ANY($1::uuid[]) AND status='open'", [[workspaceId, otherWorkspaceId]]);
    const output = await repository.list(baseQuery());
    expect(output.total).toBe(3);
    expect(output.rows.map(row => row.title)).toEqual(["授权异常", "本人待办", "本人提问"]);
    expect(output.rows[0]).toMatchObject({ status: "dispatched", workspaceId, media: "KUAISHOU", accountId: "approved" });
    const filtered = await repository.list({ ...baseQuery(), status: "dispatched" });
    expect(filtered.total).toBe(1);
    expect(filtered.rows.map(row => [row.workspaceId, row.media, row.accountId])).toEqual([[workspaceId, "KUAISHOU", "approved"]]);
    expect((await repository.list({ ...baseQuery(), status: "dispatched", allowedAccounts: [] })).total).toBe(0);
    expect(await repository.list({ ...baseQuery(), status: "dispatched", page: 2 })).toMatchObject({ total: 1, rows: [] });
    const team = await repository.list({ ...baseQuery(), status: "dispatched", scopeKind: "team_workspace_readonly", allowedAccounts: [] });
    expect(team.total).toBe(3);
    expect(team.rows.every(row => row.workspaceId === workspaceId && row.media !== null)).toBe(true);
    expect(team.rows.map(row => [row.media, row.accountId]).sort()).toEqual([
      ["KUAISHOU", "approved"], ["KUAISHOU", "unapproved"], ["TENCENT", "approved"],
    ]);
  });

  it("retains only the current user's null-account dispatched items for empty personal grants", async () => {
    await pool.query("UPDATE work_items SET status='dispatched' WHERE workspace_id=$1 AND media IS NULL", [workspaceId]);
    const personal = await repository.list({ ...baseQuery(), allowedAccounts: [], status: "dispatched" });
    expect(personal.total).toBe(2);
    expect(personal.rows.map(row => row.title)).toEqual(["本人待办", "本人提问"]);
    expect((await repository.list({ ...baseQuery(), allowedAccounts: [], status: "dispatched", scopeKind: "team_workspace_readonly" })).total).toBe(0);
  });

  it("returns authorized account items plus only the current user's unscoped items in stable order", async () => {
    const output = await repository.list(baseQuery());
    expect(output.total).toBe(3);
    expect(output.accountItemCount).toBe(1);
    expect(output.rows.map((row) => row.title)).toEqual(["授权异常", "本人待办", "本人提问"]);
    expect(output.rows[0]).toMatchObject({
      accountName: "授权账户", taskId: "task-1", taskName: "任务一",
      assigneeUserId: currentUserId, assigneeDisplayName: "当前用户",
    });
    expect(output.dataAsOf).toBe("2026-08-25T13:00:00.000Z");
  });

  it("returns team account work items but excludes every unscoped personal item", async () => {
    const output = await repository.list({
      ...baseQuery(),
      scopeKind: "team_workspace_readonly",
      allowedAccounts: [],
    });
    expect(output.total).toBe(3);
    expect(output.accountItemCount).toBe(3);
    expect(output.rows.every((row) =>
      row.workspaceId === workspaceId && row.media !== null && row.accountId !== null)).toBe(true);
    expect(output.rows.map((row) => row.title)).not.toContain("本人待办");
    expect(output.rows.map((row) => row.title)).not.toContain("本人提问");
    expect(output.rows.map((row) => row.title)).not.toContain("他人待办");
    expect(output.rows.map((row) => row.title)).not.toContain("跨租户越权");
  });

  it("rejects any account grant carried by team scope", async () => {
    await expect(repository.list({
      ...baseQuery(),
      scopeKind: "team_workspace_readonly",
    })).rejects.toThrow("must not carry account grants");
  });

  it("applies frozen parameterized filters and explicit terminal status", async () => {
    expect((await repository.list({ ...baseQuery(), q: "本人" })).total).toBe(2);
    expect((await repository.list({ ...baseQuery(), severity: "P1" })).rows[0]?.title).toBe("本人待办");
    expect((await repository.list({ ...baseQuery(), type: "agent_question" })).rows[0]?.title).toBe("本人提问");
    expect((await repository.list({ ...baseQuery(), assigneeUserId: currentUserId })).total).toBe(2);
    expect((await repository.list({ ...baseQuery(), taskId: "task-1" })).rows[0]?.title).toBe("授权异常");
    expect((await repository.list({ ...baseQuery(), status: "done" })).rows[0]?.title).toBe("已完成异常");
    expect((await repository.list({ ...baseQuery(), q: "%' OR true --" })).total).toBe(0);
  });

  it("keeps readiness in the same snapshot and empty scope still reveals only personal unscoped items", async () => {
    expect((await repository.list(baseQuery())).initialFullComplete).toBe(false);
    const empty = await repository.list({ ...baseQuery(), allowedAccounts: [] });
    expect(empty.total).toBe(2);
    expect(empty.accountItemCount).toBe(0);
    const job = await pool.query<{ id: string }>(
      `INSERT INTO jobs (workspace_id, job_type, payload, credential_owner_user_id, status)
       VALUES ($1, 'etl_full', '{"media":"KUAISHOU"}'::jsonb, $2, 'done') RETURNING id`,
      [workspaceId, currentUserId],
    );
    await pool.query(
      `INSERT INTO etl_runs (workspace_id, job_id, run_kind, scope, status, rows_ingested)
       VALUES ($1, $2, 'full', '{}'::jsonb, 'done', 1)`,
      [workspaceId, job.rows[0]!.id],
    );
    expect((await repository.list(baseQuery())).initialFullComplete).toBe(false);
    await pool.query(`INSERT INTO account_metrics_daily(workspace_id,media,account_id,ds,computed_at)
      VALUES($1,'KUAISHOU','approved','2026-08-25',now())`, [workspaceId]);
    expect((await repository.list(baseQuery())).initialFullComplete).toBe(true);
    expect((await repository.list({ ...baseQuery(), businessDate: "2026-08-26" })).initialFullComplete).toBe(false);
  });

  it("holds count, page and readiness in one RR/RO snapshot", async () => {
    let inserted = false;
    const instrumented: WorkItemListRepositoryPool = {
      connect: async () => {
        const client = await pool.connect();
        return {
          query: async <Row extends QueryResultRow>(sql: string, values?: unknown[]) => {
            const queryResult = await client.query<Row>(sql, values);
            if (!inserted && sql.includes("work-item-list-total")) {
              inserted = true;
              await pool.query(
                `INSERT INTO work_items (
                   workspace_id, type, media, account_id, severity, title, status, created_at
                 ) VALUES ($1, 'diagnosis', 'KUAISHOU', 'snapshot', 'P0', '并发工作项', 'open', now())`,
                [workspaceId],
              );
            }
            return queryResult as QueryResult<Row>;
          },
          release: () => client.release(),
        } as Pick<PoolClient, "query" | "release">;
      },
    };
    const scope = [...baseQuery().allowedAccounts, { media: "KUAISHOU", accountId: "snapshot" }];
    const snapshotRepository = new WorkItemListRepository(instrumented);
    expect((await snapshotRepository.list({ ...baseQuery(), allowedAccounts: scope })).total).toBe(3);
    expect((await repository.list({ ...baseQuery(), allowedAccounts: scope })).total).toBe(4);
  });
});
