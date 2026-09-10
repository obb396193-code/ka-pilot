import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuthSessionRepository, GuestAccessRepository, runMigrations } from "@ka/db";
import { SessionAuthService } from "../../src/auth/session-auth-service.js";
import { SessionHttpService } from "../../src/auth/session-http.js";

// Synthetic data only. Execute on the explicitly selected isolated test database.
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be_be2check_test";

/**
 * v1.9.6 + v1.9.12 访客登录：演示空间 = `kind='team' + is_demo`，viewer 只读，TTL 2h。
 * 老板要的是「没有 BUC 也能进来看页面」，所以这条路必须真能走通；
 * 同时它是**匿名入口**，几道闸一个都不能松。
 */
describe("guest login (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const guests = new GuestAccessRepository(pool);
  const sessionAuth = new SessionAuthService(new AuthSessionRepository(pool));
  let demoWorkspaceId = "";
  let realWorkspaceId = "";
  let guestIdentityId = "";
  const created: string[] = [];

  /**
   * 每次都造新实例：限速桶是**实例级**的，所以用例之间天然不串。
   * `now` 与 `maxPerWindow` 都注入，窗口由用例自己定——不依赖挂钟、也不靠跑满 20 次真请求。
   */
  const service = (
    enabled: boolean, workspaceId: string | null,
    options: { maxPerWindow?: number; now?: Date } = {},
  ): SessionHttpService =>
    new SessionHttpService(sessionAuth, { authenticate: async () => null }, {
      ...(options.now === undefined ? {} : { now: () => options.now! }),
      guest: {
        enabled, workspaceId,
        findGuestIdentity: (id) => guests.findGuestIdentity(id),
        issueSession: (id, identityId, token, expiresAt) =>
          guests.issueGuestSession(id, identityId, token, expiresAt),
        ...(options.maxPerWindow === undefined ? {} : { maxPerWindow: options.maxPerWindow }),
      },
    });

  async function seedGuest(workspaceId: string): Promise<string> {
    const identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('guest',$1,'访客') RETURNING id",
      [`guest-${randomUUID()}`],
    )).rows[0].id;
    created.push(identityId);
    const userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'访客','viewer') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'viewer',true)",
      [workspaceId, identityId, userId]);
    return identityId;
  }

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    demoWorkspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind,is_demo) VALUES($1,'team',true) RETURNING id", [`demo-${randomUUID()}`],
    )).rows[0].id;
    realWorkspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind,is_demo) VALUES($1,'team',false) RETURNING id", [`real-${randomUUID()}`],
    )).rows[0].id;
    guestIdentityId = await seedGuest(demoWorkspaceId);
    await seedGuest(realWorkspaceId);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM auth_sessions WHERE identity_id = ANY($1::uuid[])", [created]);
    for (const workspaceId of [demoWorkspaceId, realWorkspaceId]) {
      await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
      await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    }
    await pool.query("DELETE FROM auth_identities WHERE id = ANY($1::uuid[])", [created]);
    await pool.end();
  });

  it("pretends the route does not exist while the feature is off", async () => {
    const result = await service(false, demoWorkspaceId).login({ provider: "guest" }, "req-off");
    // 404 而不是 403：功能没开就当这条路不存在，不透露有这么个入口。
    expect(result.status).toBe(404);
  });

  it("signs a guest into the demo workspace as a read-only viewer", async () => {
    const result = await service(true, demoWorkspaceId).login({ provider: "guest" }, "req-on");
    expect(result.status, JSON.stringify(result.body)).toBe(200);
    expect(typeof result.sessionToken).toBe("string");
    // 契约冻的 2 小时，比常规会话短——访客不该长期挂着。
    expect(result.cookieMaxAgeSeconds).toBe(2 * 60 * 60);

    const view = (result.body as {
      data: { identity: Record<string, unknown>; activeWorkspace: Record<string, unknown>; workspaces: unknown[] };
    }).data;
    // v1.9.15 会话 DTO 定形。
    expect(view.identity.provider).toBe("guest");
    expect(view.identity.id).toBe(guestIdentityId);
    // 访客没有密码行 → 恒 false，不该提示他去改一个不存在的密码。
    expect(view.identity.mustChangePassword).toBe(false);
    expect(view.activeWorkspace.id).toBe(demoWorkspaceId);
    expect(view.activeWorkspace.role).toBe("viewer");
    expect(view.activeWorkspace.readOnly).toBe(true);
    expect(view.activeWorkspace.isDemo).toBe(true);
    // 只看得到演示空间那一个：访客不该知道还有别的空间存在。
    expect(view.workspaces).toHaveLength(1);

    expect((await pool.query(
      "SELECT 1 FROM auth_sessions WHERE identity_id=$1 AND revoked_at IS NULL", [guestIdentityId],
    )).rows.length).toBeGreaterThan(0);
  });

  it("refuses a GUEST_WORKSPACE_ID that points at a real team workspace", async () => {
    // 配错一个变量就把匿名会话放进真实空间、看到真账户真消耗——这道闸不能松。
    expect((await service(true, realWorkspaceId).login({ provider: "guest" }, "req-real")).status).toBe(404);
  });

  it("never creates the guest identity on the fly", async () => {
    const bare = (await pool.query(
      "INSERT INTO workspaces(name,kind,is_demo) VALUES($1,'team',true) RETURNING id", [`bare-${randomUUID()}`],
    )).rows[0].id;
    const count = async (): Promise<number> => Number((await pool.query(
      "SELECT count(*)::int AS n FROM auth_identities WHERE provider='guest'")).rows[0].n);
    const before = await count();
    expect((await service(true, bare).login({ provider: "guest" }, "req-bare")).status).toBe(404);
    // 演示空间没灌好就是没灌好；现建身份等于在真库里造一个谁也没审过的可登录主体。
    expect(await count()).toBe(before);
    await pool.query("DELETE FROM workspaces WHERE id=$1", [bare]);
  });

  it("rate-limits guest logins within the hour, per source", async () => {
    // 上限注入成 2、时间钉成一个固定的**将来**时刻：窗口完全由这条用例决定，
    // 跑多少次别的用例都不影响它。（必须是将来——建会话那道闸要求过期时间在当下之后。）
    const guestService = service(true, demoWorkspaceId, {
      maxPerWindow: 2, now: new Date(Date.now() + 60_000),
    });
    for (const attempt of ["one", "two"]) {
      expect((await guestService.login({ provider: "guest" }, `req-${attempt}`, "203.0.113.7")).status).toBe(200);
    }
    expect((await guestService.login({ provider: "guest" }, "req-limited", "203.0.113.7")).status).toBe(403);
    // 换一个来源不受限速——限速是按来源分的。
    expect((await guestService.login({ provider: "guest" }, "req-other", "203.0.113.8")).status).toBe(200);
  });

  it("rejects a body that smuggles extra fields alongside provider:guest", async () => {
    const result = await service(true, demoWorkspaceId)
      .login({ provider: "guest", username: "admin", password: "x" }, "req-smuggle");
    expect(result.status).toBe(400);
  });
});
