import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { AuthSessionRepository } from "../../src/auth-repository.js";
import { IdentityPasswordRepository } from "../../src/identity-password-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database.
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be_be2check_test";

/**
 * `mustChangePassword` 现在有**两处实现**：仓储方法（给 Codex 的 members 端点复用）
 * 与会话视图里的内联 SQL。两处分头写正是我前面反复揪出的那类根因——
 * 这里把它们对同一份数据的结论钉在一起，谁改歪了都会红。
 *
 * 规则：有密码行、且最后一次改的人不是本人 → true。
 * 管理员开户写的是管理员 id；本人自助改密写自己的 id；buc/guest 没有密码行 → false。
 */
describe("mustChangePassword agrees across both implementations (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const passwords = new IdentityPasswordRepository(pool);
  const sessions = new AuthSessionRepository(pool);
  let workspaceId = "";
  let identityId = "";
  let userId = "";
  let adminUserId = "";
  let token = "";

  const hashOf = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");

  const viaSession = async (): Promise<boolean> => {
    const view = await sessions.readSessionView(hashOf(token), new Date());
    if (view.status !== "approved") throw new Error(`session not approved: ${JSON.stringify(view)}`);
    return view.view.identity.mustChangePassword;
  };

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`mcp-${randomUUID()}`],
    )).rows[0].id;
    identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'合成用户') RETURNING id",
      [`mcp-${randomUUID()}`],
    )).rows[0].id;
    userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'本人','optimizer') RETURNING id", [workspaceId],
    )).rows[0].id;
    adminUserId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'管理员','admin') RETURNING id", [workspaceId],
    )).rows[0].id;
    await pool.query(
      "INSERT INTO workspace_memberships(workspace_id,identity_id,user_id,role,is_active) VALUES($1,$2,$3,'optimizer',true)",
      [workspaceId, identityId, userId]);

    token = randomUUID() + randomUUID();
    await pool.query(
      `INSERT INTO auth_sessions(identity_id, active_workspace_id, token_hash, expires_at)
       VALUES($1,$2,$3, now() + INTERVAL '1 hour')`,
      [identityId, workspaceId, hashOf(token)]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM auth_sessions WHERE identity_id=$1", [identityId]);
    await pool.query("DELETE FROM identity_passwords WHERE identity_id=$1", [identityId]);
    await pool.query("DELETE FROM workspace_memberships WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM users WHERE workspace_id=$1", [workspaceId]);
    await pool.query("DELETE FROM workspaces WHERE id=$1", [workspaceId]);
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]);
    await pool.end();
  });

  it("says false while the identity has no password row at all", async () => {
    // 没有密码行（buc/guest 就是这种）→ 不该提示他去改一个不存在的密码。
    expect(await passwords.mustChangePassword(identityId)).toBe(false);
    expect(await viaSession()).toBe(false);
  });

  it("says true right after an admin sets the initial password", async () => {
    await passwords.setPassword(identityId, "admin-issued-secret", adminUserId);
    expect(await passwords.mustChangePassword(identityId), "仓储方法").toBe(true);
    expect(await viaSession(), "会话视图").toBe(true);
  });

  it("says false once the person changes it themselves", async () => {
    await passwords.setPassword(identityId, "my-own-longer-secret", userId);
    expect(await passwords.mustChangePassword(identityId), "仓储方法").toBe(false);
    expect(await viaSession(), "会话视图").toBe(false);
  });

  it("treats an unknown setter as still needing a change", async () => {
    // updated_by 为空 = 不知道是谁设的，按最保守解：当作还在用别人给的密码。
    await pool.query("UPDATE identity_passwords SET updated_by=NULL WHERE identity_id=$1", [identityId]);
    expect(await passwords.mustChangePassword(identityId), "仓储方法").toBe(true);
    expect(await viaSession(), "会话视图").toBe(true);
  });
});
