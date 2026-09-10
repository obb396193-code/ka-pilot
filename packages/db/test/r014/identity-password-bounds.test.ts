import { createHash, randomUUID } from "node:crypto";
import { internalTestLoginRequestSchema } from "@ka/domain";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../src/migrate.js";
import { IdentityPasswordRepository, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "../../src/identity-password-repository.js";

// Synthetic data only. Execute on the explicitly selected isolated test database.
const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://ka:ka@127.0.0.1:55432/ka_be_be2check_test";

/**
 * Q-040：改密与开户的密码上限必须**等于登录线**（`internalTestLoginRequestSchema` 的 512）。
 *
 * 原来仓储放到 1024：存得下 ≠ 登得上。设一个 513 位的密码，改密成功、下次登录被登录契约
 * 挡在门外，人就把自己锁死了，而且错在「上次改密」那一步、报在「这次登录」那一步。
 * 两个上限分头写就会各走各的，所以这里把它们钉在一起。
 */
describe("password bounds stay pinned to the login contract (real PostgreSQL)", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const passwords = new IdentityPasswordRepository(pool);
  let workspaceId = "";
  let identityId = "";
  let userId = "";
  let token = "";

  const hashOf = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
  const auth = () => ({
    workspaceId, userId, role: "optimizer" as const, workspaceKind: "personal" as const,
    scope: { kind: "explicit_accounts" as const, accounts: [] },
  });

  beforeAll(async () => {
    await runMigrations({ databaseUrl });
    workspaceId = (await pool.query(
      "INSERT INTO workspaces(name,kind) VALUES($1,'personal') RETURNING id", [`q040-${randomUUID()}`],
    )).rows[0].id;
    identityId = (await pool.query(
      "INSERT INTO auth_identities(provider,provider_subject,display_name) VALUES('internal_test',$1,'合成用户') RETURNING id",
      [`q040-${randomUUID()}`],
    )).rows[0].id;
    userId = (await pool.query(
      "INSERT INTO users(workspace_id,name,role) VALUES($1,'本人','optimizer') RETURNING id", [workspaceId],
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
    // 只删这个用例自己建的身份，不按前缀批量删——那会连累别的用例的行。
    await pool.query("DELETE FROM auth_identities WHERE id=$1", [identityId]);
    await pool.end();
  });

  it("caps at exactly what the login wire contract will still accept", () => {
    const login = (password: string): boolean =>
      internalTestLoginRequestSchema.safeParse({ provider: "internal_test", username: "someone", password }).success;
    // 上限那一位登录线还收；再多一位就不收了——这两句一起说明 512 不是随手挑的数。
    expect(login("a".repeat(MAX_PASSWORD_LENGTH))).toBe(true);
    expect(login("a".repeat(MAX_PASSWORD_LENGTH + 1))).toBe(false);
  });

  it("refuses an initial password longer than the login line", async () => {
    await expect(passwords.setPassword(identityId, "a".repeat(MAX_PASSWORD_LENGTH + 1), userId))
      .rejects.toThrow(/invalid_input/);
    await expect(passwords.setPassword(identityId, "a".repeat(MIN_PASSWORD_LENGTH - 1), userId))
      .rejects.toThrow(/invalid_input/);
    // 正好卡在上限的仍然可用：收紧的是「登不上的那一段」，不是合法长度。
    await expect(passwords.setPassword(identityId, "a".repeat(MAX_PASSWORD_LENGTH), userId)).resolves.toBeDefined();
  });

  it("refuses a self-service change to a password that could never log in", async () => {
    await expect(passwords.change(auth(), identityId, hashOf(token), {
      currentPassword: "a".repeat(MAX_PASSWORD_LENGTH), newPassword: "b".repeat(MAX_PASSWORD_LENGTH + 1),
    }, null)).rejects.toThrow(/invalid_input/);
    const changed = await passwords.change(auth(), identityId, hashOf(token), {
      currentPassword: "a".repeat(MAX_PASSWORD_LENGTH), newPassword: "b".repeat(MAX_PASSWORD_LENGTH),
    }, null);
    expect(changed.changedAt).toBeDefined();
    // 改完还得真能登上：verify 与登录走同一套 KDF。
    expect(await passwords.verify(identityId, "b".repeat(MAX_PASSWORD_LENGTH))).toBe(true);
  });
});
