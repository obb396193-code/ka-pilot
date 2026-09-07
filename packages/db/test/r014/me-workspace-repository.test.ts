import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EMPTY_READ_STATE, sealMeCounts } from "@ka/domain";
import { runMigrations } from "../../src/migrate.js";
import { MeWorkspaceRepository } from "../../src/r014/me-workspace-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "read" }[] };
}

describe("R-014 me workspace repository (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const me = new MeWorkspaceRepository(pool);
  const workspaces: string[] = [];
  let actor: AuthContext;
  let identityId = "";
  let task = "";

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    const workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`r014-${randomUUID()}`],
    )).rows[0].id;
    workspaces.push(workspaceId);
    identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
      [`r014-${randomUUID()}`],
    )).rows[0].id;
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'synthetic','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identityId, userId],
    );
    for (const accountId of ["r014-m1", "r014-m2"]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2)", [workspaceId, accountId]);
      await pool.query(
        "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU',$3,'read')",
        [workspaceId, identityId, accountId],
      );
    }
    task = `r014-task-${randomUUID()}`;
    await pool.query(
      "INSERT INTO tasks(workspace_id,task_id,task_name,owner_user_id) VALUES($1,$2,'我负责的',$3)",
      [workspaceId, task, userId],
    );
    const otherTask = `r014-task-${randomUUID()}`;
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,$2,'别人的')", [workspaceId, otherTask]);
    await pool.query(
      "INSERT INTO task_accounts(workspace_id,task_id,media,account_id,valid_from) VALUES($1,$2,'KUAISHOU','r014-m1','2026-09-01')",
      [workspaceId, otherTask],
    );
    for (const [severity, status] of [["P0", "open"], ["P1", "open"], ["P1", "processing"], ["opportunity", "open"], ["P2", "done"]]) {
      await pool.query(
        `INSERT INTO work_items(workspace_id,type,severity,title,status,media,account_id,created_at)
         VALUES($1,'diagnosis',$2,'合成工作项',$3,'KUAISHOU','r014-m1',now())`,
        [workspaceId, severity, status],
      );
    }
    await pool.query(
      "INSERT INTO workflow_runs(workspace_id,version_id,status) VALUES($1,$2,'waiting_confirmation')",
      [workspaceId, randomUUID()],
    );
    await pool.query(
      `INSERT INTO changesets(workspace_id,media,account_id,initiator,credential_owner_user_id,status)
       VALUES($1,'KUAISHOU','r014-m1',$2,$2,'draft')`, [workspaceId, userId],
    );
    await pool.query(
      `INSERT INTO user_watchlists(workspace_id,user_id,items) VALUES($1,$2,$3::jsonb)`,
      [workspaceId, userId, JSON.stringify([
        { type: "account", media: "KUAISHOU", accountId: "r014-m1" },
        { type: "task", taskId: task },
      ])],
    );
    actor = {
      workspaceId, userId, role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId: "r014-m1", accessLevel: "read" }] },
    };
  });

  afterAll(async () => {
    for (const workspaceId of workspaces) {
      for (const table of ["user_watchlists", "changesets", "workflow_runs", "work_items", "task_accounts", "tasks",
        "account_access_grants", "accounts", "identity_preferences"]) {
        if (table === "identity_preferences") continue;
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
      }
      await pool.query("DELETE FROM identity_preferences WHERE identity_id=$1", [identityId]);
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r014-%'");
    await pool.end();
  });

  it("counts active work items by severity, excluding closed ones", async () => {
    const parts = await me.countsParts(actor, EMPTY_READ_STATE);
    expect(parts.workItems).toEqual({ open: 4, p0: 1, p1: 2, opportunity: 1 });
    expect(parts.runsWaitingConfirmation).toBe(1);
    expect(parts.changesetsDraft).toBe(1);
  });

  it("reports approvals and dispatches as null while migration 014 has not landed — never as zero", async () => {
    const parts = await me.countsParts(actor, EMPTY_READ_STATE);
    expect(parts.approvalsToApprove).toBeNull();
    expect(parts.dispatchesReceived).toBeNull();
    // 未读数依赖 approvals/dispatches 两个投影源，源不齐时同样是 null，不给偏小的数字。
    expect(parts.notificationsUnread).toBeNull();
    const sealed = sealMeCounts(parts);
    expect(sealed.complete).toBe(false);
    expect(sealed.complete === false && sealed.missing)
      .toEqual(["approvalsToApprove", "dispatchesReceived", "notificationsUnread"]);
  });

  it("projects notifications from the sources that do exist and names the ones that do not", async () => {
    const sources = await me.notificationSources(actor);
    expect(sources.unavailable).toEqual(["approvals", "dispatches"]);
    expect(sources.candidates.filter((c) => c.kind === "alert")).toHaveLength(4);
    expect(sources.candidates.filter((c) => c.kind === "run")).toHaveLength(1);
    expect(sources.candidates.map((c) => c.severity)).toEqual(expect.arrayContaining(["p0", "p1", "warning"]));
    expect(sources.candidates.every((c) => c.href.startsWith("/"))).toBe(true);
  });

  it("separates owned from participating tasks and counts watched accounts only", async () => {
    const workload = await me.workloadParts(actor);
    expect(workload.tasks).toEqual({ owned: 1, participating: 1 });
    expect(workload.accounts).toEqual({ owned: 2, watching: 1 });
    expect(workload.pending.workItems).toBe(4);
    expect(workload.pending.runsWaitingConfirmation).toBe(1);
  });

  it("leaves the on-call roster null instead of claiming nobody is on duty", async () => {
    const workload = await me.workloadParts(actor);
    expect(workload.oncall).toBeNull();
    expect(workload.pending.approvals).toBeNull();
    expect(workload.pending.dispatches).toBeNull();
  });

  it("reads the notification watermark out of identity preferences and survives a corrupt one", async () => {
    expect(await me.readState(identityId)).toEqual(EMPTY_READ_STATE);
    await pool.query(
      `INSERT INTO identity_preferences(identity_id,preferences) VALUES($1,$2::jsonb)
       ON CONFLICT (identity_id) DO UPDATE SET preferences=EXCLUDED.preferences`,
      [identityId, JSON.stringify({ notificationsReadAt: "2026-09-05T08:00:00.000+08:00", notificationsReadIds: ["x"] })],
    );
    expect(await me.readState(identityId)).toEqual({
      notificationsReadAt: "2026-09-05T08:00:00.000+08:00", notificationsReadIds: ["x"],
    });
    await pool.query("UPDATE identity_preferences SET preferences='{\"notificationsReadAt\":42}'::jsonb WHERE identity_id=$1", [identityId]);
    expect(await me.readState(identityId)).toEqual(EMPTY_READ_STATE);
  });
});
