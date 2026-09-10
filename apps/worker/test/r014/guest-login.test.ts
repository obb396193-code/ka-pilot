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

  const service = (enabled: boolean, workspaceId: string | null): SessionHttpService =>
    new SessionHttpService(sessionAuth, { authenticate: async () => null }, {
      guest: {
        enabled, workspaceId,
        findGuestIdentity: (id) => guests.findGuestIdentity(id),
        issueSession: (id, identityId, token, expiresAt) =>
          guests.issueGuestSession(id, identityId, token, expiresAt),
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

  it("★creates the guest session row but cannot resolve it yet: the personal-workspace invariant blocks it", async () => {
    const result = await service(true, demoWorkspaceId).login({ provider: "guest" }, "req-on");

    // 会话行本身建出来了——建会话这条路（我自己的仓储）是通的。
    // 读不回来时 login 会顺手 logout 把它回收掉，所以这里不看 revoked_at，只看行在过。
    expect((await pool.query(
      "SELECT 1 FROM auth_sessions WHERE identity_id=$1", [guestIdentityId],
    )).rows.length).toBeGreaterThan(0);

    // ★但读回来被拒：`packages/domain/src/auth-context.ts` 要求**每个会话的身份必须
    // 有且仅有一个 personal 空间**（`uniquePersonalWorkspaces.size === 0 → 403
    // PERSONAL_WORKSPACE_MISSING`），这一关排在 team 分支之前。访客一个个人空间都没有。
    //
    // 这不是 v1.9.12 那个 `demo` 枚举的问题（那个已绕开），是更深一层的鉴权不变量，
    // 在共享契约文件里。放宽它等于改整个鉴权模型的前提，已回抛 arch（Q-032）。
    // 在他裁决之前，这条用例把阻断钉在这里——绿的是「现状如实」，不是「功能已完成」。
    expect(result.status).toBe(403);
    expect((result.body as { error: { code: string } }).error.code).toBe("FORBIDDEN");
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
    const guestService = service(true, demoWorkspaceId);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await guestService.login({ provider: "guest" }, `req-burst-${attempt}`, "203.0.113.7");
    }
    // 第 21 次被限速挡下。注意此时**未被限速的请求也是 403**（上面那条不变量），
    // 所以单看状态码分不出「限速了」和「读不回来」——用会话行数来区分。
    const before = Number((await pool.query(
      "SELECT count(*)::int AS n FROM auth_sessions WHERE identity_id=$1", [guestIdentityId])).rows[0].n);
    await guestService.login({ provider: "guest" }, "req-limited", "203.0.113.7");
    expect(Number((await pool.query(
      "SELECT count(*)::int AS n FROM auth_sessions WHERE identity_id=$1", [guestIdentityId])).rows[0].n),
    "被限速的请求不该再建会话行").toBe(before);

    // 换一个来源不受限速：会照常建出会话行（虽然读回仍被不变量挡住）。
    await guestService.login({ provider: "guest" }, "req-other", "203.0.113.8");
    expect(Number((await pool.query(
      "SELECT count(*)::int AS n FROM auth_sessions WHERE identity_id=$1", [guestIdentityId])).rows[0].n))
      .toBe(before + 1);
  });

  it("rejects a body that smuggles extra fields alongside provider:guest", async () => {
    const result = await service(true, demoWorkspaceId)
      .login({ provider: "guest", username: "admin", password: "x" }, "req-smuggle");
    expect(result.status).toBe(400);
  });
});
