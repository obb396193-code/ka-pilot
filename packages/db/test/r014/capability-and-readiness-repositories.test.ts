import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { CapabilityRepository } from "../../src/r014/capability-repository.js";
import { TaskReadinessRepository } from "../../src/r014/task-readiness-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: never[] };
}

describe("R-014 capability and task readiness repositories (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const capabilities = new CapabilityRepository(pool);
  const readiness = new TaskReadinessRepository(pool);
  const workspaces: string[] = [];
  const capabilityKeys = [`r014.query.${randomUUID()}`, `r014.write.${randomUUID()}`];
  let actor: AuthContext;
  let other: AuthContext;
  let task = "";

  async function makeWorkspace(): Promise<AuthContext> {
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
    return { workspaceId, userId, role: "optimizer", workspaceKind: "personal", scope: { kind: "explicit_accounts", accounts: [] } };
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    actor = await makeWorkspace();
    other = await makeWorkspace();
    task = `r014-task-${randomUUID()}`;
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,$2,'synthetic')", [actor.workspaceId, task]);
    await pool.query(
      `INSERT INTO capabilities(key,name,category,form_schema,permission,version,status,executor,media)
       VALUES ($1,'查数：合成','query','{"type":"object"}'::jsonb,'accounts:read','1.0','verified','product_direct','{KUAISHOU}'),
              ($2,'改价：合成','write','{"type":"object"}'::jsonb,'changesets:write','1.0','disabled','runtime','{}')`,
      capabilityKeys,
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM capabilities WHERE key = ANY($1::text[])", [capabilityKeys]);
    for (const workspaceId of workspaces) {
      await pool.query("DELETE FROM task_readiness_overrides WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM tasks WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r014-%'");
    await pool.end();
  });

  describe("capability registry", () => {
    it("reads the global registry and filters by category", async () => {
      const all = await capabilities.list(actor);
      expect(all.map((item) => item.key)).toEqual(expect.arrayContaining(capabilityKeys));
      const queries = await capabilities.list(actor, "query");
      expect(queries.every((item) => item.category === "query")).toBe(true);
      expect(queries.map((item) => item.key)).toContain(capabilityKeys[0]);
      expect(queries.map((item) => item.key)).not.toContain(capabilityKeys[1]);
    });

    it("is global rather than per workspace, and keeps the JSON Schema untouched", async () => {
      const mine = await capabilities.get(actor, capabilityKeys[0]!);
      expect(await capabilities.get(other, capabilityKeys[0]!)).toEqual(mine);
      expect(mine.form_schema).toEqual({ type: "object" });
      expect(mine.media).toEqual(["KUAISHOU"]);
    });

    it("rejects an unknown category and an unknown key", async () => {
      await expect(capabilities.list(actor, "teardown")).rejects.toThrow(/invalid_input/);
      await expect(capabilities.get(actor, "no.such.capability")).rejects.toThrow(/not_found/);
    });
  });

  describe("task readiness overrides", () => {
    it("starts with no overrides so every dimension stays system-derived", async () => {
      expect(await readiness.list(actor, task)).toEqual([]);
    });

    it("records who marked a dimension and when, and upserts on repeat", async () => {
      const first = await readiness.put(actor, task, "strategy", true, "策略已定");
      expect(first).toMatchObject({ dimension: "strategy", ready: true, note: "策略已定", markedBy: actor.userId });
      expect(first.markedAt).not.toBeNull();
      const second = await readiness.put(actor, task, "strategy", false, null);
      expect(second).toMatchObject({ dimension: "strategy", ready: false, note: null });
      expect(await readiness.list(actor, task)).toHaveLength(1);
    });

    it("keeps the six dimensions independent", async () => {
      await readiness.put(actor, task, "products", true);
      expect((await readiness.list(actor, task)).map((row) => row.dimension)).toEqual(["products", "strategy"]);
    });

    it("refuses an unknown dimension instead of storing a seventh", async () => {
      await expect(readiness.put(actor, task, "budget", true)).rejects.toThrow(/invalid_input/);
      expect(await readiness.list(actor, task)).toHaveLength(2);
    });

    it("refuses a task from another workspace", async () => {
      await expect(readiness.put(other, task, "products", true)).rejects.toThrow(/not_found/);
      expect(await readiness.list(other, task)).toEqual([]);
    });
  });
});
