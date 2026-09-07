import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { IdentityPreferencesRepository } from "../../src/r014/identity-preferences-repository.js";
import { SavedViewRepository } from "../../src/r014/saved-view-repository.js";
import { UserWatchlistRepository } from "../../src/r014/user-watchlist-repository.js";
import { R014RepositoryError } from "../../src/r014/workspace-authority.js";

// Synthetic data only. Execute on the explicitly selected isolated test database (ka_be2_r014_test).
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be2_r014_test";

interface AuthContext {
  workspaceId: string; userId: string; role: "optimizer"; workspaceKind: "personal";
  scope: { kind: "explicit_accounts"; accounts: { media: string; accountId: string; accessLevel: "read" }[] };
}
// approvedWorkspaceAuthContextSchema 是 strict 的：auth 上下文只许带这五个键，
// identityId 另存，不能混进去（混进去会被整个拒成 FORBIDDEN）。
interface Actor { auth: AuthContext; identityId: string; workspaceId: string }

describe("R-014 personal workspace repositories (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const preferences = new IdentityPreferencesRepository(pool);
  const watchlists = new UserWatchlistRepository(pool);
  const views = new SavedViewRepository(pool);
  const created: string[] = [];
  let actor: Actor;
  let other: Actor;
  let task = "";

  async function makeActor(accounts: string[]): Promise<Actor> {
    const workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`r014-${randomUUID()}`],
    )).rows[0].id;
    created.push(workspaceId);
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
    for (const accountId of accounts) {
      await pool.query("INSERT INTO accounts(workspace_id,media,account_id) VALUES($1,'KUAISHOU',$2)", [workspaceId, accountId]);
      await pool.query(
        "INSERT INTO account_access_grants(workspace_id,identity_id,media,account_id,access_level) VALUES($1,$2,'KUAISHOU',$3,'read')",
        [workspaceId, identityId, accountId],
      );
    }
    return {
      identityId, workspaceId,
      auth: {
        workspaceId, userId, role: "optimizer", workspaceKind: "personal",
        scope: { kind: "explicit_accounts", accounts: accounts.map((accountId) => ({ media: "KUAISHOU", accountId, accessLevel: "read" as const })) },
      },
    };
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    actor = await makeActor(["r014-a1", "r014-a2"]);
    other = await makeActor(["r014-b1"]);
    task = `r014-task-${randomUUID()}`;
    await pool.query("INSERT INTO tasks(workspace_id,task_id,task_name) VALUES($1,$2,'synthetic')", [actor.workspaceId, task]);
  });

  afterAll(async () => {
    for (const workspaceId of created) {
      for (const table of ["saved_views", "user_watchlists", "tasks", "account_access_grants", "accounts"]) {
        await pool.query(`DELETE FROM ${table} WHERE workspace_id=$1`, [workspaceId]);
      }
      await pool.query(
        "DELETE FROM identity_preferences WHERE identity_id IN (SELECT identity_id FROM workspace_memberships WHERE workspace_id=$1)",
        [workspaceId],
      );
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE display_name='synthetic' AND provider_subject LIKE 'r014-%'");
    await pool.end();
  });

  describe("identity preferences", () => {
    it("returns the bw default without writing a row and without inventing a hue", async () => {
      expect(await preferences.get(actor.identityId)).toEqual({ theme: { mode: "bw" }, locale: null, updatedAt: null });
      expect((await pool.query("SELECT count(*)::int AS n FROM identity_preferences WHERE identity_id=$1", [actor.identityId])).rows[0].n).toBe(0);
    });

    it("patches only the supplied fields and keeps the identity's row across workspaces", async () => {
      const first = await preferences.patch(actor.identityId, { theme: { mode: "full", hue: "#112233" } });
      expect(first.theme).toEqual({ mode: "full", hue: "#112233" });
      expect(first.locale).toBeNull();
      expect(first.updatedAt).not.toBeNull();
      const second = await preferences.patch(actor.identityId, { locale: "zh-CN" });
      expect(second).toMatchObject({ theme: { mode: "full", hue: "#112233" }, locale: "zh-CN" });
      expect((await preferences.get(actor.identityId)).locale).toBe("zh-CN");
      expect((await pool.query("SELECT count(*)::int AS n FROM identity_preferences WHERE identity_id=$1", [actor.identityId])).rows[0].n).toBe(1);
    });

    it("refuses a deactivated identity and rejects malformed input", async () => {
      await pool.query("UPDATE auth_identities SET is_active=false WHERE id=$1", [other.identityId]);
      await expect(preferences.patch(other.identityId, { locale: "en-US" })).rejects.toThrow(R014RepositoryError);
      await pool.query("UPDATE auth_identities SET is_active=true WHERE id=$1", [other.identityId]);
      await expect(preferences.patch(actor.identityId, {} as never)).rejects.toThrow(/invalid_input/);
      await expect(preferences.patch("not-a-uuid", { locale: "en-US" })).rejects.toThrow(/invalid_input/);
    });

    it("falls back to the default when the stored JSONB is not a valid preference document", async () => {
      await pool.query("UPDATE identity_preferences SET preferences='{\"theme\":{\"mode\":\"neon\"}}'::jsonb WHERE identity_id=$1", [actor.identityId]);
      const recovered = await preferences.get(actor.identityId);
      expect(recovered.theme).toEqual({ mode: "bw" });
      expect(recovered.updatedAt).not.toBeNull();
      await preferences.patch(actor.identityId, { theme: { mode: "full", hue: "#112233" } });
    });
  });

  describe("watchlist", () => {
    it("starts empty and stores account and task items together", async () => {
      expect(await watchlists.get(actor.auth)).toEqual({ items: [], updatedAt: null });
      const saved = await watchlists.put(actor.auth, [
        { type: "account", media: "KUAISHOU", accountId: "r014-a1" },
        { type: "task", taskId: task },
      ]);
      expect(saved.items).toEqual([
        { type: "account", media: "KUAISHOU", accountId: "r014-a1" },
        { type: "task", taskId: task },
      ]);
      expect(saved.updatedAt).not.toBeNull();
    });

    it("accepts legacy items without a type and dedupes them", async () => {
      const saved = await watchlists.put(actor.auth, [
        { media: "KUAISHOU", accountId: "r014-a2" },
        { type: "account", media: "KUAISHOU", accountId: "r014-a2" },
      ]);
      expect(saved.items).toEqual([{ type: "account", media: "KUAISHOU", accountId: "r014-a2" }]);
    });

    it("refuses accounts the caller has no live grant for, and tasks from another workspace", async () => {
      await expect(watchlists.put(actor.auth, [{ type: "account", media: "KUAISHOU", accountId: "r014-b1" }]))
        .rejects.toThrow(/forbidden/);
      await expect(watchlists.put(other.auth, [{ type: "task", taskId: task }])).rejects.toThrow(/forbidden/);
      // 拒绝是整批拒绝：合法项也不许偷偷存进去。
      expect((await watchlists.get(actor.auth)).items).toEqual([{ type: "account", media: "KUAISHOU", accountId: "r014-a2" }]);
    });

    it("refuses a revoked membership even though the session snapshot still says optimizer", async () => {
      await pool.query("UPDATE workspace_memberships SET is_active=false WHERE workspace_id=$1", [actor.workspaceId]);
      await expect(watchlists.put(actor.auth, [])).rejects.toThrow(/forbidden/);
      await pool.query("UPDATE workspace_memberships SET is_active=true WHERE workspace_id=$1", [actor.workspaceId]);
    });

    it("rejects malformed items instead of silently dropping them", async () => {
      await expect(watchlists.put(actor.auth, [{ type: "campaign", id: "c" }])).rejects.toThrow(/invalid_input/);
      await expect(watchlists.put(actor.auth, [{ type: "task" }])).rejects.toThrow(/invalid_input/);
    });
  });

  describe("saved views", () => {
    const config = { version: "view/v1" as const, columns: ["accountName", "cost"] };

    it("creates, lists by page and updates only the supplied fields", async () => {
      const view = await views.create(actor.auth, { page: "data.table", name: "我的日常总表", config });
      expect(view.isShared).toBe(false);
      expect(view.config).toEqual(config);
      await views.create(actor.auth, { page: "accounts", name: "备用户", config, isShared: true });
      expect((await views.list(actor.auth)).map((row) => row.page).sort()).toEqual(["accounts", "data.table"]);
      expect((await views.list(actor.auth, "accounts")).map((row) => row.name)).toEqual(["备用户"]);
      const patched = await views.patch(actor.auth, view.id, { isShared: true });
      expect(patched).toMatchObject({ id: view.id, name: "我的日常总表", isShared: true, config });
    });

    it("refuses a duplicate name on the same page instead of overwriting", async () => {
      await expect(views.create(actor.auth, { page: "data.table", name: "我的日常总表", config }))
        .rejects.toThrow(/conflict/);
    });

    it("hides another user's views behind NOT_FOUND for read, write and delete", async () => {
      const mine = (await views.list(actor.auth))[0]!;
      expect(await views.list(other.auth)).toEqual([]);
      await expect(views.patch(other.auth, mine.id, { isShared: false })).rejects.toThrow(/not_found/);
      await expect(views.remove(other.auth, mine.id)).rejects.toThrow(/not_found/);
      expect((await views.list(actor.auth)).some((row) => row.id === mine.id)).toBe(true);
    });

    it("deletes only the caller's own view", async () => {
      const before = await views.list(actor.auth);
      await views.remove(actor.auth, before[0]!.id);
      expect((await views.list(actor.auth)).map((row) => row.id)).toEqual(before.slice(1).map((row) => row.id));
      await expect(views.remove(actor.auth, before[0]!.id)).rejects.toThrow(/not_found/);
    });

    it("rejects an unknown page and a malformed config version", async () => {
      await expect(views.create(actor.auth, { page: "materials", name: "x", config } as never)).rejects.toThrow(/invalid_input/);
      await expect(views.create(actor.auth, { page: "tasks", name: "x", config: { version: "view/v2" } } as never))
        .rejects.toThrow(/invalid_input/);
      await expect(views.list(actor.auth, "materials")).rejects.toThrow(/invalid_input/);
    });
  });
});
