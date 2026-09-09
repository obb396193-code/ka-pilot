import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_DECISION_POLICY } from "@ka/domain";
import { runMigrations } from "../../src/migrate.js";
import { DecisionPolicyRepository } from "../../src/r014/decision-policy-repository.js";
import { ExportRepository } from "../../src/r014/export-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

type Role = "optimizer" | "lead" | "admin";
interface AuthContext {
  workspaceId: string; userId: string; role: Role; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: never[] };
}

describe("R-014 decision policy and export repositories (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const policies = new DecisionPolicyRepository(pool);
  const exports_ = new ExportRepository(pool);
  const workspaces: string[] = [];
  let lead: AuthContext;
  let optimizer: AuthContext;
  let otherWorkspace: AuthContext;

  async function makeWorkspace(roles: Role[]): Promise<AuthContext[]> {
    const workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`r014-${randomUUID()}`],
    )).rows[0].id;
    workspaces.push(workspaceId);
    const contexts: AuthContext[] = [];
    for (const role of roles) {
      const identityId = (await pool.query(
        "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'synthetic') RETURNING id",
        [`r014-${randomUUID()}`],
      )).rows[0].id;
      const userId = (await pool.query(
        "INSERT INTO users(workspace_id,name,role) VALUES($1,$2,$3) RETURNING id", [workspaceId, `synthetic-${role}`, role],
      )).rows[0].id;
      await pool.query(
        "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,$4,true)",
        [workspaceId, identityId, userId, role],
      );
      contexts.push({ workspaceId, userId, role, workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } });
    }
    return contexts;
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    [lead, optimizer] = await makeWorkspace(["lead", "optimizer"]) as [AuthContext, AuthContext];
    [otherWorkspace] = await makeWorkspace(["lead"]) as [AuthContext];
  });

  afterAll(async () => {
    for (const workspaceId of workspaces) {
      for (const table of ["exports", "decision_policies"]) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
      }
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r014-%'");
    await pool.end();
  });

  describe("decision policy", () => {
    it("returns the conservative default without creating a row", async () => {
      expect(await policies.get(lead)).toEqual({ policy: DEFAULT_DECISION_POLICY, updatedBy: null, updatedAt: null });
      expect((await pool.query("SELECT count(*)::int AS n FROM decision_policies WHERE workspace_id=$1", [lead.workspaceId])).rows[0].n).toBe(0);
    });

    it("lets a lead set thresholds and records who changed them", async () => {
      const saved = await policies.put(lead, { ...DEFAULT_DECISION_POLICY, dailyCapCny: 5000 });
      expect(saved.policy.dailyCapCny).toBe(5000);
      expect(saved.updatedBy).toEqual({ userId: lead.userId, name: "synthetic-lead" });
      expect(saved.updatedAt).not.toBeNull();
      expect((await policies.get(optimizer)).policy.dailyCapCny).toBe(5000);
    });

    it("refuses a write from an optimizer, who could otherwise raise their own auto-execution cap", async () => {
      await expect(policies.put(optimizer, { ...DEFAULT_DECISION_POLICY, dailyCapCny: 999999 })).rejects.toThrow(/forbidden/);
      expect((await policies.get(lead)).policy.dailyCapCny).toBe(5000);
    });

    it("rejects out-of-range thresholds and keeps workspaces isolated", async () => {
      await expect(policies.put(lead, { ...DEFAULT_DECISION_POLICY, confidenceMin: 2 })).rejects.toThrow(/invalid_input/);
      expect(await policies.get(otherWorkspace)).toEqual({ policy: DEFAULT_DECISION_POLICY, updatedBy: null, updatedAt: null });
    });

    it("falls back to the default when the stored threshold document is unusable", async () => {
      await pool.query("UPDATE decision_policies SET policy='{\"confidenceMin\":5}'::jsonb WHERE workspace_id=$1", [lead.workspaceId]);
      const recovered = await policies.get(lead);
      expect(recovered.policy).toEqual(DEFAULT_DECISION_POLICY);
      expect(recovered.updatedAt).not.toBeNull();
    });
  });

  describe("exports", () => {
    it("queues an export and returns only the four receipt fields", async () => {
      const queued = await exports_.create(lead, {
        kind: "query", ref: { queryId: "account.summary", params: { window: "today" } }, format: "xlsx",
      });
      expect(Object.keys(queued).sort()).toEqual(["exportId", "format", "kind", "status"]);
      expect(queued.status).toBe("queued");
      const record = await exports_.get(lead, queued.exportId);
      expect(record).toMatchObject({ status: "queued", fileRef: null, bytes: null, error: null, fileExpired: false });
    });

    it("refuses a ref that does not match its kind", async () => {
      await expect(exports_.create(lead, { kind: "view", ref: { queryId: "q", params: {} }, format: "xlsx" } as never))
        .rejects.toThrow(/invalid_input/);
    });

    it("hides another user's export behind NOT_FOUND", async () => {
      const queued = await exports_.create(lead, { kind: "report", ref: { reportConfigId: randomUUID() }, format: "pdf" });
      await expect(exports_.get(optimizer, queued.exportId)).rejects.toThrow(/not_found/);
      await expect(exports_.get(otherWorkspace, queued.exportId)).rejects.toThrow(/not_found/);
    });

    it("reports an expired signed file instead of handing back a dead link", async () => {
      const queued = await exports_.create(lead, { kind: "query", ref: { queryId: "q", params: {} }, format: "png" });
      await pool.query(
        `UPDATE exports SET status='done', file_ref='blob://x', bytes=184320,
           expires_at=now() - interval '1 minute' WHERE id=$1`, [queued.exportId],
      );
      const record = await exports_.get(lead, queued.exportId);
      expect(record).toMatchObject({ status: "done", fileRef: "blob://x", bytes: 184320, fileExpired: true });
      await pool.query("UPDATE exports SET expires_at=now() + interval '10 minutes' WHERE id=$1", [queued.exportId]);
      expect((await exports_.get(lead, queued.exportId)).fileExpired).toBe(false);
    });

    it("never invents a signed URL in the storage layer", async () => {
      const queued = await exports_.create(lead, { kind: "query", ref: { queryId: "q", params: {} }, format: "xlsx" });
      const record = await exports_.get(lead, queued.exportId);
      expect(Object.keys(record)).not.toContain("url");
      expect(JSON.stringify(record)).not.toMatch(/https?:\/\//);
    });
  });
});
