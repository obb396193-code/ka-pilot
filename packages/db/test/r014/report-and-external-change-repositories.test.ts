import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { ExternalChangeRepository } from "../../src/r014/external-change-repository.js";
import { ReportRunRepository } from "../../src/r014/report-run-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "read" }[] };
}

describe("R-014 report run and external change repositories (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const runs = new ReportRunRepository(pool);
  const changes = new ExternalChangeRepository(pool);
  const workspaces: string[] = [];
  let actor: AuthContext;
  let other: AuthContext;

  async function makeWorkspace(accountId: string): Promise<AuthContext> {
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
    await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2)", [workspaceId, accountId]);
    await pool.query(
      "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU',$3,'read')",
      [workspaceId, identityId, accountId],
    );
    return {
      workspaceId, userId, role: "optimizer", workspaceKind: "personal",
      scope: { kind: "explicit_accounts", accounts: [{ media: "KUAISHOU", accountId, accessLevel: "read" }] },
    };
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    actor = await makeWorkspace("r014-a1");
    other = await makeWorkspace("r014-b1");
  });

  afterAll(async () => {
    for (const workspaceId of workspaces) {
      for (const table of ["external_changes", "report_runs", "account_access_grants", "accounts"]) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
      }
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r014-%'");
    await pool.end();
  });

  describe("report runs", () => {
    const ref = { date: "2026-09-05" };

    it("is idempotent per workspace, user, kind and ref — one brief per person per day", async () => {
      const first = await runs.start({ workspaceId: actor.workspaceId, userId: actor.userId, kind: "daily_brief", ref }, "pending_data");
      const again = await runs.start({ workspaceId: actor.workspaceId, userId: actor.userId, kind: "daily_brief", ref }, "running");
      expect(again.runId).toBe(first.runId);
      // 重复触发不许把已有那条的状态改掉，更不许生成第二份。
      expect(again.status).toBe("pending_data");
      expect((await pool.query(
        "SELECT count(*)::int AS n FROM report_runs WHERE workspace_id=$1 AND kind='daily_brief'", [actor.workspaceId],
      )).rows[0].n).toBe(1);
    });

    it("keeps a pending run empty and only fills provenance when it finishes", async () => {
      const run = await runs.findForUser(actor, "daily_brief", ref);
      expect(run).toMatchObject({ status: "pending_data", dataAsOf: null, outputRef: null, finishedAt: null });
      const finished = await runs.finish(actor.workspaceId, run!.runId, {
        status: "ready", dataAsOf: "2026-09-05T03:20:00.000+08:00", outputRef: "blob://brief",
      });
      expect(finished).toMatchObject({ status: "ready", outputRef: "blob://brief" });
      expect(finished.finishedAt).not.toBeNull();
    });

    it("refuses to rewrite a run that already finished", async () => {
      const run = (await runs.findForUser(actor, "daily_brief", ref))!;
      await expect(runs.finish(actor.workspaceId, run.runId, { status: "failed", error: "改写试试" }))
        .rejects.toThrow(/not_found/);
      expect((await runs.findForUser(actor, "daily_brief", ref))!.status).toBe("ready");
    });

    it("does not leak another workspace's run", async () => {
      expect(await runs.findForUser(other, "daily_brief", ref)).toBeNull();
    });

    it("rejects a scheduled ref that points at both a view and a report config", async () => {
      await expect(runs.start({
        workspaceId: actor.workspaceId, userId: actor.userId, kind: "report_schedule",
        ref: { subscriptionId: randomUUID(), viewId: randomUUID(), reportConfigId: randomUUID() } as never,
      }, "running")).rejects.toThrow(/invalid_input/);
    });
  });

  describe("external changes", () => {
    it("records a detected background edit and renders it onto the timeline", async () => {
      await changes.record({
        workspaceId: actor.workspaceId, media: "KUAISHOU", accountId: "r014-a1",
        targetType: "campaign", targetId: "c-1", field: "budget",
        fromValue: 8000, toValue: 10000, syncRunId: null,
      });
      const timeline = await changes.listForTimeline(actor, "KUAISHOU", "r014-a1");
      expect(timeline.items).toHaveLength(1);
      expect(timeline.items[0]).toMatchObject({
        kind: "external_change", actor: "external",
        summary: "后台手动：计划日预算 8000→10000",
        detail: { target_type: "campaign", target_id: "c-1", field: "budget" },
      });
      expect(timeline.nextCursor).toBeNull();
    });

    it("stores a missing old value as null rather than guessing one", async () => {
      await changes.record({
        workspaceId: actor.workspaceId, media: "KUAISHOU", accountId: "r014-a1",
        targetType: "unit", targetId: "u-1", field: "status",
        fromValue: null, toValue: "paused", syncRunId: null,
      });
      const timeline = await changes.listForTimeline(actor, "KUAISHOU", "r014-a1");
      expect(timeline.items[0]!.summary).toBe("后台手动：单元状态 改为 paused");
    });

    it("pages newest first with a monotonic cursor", async () => {
      const page = await changes.listForTimeline(actor, "KUAISHOU", "r014-a1", { limit: 1 });
      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).not.toBeNull();
      const next = await changes.listForTimeline(actor, "KUAISHOU", "r014-a1", { limit: 1, cursor: page.nextCursor! });
      expect(next.items).toHaveLength(1);
      expect(next.items[0]!.ref.id).not.toBe(page.items[0]!.ref.id);
      expect(next.nextCursor).toBeNull();
    });

    it("refuses an account the caller has no grant for", async () => {
      await expect(changes.listForTimeline(other, "KUAISHOU", "r014-a1")).rejects.toThrow(/forbidden/);
      await expect(changes.listForTimeline(actor, "KUAISHOU", "r014-b1")).rejects.toThrow(/forbidden/);
    });

    it("refuses a field outside the four the contract names", async () => {
      await expect(changes.record({
        workspaceId: actor.workspaceId, media: "KUAISHOU", accountId: "r014-a1",
        targetType: "campaign", targetId: "c-1", field: "targeting" as never,
        fromValue: null, toValue: null, syncRunId: null,
      })).rejects.toThrow(/invalid_input/);
    });
  });
});
