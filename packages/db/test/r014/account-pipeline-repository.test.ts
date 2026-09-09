import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POOL_STATUS_ORDER } from "@ka/domain";
import { runMigrations } from "../../src/migrate.js";
import { AccountPipelineRepository } from "../../src/r014/account-pipeline-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "read" }[] };
}

describe("R-014 account pipeline repository (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const pipelines = new AccountPipelineRepository(pool);
  const workspaces: string[] = [];
  let actor: AuthContext;
  let other: AuthContext;
  let ungrantedAccount = "";

  async function makeWorkspace(granted: string[], ungranted: string[] = []): Promise<AuthContext> {
    const workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`r014-${randomUUID()}`],
    )).rows[0].id;
    workspaces.push(workspaceId);
    const identityId = (await pool.query(
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
    for (const accountId of [...granted, ...ungranted]) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2)", [workspaceId, accountId]);
    }
    for (const accountId of granted) {
      await pool.query(
        "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU',$3,'read')",
        [workspaceId, identityId, accountId],
      );
    }
    return {
      workspaceId, userId, role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: granted.map((accountId) => ({ media: "KUAISHOU", accountId, accessLevel: "read" as const })) },
    };
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    ungrantedAccount = "r014-p-nogrant";
    actor = await makeWorkspace(["r014-p1", "r014-p2", "r014-p3"], [ungrantedAccount]);
    other = await makeWorkspace(["r014-q1"]);
    await pool.query(
      "UPDATE accounts SET pool_status='in_delivery' WHERE workspace_id=$1 AND account_id IN ('r014-p1','r014-p2')",
      [actor.workspaceId],
    );
    await pool.query("UPDATE accounts SET pool_status='closed' WHERE workspace_id=$1 AND account_id=$2", [actor.workspaceId, ungrantedAccount]);
  });

  afterAll(async () => {
    for (const workspaceId of workspaces) {
      await pool.query("DELETE FROM account_access_grants WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM accounts WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r014-%'");
    await pool.end();
  });

  it("counts only the accounts the caller actually has a grant for", async () => {
    const pipeline = await pipelines.pipeline(actor);
    expect(pipeline.stages).toHaveLength(POOL_STATUS_ORDER.length);
    const byStatus = Object.fromEntries(pipeline.stages.map((stage) => [stage.poolStatus, stage.count]));
    expect(byStatus.in_delivery).toBe(2);
    expect(byStatus.available).toBe(1);
    // 未授权的那户是 closed，不该出现在计数里。
    expect(byStatus.closed).toBe(0);
  });

  it("reports deltaVsYesterday as missing rather than zero, because no history exists", async () => {
    const pipeline = await pipelines.pipeline(actor);
    for (const stage of pipeline.stages) {
      expect(stage.deltaVsYesterday).toEqual({ value: null, availability: "missing" });
    }
  });

  it("keeps workspaces isolated and filters by media", async () => {
    const theirs = await pipelines.pipeline(other);
    expect(theirs.stages.reduce((sum, stage) => sum + stage.count, 0)).toBe(1);
    expect((await pipelines.pipeline(actor, "DOUYIN")).stages.every((stage) => stage.count === 0)).toBe(true);
    await expect(pipelines.pipeline(actor, "not a media")).rejects.toThrow(/invalid_input/);
  });

  it("records a manual override and stops attributing the state to the system", async () => {
    const overridden = await pipelines.overridePoolStatus(actor, "KUAISHOU", "r014-p3", "abnormal");
    expect(overridden).toMatchObject({ poolStatus: "abnormal", poolStatusSource: "manual" });
    expect(overridden.poolStatusChangedAt).not.toBeNull();
    expect((await pool.query(
      "SELECT pool_status_overridden_by FROM accounts WHERE workspace_id=$1 AND account_id='r014-p3'", [actor.workspaceId],
    )).rows[0].pool_status_overridden_by).toBe(actor.userId);
    const byStatus = Object.fromEntries((await pipelines.pipeline(actor)).stages.map((s) => [s.poolStatus, s.count]));
    expect(byStatus.abnormal).toBe(1);
  });

  it("clears the override back to system without inventing a new state", async () => {
    const cleared = await pipelines.clearPoolStatusOverride(actor, "KUAISHOU", "r014-p3");
    // 清除只是把标记复位，状态值留给系统推导，不在这里改成别的态。
    expect(cleared).toMatchObject({ poolStatus: "abnormal", poolStatusSource: "system" });
    expect((await pool.query(
      "SELECT pool_status_overridden_by FROM accounts WHERE workspace_id=$1 AND account_id='r014-p3'", [actor.workspaceId],
    )).rows[0].pool_status_overridden_by).toBeNull();
  });

  it("refuses an ungranted account, another workspace's account and an unknown state", async () => {
    await expect(pipelines.overridePoolStatus(actor, "KUAISHOU", ungrantedAccount, "paused")).rejects.toThrow(/forbidden/);
    await expect(pipelines.overridePoolStatus(other, "KUAISHOU", "r014-p1", "paused")).rejects.toThrow(/forbidden/);
    await expect(pipelines.overridePoolStatus(actor, "KUAISHOU", "r014-p1", "delivering")).rejects.toThrow(/invalid_input/);
  });
});
