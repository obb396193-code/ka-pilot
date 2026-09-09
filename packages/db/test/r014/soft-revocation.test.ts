import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EMPTY_READ_STATE } from "@ka/domain";
import { runMigrations } from "../../src/migrate.js";
import { AccountPipelineRepository } from "../../src/r014/account-pipeline-repository.js";
import { ExternalChangeRepository } from "../../src/r014/external-change-repository.js";
import { MeWorkspaceRepository } from "../../src/r014/me-workspace-repository.js";
import { SearchRepository } from "../../src/r014/search-repository.js";
import { UserWatchlistRepository } from "../../src/r014/user-watchlist-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "read" }[] };
}

/**
 * Q-019：018 给 `account_access_grants` 加了 `revoked_at`（软撤权，保留审计行不删行），
 * 但六处授权读当时没跟着加过滤——老板在治理后台撤掉某人某账户的授权后，
 * 这个人从工作台 / 搜索 / 关注 / 带外变更 / 账户池**还能读到该账户**。
 *
 * 每个入口做一次红绿：撤权前读得到、撤权后读不到。
 */
describe("Q-019 soft revocation is honoured by every grant-based read (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const pipelines = new AccountPipelineRepository(pool);
  const changes = new ExternalChangeRepository(pool);
  const me = new MeWorkspaceRepository(pool);
  const search = new SearchRepository(pool);
  const watchlists = new UserWatchlistRepository(pool);
  let auth: AuthContext;
  let workspaceId = "";
  let identityId = "";
  const ACCOUNT = "q019-a1";

  const revoke = () => pool.query(
    "UPDATE account_access_grants SET revoked_at=now() WHERE workspace_id=$1 AND account_id=$2",
    [workspaceId, ACCOUNT],
  );
  const restore = () => pool.query(
    "UPDATE account_access_grants SET revoked_at=NULL WHERE workspace_id=$1 AND account_id=$2",
    [workspaceId, ACCOUNT],
  );

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`q019-${randomUUID()}`],
    )).rows[0].id;
    identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`q019-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identityId, userId],
    );
    await pool.query(
      "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU',$2,'Q019 合成账户')",
      [workspaceId, ACCOUNT],
    );
    await pool.query(
      "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU',$3,'read')",
      [workspaceId, identityId, ACCOUNT],
    );
    const task = `q019-task-${randomUUID()}`;
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,$2,'别人的任务')", [workspaceId, task]);
    await pool.query(
      "INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,'KUAISHOU',$3,'2026-09-01')",
      [workspaceId, task, ACCOUNT],
    );
    await pool.query(
      `INSERT INTO external_changes(workspace_id,media,account_id,target_type,target_id,field,to_value)
       VALUES($1,'KUAISHOU',$2,'campaign','c-1','budget','1'::jsonb)`,
      [workspaceId, ACCOUNT],
    );
    auth = {
      workspaceId, userId, role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: ACCOUNT, accessLevel: "read" }] },
    };
  });

  afterAll(async () => {
    for (const table of ["external_changes", "user_watchlists", "task_accounts", "tasks",
      "account_access_grants", "accounts", "workspace_memberships", "users"]) {
      await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
    }
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]);
    await pool.end();
  });

  it("account pool: counts the account before revocation and drops it after", async () => {
    await restore();
    const before = await pipelines.pipeline(auth);
    expect(before.stages.reduce((sum, stage) => sum + stage.count, 0)).toBe(1);
    await revoke();
    const after = await pipelines.pipeline(auth);
    expect(after.stages.reduce((sum, stage) => sum + stage.count, 0)).toBe(0);
  });

  it("pool status write: allowed before revocation, forbidden after", async () => {
    await restore();
    expect((await pipelines.overridePoolStatus(auth, "KUAISHOU", ACCOUNT, "paused")).poolStatus).toBe("paused");
    await revoke();
    await expect(pipelines.overridePoolStatus(auth, "KUAISHOU", ACCOUNT, "available"))
      .rejects.toThrow(/forbidden/);
  });

  it("external changes: readable before revocation, forbidden after", async () => {
    await restore();
    expect((await changes.listForTimeline(auth, "KUAISHOU", ACCOUNT)).items).toHaveLength(1);
    await revoke();
    await expect(changes.listForTimeline(auth, "KUAISHOU", ACCOUNT)).rejects.toThrow(/forbidden/);
  });

  it("search: finds the account before revocation and hides it after", async () => {
    await restore();
    expect((await search.search(auth, "Q019")).items.map((item) => item.type)).toContain("account");
    await revoke();
    expect((await search.search(auth, "Q019")).items.filter((item) => item.type === "account")).toEqual([]);
  });

  it("watchlist write: accepted before revocation, refused after", async () => {
    await restore();
    expect((await watchlists.put(auth, [{ type: "account", media: "KUAISHOU", accountId: ACCOUNT }])).items)
      .toHaveLength(1);
    await revoke();
    await expect(watchlists.put(auth, [{ type: "account", media: "KUAISHOU", accountId: ACCOUNT }]))
      .rejects.toThrow(/forbidden/);
  });

  it("my workload: counts the account and its task before revocation, neither after", async () => {
    await restore();
    const before = await me.workloadParts(auth);
    expect(before.accounts.owned).toBe(1);
    expect(before.tasks.participating).toBe(1);
    await revoke();
    const after = await me.workloadParts(auth);
    expect(after.accounts.owned).toBe(0);
    // 参与的任务是通过账户授权推出来的，撤权后也不该再算参与。
    expect(after.tasks.participating).toBe(0);
  });

  it("keeps another optimizer's work items out of search, notifications and counts", async () => {
    await restore();
    // 别人账户上的工作项：标题里带着账户名，泄出去就是把别人的经营情况端出去。
    const other = (await pool.query(
      "INSERT INTO accounts(workspace_id,media,account_id,account_name) VALUES($1,'KUAISHOU','q019-other','别人的户') RETURNING account_id",
      [workspaceId],
    )).rows[0].account_id;
    await pool.query(
      `INSERT INTO work_items(workspace_id,type,severity,title,status,media,account_id)
       VALUES($1,'diagnosis','P0','Q019 别人户的成本异常','open','KUAISHOU',$2)`,
      [workspaceId, other]);
    await pool.query(
      `INSERT INTO work_items(workspace_id,type,severity,title,status,media,account_id)
       VALUES($1,'diagnosis','P1','Q019 我的户的成本异常','open','KUAISHOU',$2)`,
      [workspaceId, ACCOUNT]);

    const found = (await search.search(auth, "Q019")).items.filter((item) => item.type === "work_item");
    expect(found.map((item) => item.title)).toEqual(["Q019 我的户的成本异常"]);

    const counts = await me.countsParts(auth, EMPTY_READ_STATE);
    // 只该数到自己那一条，不是全空间两条。
    expect(counts.workItems).toEqual({ open: 1, p0: 0, p1: 1, opportunity: 0 });

    const notifications = await me.notificationSources(auth);
    expect(JSON.stringify(notifications)).not.toContain("别人户");

    await pool.query("DELETE FROM work_items WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM accounts WHERE workspace_id=$1 AND account_id=$2", [workspaceId, other]);
  });

  it("keeps the revoked grant row for audit instead of deleting it", async () => {
    await revoke();
    const row = (await pool.query(
      "SELECT revoked_at FROM account_access_grants WHERE workspace_id=$1 AND account_id=$2", [workspaceId, ACCOUNT],
    )).rows[0];
    // 软撤权：行还在、revoked_at 有值——审计能查到「谁在什么时候被撤了权」。
    expect(row).toBeDefined();
    expect(row.revoked_at).not.toBeNull();
    // 撤权后计数入口应当是干净的空，而不是因为读不到而报错。
    expect((await me.countsParts(auth, EMPTY_READ_STATE)).workItems).toEqual({ open: 0, p0: 0, p1: 0, opportunity: 0 });
  });
});
